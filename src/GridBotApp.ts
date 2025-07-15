/**
 * GridBot Application - Main Application Class
 * 
 * This is the main application class that orchestrates all components
 * and provides lifecycle management for the GridBot application.
 * 
 * Features:
 * - Component orchestration and dependency injection
 * - Graceful shutdown handling
 * - Application lifecycle management
 * - Error handling and recovery
 * - Signal handling for production environments
 */

import { EventEmitter } from 'events';
import { z } from 'zod';

import { BotConfigSchema } from './config/schema';
import { ConfigLoader } from './config/ConfigLoader';
import { BinanceService } from './services/BinanceService';
import { StrategyEngine } from './services/StrategyEngine';
import { NotificationService } from './services/NotificationService';
import { ReportService } from './services/ReportService';
import { Backtester } from './services/Backtester';
import { PaperTrader } from './services/PaperTrader';
import { LiveTrader } from './services/LiveTrader';
import { Logger } from './utils/logger';
import { TradingError, ConfigError } from './utils/errors';
import { BacktestConfig } from './types/backtest';

type BotConfigType = z.infer<typeof BotConfigSchema>;

/**
 * Application state enum
 */
export enum AppState {
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
}

/**
 * Application options interface
 */
export interface AppOptions {
  configPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
  mode?: 'live' | 'paper' | 'backtest';
  startDate?: string;
  endDate?: string;
}

/**
 * Health status interface
 */
export interface HealthStatus {
  state: AppState;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  config: {
    tradeMode: string;
    exchange: string;
    symbolsCount: number;
  } | null;
  services: {
    binance: boolean;
    strategy: boolean;
    notifications: boolean;
    reports: boolean;
  };
  activeTrader: string | null;
}

/**
 * GridBot Application Main Class
 * 
 * Orchestrates all components and provides lifecycle management
 */
export class GridBotApp extends EventEmitter {
  private logger: Logger;
  private configLoader: ConfigLoader;
  private binanceService?: BinanceService;
  private strategyEngine?: StrategyEngine;
  private notificationService?: NotificationService;
  private reportService?: ReportService;
  private backtester?: Backtester;
  private paperTrader?: PaperTrader;
  private liveTrader?: LiveTrader;
  
  private state: AppState = AppState.INITIALIZING;
  private config: BotConfigType | null = null;
  private startTime: number = Date.now();
  private shutdownInitiated: boolean = false;
  
  /**
   * Constructor
   * @param options Application options
   */
  constructor(private options: AppOptions = {}) {
    super();
    
    // Validate options
    this.validateOptions(options);
    
    this.logger = Logger.getInstance();
    this.configLoader = new ConfigLoader(this.options.configPath);
    
    // Setup process signal handlers
    this.setupSignalHandlers();
    
    this.logger.info('GridBotApp instance created', { 
      options: this.options
    });
  }

  /**
   * Validate application options
   */
  private validateOptions(options: AppOptions): void {
    if (options.mode && !['live', 'paper', 'backtest'].includes(options.mode)) {
      throw new Error(`Invalid mode: ${options.mode}. Must be one of: live, paper, backtest`);
    }
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    try {
      this.setState(AppState.INITIALIZING);
      this.logger.info('Initializing GridBot application...');

      // Load configuration
      await this.loadConfiguration();

      // Initialize core services
      await this.initializeServices();

      // Initialize traders based on mode
      await this.initializeTraders();

      this.setState(AppState.READY);
      this.emit('initialized');
      
      this.logger.info('GridBot application initialized successfully');
      
    } catch (error) {
      this.setState(AppState.ERROR);
      this.logger.error('Failed to initialize GridBot application:', error);
      this.emit('error', error);
      
      // If it's already a ConfigError or TradingError, re-throw it directly
      if (error instanceof ConfigError || error instanceof TradingError) {
        throw error;
      }
      
      throw error;
    }
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    try {
      if (this.state !== AppState.READY) {
        throw new TradingError(`Cannot start application in state: ${this.state}`);
      }

      this.setState(AppState.RUNNING);
      this.logger.info('Starting GridBot application...');

      // Determine the actual mode to use
      const mode = this.options.mode || (this.config ? this.config.tradeMode : 'live');

      // Start the appropriate trader based on mode
      if (mode === 'backtest') {
        if (!this.backtester) {
          throw new TradingError('Backtester not initialized');
        }
        await this.runBacktest();
      } else if (mode === 'paper' || mode === 'papertrade') {
        if (!this.paperTrader) {
          throw new TradingError('Paper trader not initialized');
        }
        await this.startPaperTrader();
      } else if (mode === 'live') {
        if (!this.liveTrader) {
          throw new TradingError('Live trader not initialized');
        }
        await this.startLiveTrader();
      } else {
        throw new TradingError(`Unknown trade mode: ${mode}`);
      }

      this.emit('started');
      this.logger.info('GridBot application started successfully');
      
    } catch (error) {
      this.setState(AppState.ERROR);
      this.logger.error('Failed to start GridBot application:', error);
      
      // Send notification on startup failure
      if (this.notificationService) {
        try {
          await this.notificationService.sendNotification(
            `GridBot startup failed: ${error instanceof Error ? error.message : error}`,
            'error'
          );
        } catch (notificationError) {
          this.logger.error('Failed to send startup failure notification:', notificationError);
        }
      }
      
      this.emit('error', error);
      
      // If it's already a TradingError, re-throw it directly
      if (error instanceof TradingError) {
        throw error;
      }
      
      throw new TradingError(`Failed to start application: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Stop the application
   */
  public async stop(): Promise<void> {
    try {
      if (this.shutdownInitiated) {
        this.logger.warn('Shutdown already in progress');
        return;
      }

      this.shutdownInitiated = true;
      this.setState(AppState.STOPPING);
      this.logger.info('Stopping GridBot application...');

      // Stop active trader
      if (this.liveTrader) {
        await this.liveTrader.stop();
      }
      if (this.paperTrader) {
        await this.paperTrader.stop();
      }
      if (this.backtester) {
        // Backtester doesn't have a stop method, just clear it
        delete this.backtester;
      }

      // Cleanup services
      if (this.binanceService) {
        // BinanceService doesn't have cleanup method in current implementation
        delete this.binanceService;
      }

      this.setState(AppState.STOPPED);
      this.emit('stopped');
      
      this.logger.info('GridBot application stopped successfully');
      
    } catch (error) {
      this.setState(AppState.ERROR);
      this.logger.error('Failed to stop GridBot application:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get current application state
   */
  public getState(): AppState {
    return this.state;
  }

  /**
   * Get loaded configuration
   */
  public getConfig(): BotConfigType | null {
    return this.config;
  }

  /**
   * Get health status
   */
  public getHealthStatus(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    
    return {
      state: this.state,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsage,
      config: this.config ? {
        tradeMode: this.config.tradeMode,
        exchange: this.config.exchange,
        symbolsCount: this.config.symbols.length
      } : null,
      services: {
        binance: !!this.binanceService,
        strategy: !!this.strategyEngine,
        notifications: !!this.notificationService,
        reports: !!this.reportService
      },
      activeTrader: this.getActiveTrader()
    };
  }

  /**
   * Load configuration
   */
  private async loadConfiguration(): Promise<void> {
    try {
      this.config = await this.configLoader.loadConfig();
      
      this.logger.info('Configuration loaded successfully', {
        tradeMode: this.config.tradeMode,
        exchange: this.config.exchange,
        symbolsCount: this.config.symbols.length
      });
      
    } catch (error) {
      throw new ConfigError(`Failed to load configuration: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Initialize core services
   */
  private async initializeServices(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    try {
      this.logger.info('Initializing services...');

      // Initialize Binance service
      this.binanceService = new BinanceService(this.config);

      // Initialize Strategy Engine
      this.strategyEngine = new StrategyEngine(this.config);

      // Initialize Notification Service
      this.notificationService = new NotificationService(this.config);

      // Initialize Report Service
      this.reportService = new ReportService(this.config.logging.reportDirectory);

      this.logger.info('All services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize services', { error });
      throw new TradingError(`Failed to initialize services: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Initialize traders based on mode
   */
  private async initializeTraders(): Promise<void> {
    if (!this.config || !this.binanceService || !this.strategyEngine || !this.reportService) {
      throw new Error('Required services not initialized');
    }

    try {
      // Initialize all traders so they're available for different modes
      this.backtester = new Backtester(
        this.config,
        this.binanceService,
        this.strategyEngine,
        this.reportService
      );

      this.paperTrader = new PaperTrader(
        this.config,
        this.binanceService,
        this.strategyEngine,
        this.notificationService!,
        this.reportService
      );

      this.liveTrader = new LiveTrader(
        this.config,
        this.binanceService,
        this.strategyEngine,
        this.notificationService!,
        this.reportService
      );

      this.logger.info('All traders initialized successfully');
      
    } catch (error) {
      throw new TradingError(`Failed to initialize traders: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Run backtest
   */
  private async runBacktest(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    try {
      this.logger.info('Starting backtest...');
      
      // Create BacktestConfig from options and config
      const startDate = this.options.startDate || '2024-01-01';
      const endDate = this.options.endDate || '2024-01-31';
      
      const backtestConfig: BacktestConfig = {
        startTime: new Date(startDate).getTime(),
        endTime: new Date(endDate).getTime(),
        symbols: this.config.symbols.map(s => s.pair),
        interval: '1m',
        initialBalance: this.config.maxBudget.amount,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 5
      };
      
      const results = await this.backtester!.runBacktest(backtestConfig);
      
      // Set state to STOPPED after backtest completes
      this.setState(AppState.STOPPED);
      this.emit('backtestCompleted', results);
      this.logger.info('Backtest completed successfully');
      
    } catch (error) {
      throw new TradingError(`Backtest failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Start paper trader
   */
  private async startPaperTrader(): Promise<void> {
    try {
      this.logger.info('Starting paper trader...');
      
      this.paperTrader!.on('order-filled', (order: any) => {
        this.emit('orderFilled', order);
        this.logger.info('Paper trade order filled', { order });
      });

      this.paperTrader!.on('profit-realized', (profit: number, symbol: string) => {
        this.emit('profitRealized', { profit, symbol });
        this.logger.info('Paper trade profit realized', { profit, symbol });
      });

      this.paperTrader!.on('error', (error: any) => {
        this.emit('traderError', error);
        this.logger.error('Paper trader error:', error);
      });

      this.paperTrader!.on('status-update', (status: string) => {
        this.emit('statusUpdate', status);
        this.logger.info('Paper trader status update', { status });
      });

      await this.paperTrader!.start();
      
    } catch (error) {
      throw new TradingError(`Paper trader failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Start live trader
   */
  private async startLiveTrader(): Promise<void> {
    try {
      this.logger.info('Starting live trader...');
      
      // Note: Current LiveTrader doesn't extend EventEmitter
      // Just start it and handle any errors
      await this.liveTrader!.start();
      
    } catch (error) {
      throw new TradingError(`Live trader failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get active trader name
   */
  private getActiveTrader(): string | null {
    if (!this.config) return null;
    
    const mode = this.options.mode || this.config.tradeMode;
    switch (mode) {
      case 'live':
        return 'LiveTrader';
      case 'paper':
      case 'papertrade':
        return 'PaperTrader'; 
      case 'backtest':
        return 'Backtester';
      default:
        return null;
    }
  }

  /**
   * Setup process signal handlers
   */
  private setupSignalHandlers(): void {
    // Setup signal handlers only in non-test environment
    if (process.env.NODE_ENV !== 'test') {
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        this.logger.info('Received SIGINT. Shutting down gracefully...');
        await this.handleShutdown();
      });

      process.on('SIGTERM', async () => {
        this.logger.info('Received SIGTERM. Shutting down gracefully...');
        await this.handleShutdown();
      });

      // Handle uncaught exceptions
      process.on('uncaughtException', async (error: Error) => {
        this.logger.error('Uncaught exception:', error);
        
        if (this.notificationService) {
          await this.notificationService.sendNotification(
            `Critical error: ${error.message}`,
            'error'
          );
        }
        
        await this.handleShutdown();
        process.exit(1);
      });

      // Handle unhandled promise rejections
      process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
        this.logger.error('Unhandled promise rejection:', reason);
        
        if (this.notificationService) {
          await this.notificationService.sendNotification(
            `Unhandled promise rejection: ${reason}`,
            'error'
          );
        }
        
        await this.handleShutdown();
        process.exit(1);
      });
    }
  }

  /**
   * Handle shutdown process
   */
  private async handleShutdown(): Promise<void> {
    try {
      await this.stop();
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Set application state and emit event
   */
  private setState(newState: AppState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChanged', { from: oldState, to: newState });
    
    this.logger.debug('Application state changed', {
      from: oldState,
      to: newState
    });
  }
}

export default GridBotApp;
