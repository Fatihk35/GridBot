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
import { StatusMonitor } from './services/StatusMonitor';
import { Logger } from './utils/logger';
import { TradingError, ConfigError } from './utils/errors';
import { BacktestConfig } from './types/backtest';
import { TradingSessionInfo } from './types/monitoring';

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
  private statusMonitor?: StatusMonitor;
  
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

      // Initialize strategies for all symbols *before* starting traders
      await this.initializeAllStrategies();

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
      this.logger.info(`GridBot started in ${mode} mode`);

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

      // Stop status monitor
      if (this.statusMonitor) {
        this.statusMonitor.stop();
      }

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

      // Initialize Status Monitor
      this.statusMonitor = new StatusMonitor(this.config, {
        displayInterval: 60000, // 1 minute
        showSymbolDetails: true,
        showStrategyMetrics: true,
        showSystemMetrics: true
      });

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

      // Startup data collection for live and paper modes
      const mode = this.options.mode || this.config.tradeMode;
      if (mode === 'live' || mode === 'paper' || mode === 'papertrade') {
        await this.collectStartupData();
      }

      this.logger.info('All traders initialized successfully');
      
    } catch (error) {
      throw new TradingError(`Failed to initialize traders: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Collect startup data and display summary
   */
  private async collectStartupData(): Promise<void> {
    if (!this.config || !this.binanceService || !this.strategyEngine) {
      throw new Error('Required services not initialized');
    }

    this.logger.info('📊 Collecting startup data and displaying trading summary...');

    try {
      // Record initial account balances for P&L tracking
      const startupTime = Date.now();
      let initialAccountValue = 0;
      
      try {
        // Get initial balances for baseline tracking
        const accountInfo = await this.binanceService.getAccountInfo();
        if (accountInfo && accountInfo.balances) {
          for (const balance of accountInfo.balances) {
            if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
              const total = parseFloat(balance.free) + parseFloat(balance.locked);
              this.logger.info(`💰 Initial Balance: ${balance.asset} = ${total.toFixed(8)}`);
              
              // Calculate USDT equivalent for initial portfolio value
              if (balance.asset === 'USDT') {
                initialAccountValue += total;
              }
              // TODO: Add price conversion for other assets
            }
          }
        }
      } catch (error) {
        this.logger.warn('Could not fetch initial account balances:', error);
      }

      this.logger.info(`💼 Starting Portfolio Value: ~${initialAccountValue.toFixed(2)} USDT`);

      // Get strategy status for all symbols (strategies should already be initialized by initializeAllStrategies)
      const symbolResults: Array<{
        symbol: string;
        currentPrice: number;
        gridLevels: number;
        eligible: boolean;
        ema200: number;
        gridInterval: number;
        volatilityStatus: string;
        eligibilityReason?: string;
      }> = [];

      for (const symbolConfig of this.config.symbols) {
        const symbol = symbolConfig.pair;
        
        this.logger.info(`📈 Getting strategy status for ${symbol}...`);
        
        // Get strategy state and metrics (strategies should already be initialized)
        const state = this.strategyEngine.getStrategyState(symbol);
        const metrics = this.strategyEngine.getMetrics(symbol);

        // Determine eligibility status and reason
        let eligibilityReason = 'Ready for trading';
        let volatilityStatus = 'Unknown';
        let currentPrice = 0;
        
        if (metrics?.volatilityAnalysis) {
          volatilityStatus = metrics.volatilityAnalysis.volatileBarRatio.toFixed(2);
          if (!metrics.isEligibleForTrading && metrics.volatilityAnalysis.reason) {
            eligibilityReason = metrics.volatilityAnalysis.reason;
          }
        }

        if (state) {
          currentPrice = state.currentPrice;
        }

        // Store results for summary
        const result = {
          symbol,
          currentPrice,
          gridLevels: state?.gridLevels.length || 0,
          eligible: metrics?.isEligibleForTrading || false,
          ema200: state?.ema200 || 0,
          gridInterval: state?.gridInterval || 0,
          volatilityStatus
        };

        if (!metrics?.isEligibleForTrading && eligibilityReason !== 'Ready for trading') {
          (result as any).eligibilityReason = eligibilityReason;
        }

        symbolResults.push(result);

        // Log detailed status
        this.logger.info(`✅ Strategy status retrieved for ${symbol}`, {
          currentPrice: currentPrice.toFixed(6),
          ema200: (state?.ema200 || 0).toFixed(6),
          gridLevels: state?.gridLevels.length || 0,
          gridInterval: (state?.gridInterval || 0).toFixed(6),
          eligible: metrics?.isEligibleForTrading || false,
          volatilityRatio: metrics?.volatilityAnalysis?.volatileBarRatio.toFixed(3),
          totalTrades: metrics?.totalTrades || 0,
          winRate: `${((metrics?.winRate || 0) * 100).toFixed(1)}%`
        });
      }

      // Display comprehensive startup summary
      this.displayStartupSummary(symbolResults, initialAccountValue, startupTime);

      // Initialize status monitor with required services and 1-minute intervals
      if (this.statusMonitor) {
        this.statusMonitor.initialize(this.strategyEngine, this.binanceService);
      }

      this.logger.info('🎯 Startup data collection completed successfully');

    } catch (error) {
      this.logger.error('❌ Failed to collect startup data:', error);
      throw new TradingError(`Startup data collection failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Display comprehensive startup summary
   */
  private displayStartupSummary(
    symbolResults: Array<{
      symbol: string;
      currentPrice: number;
      gridLevels: number;
      eligible: boolean;
      ema200: number;
      gridInterval: number;
      volatilityStatus: string;
      eligibilityReason?: string;
    }>,
    initialAccountValue: number,
    startupTime: number
  ): void {
    const eligibleSymbols = symbolResults.filter(r => r.eligible);
    const totalGridLevels = symbolResults.reduce((sum, r) => sum + r.gridLevels, 0);
    
    console.log('\n🚀 ===== GRIDBOT STARTUP SUMMARY =====');
    console.log(`⏰ Startup Time: ${new Date(startupTime).toLocaleString()}`);
    console.log(`💼 Initial Portfolio: ${initialAccountValue.toFixed(2)} USDT`);
    console.log(`📊 Trading Mode: ${this.config?.tradeMode?.toUpperCase() || 'UNKNOWN'}`);
    console.log(`🎯 Symbols Analyzed: ${symbolResults.length}`);
    console.log(`✅ Eligible for Trading: ${eligibleSymbols.length}`);
    console.log(`🔢 Total Grid Levels: ${totalGridLevels}`);
    
    console.log('\n📈 SYMBOL STATUS:');
    console.log('━'.repeat(80));
    console.log('Symbol      | Price      | EMA200     | Grids | Status | Volatility');
    console.log('━'.repeat(80));
    
    for (const result of symbolResults) {
      const status = result.eligible ? '✅ Ready' : '❌ Not Ready';
      const reason = result.eligibilityReason ? ` (${result.eligibilityReason})` : '';
      
      console.log(
        `${result.symbol.padEnd(11)} | ` +
        `${result.currentPrice.toFixed(4).padEnd(10)} | ` +
        `${result.ema200.toFixed(4).padEnd(10)} | ` +
        `${result.gridLevels.toString().padEnd(5)} | ` +
        `${status.padEnd(6)} | ` +
        `${result.volatilityStatus}${reason}`
      );
    }
    
    console.log('━'.repeat(80));
    
    if (eligibleSymbols.length > 0) {
      console.log(`\n🟢 Ready to start trading with ${eligibleSymbols.length} eligible symbols!`);
      console.log(`📊 Monitoring will display every minute with P&L updates.`);
    } else {
      console.log(`\n🟡 No symbols are currently eligible for trading.`);
      console.log(`🔍 Check volatility conditions and market data quality.`);
    }
    
    console.log('=====================================\n');
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
        
        // Send event to status monitor
        if (this.statusMonitor) {
          this.statusMonitor.addEvent('trade_executed', order.symbol, order, 
            `Trade executed: ${order.side} ${order.quantity} ${order.symbol} at ${order.price}`);
        }
      });

      this.paperTrader!.on('profit-realized', (profit: number, symbol: string) => {
        this.emit('profitRealized', { profit, symbol });
        this.logger.info('Paper trade profit realized', { profit, symbol });
        
        // Send event to status monitor
        if (this.statusMonitor) {
          const eventType = profit > 0 ? 'profit_realized' : 'loss_realized';
          this.statusMonitor.addEvent(eventType, symbol, { profit }, 
            `${profit > 0 ? 'Profit' : 'Loss'} realized: $${profit.toFixed(2)} on ${symbol}`);
        }
      });

      this.paperTrader!.on('error', (error: any) => {
        this.emit('traderError', error);
        this.logger.error('Paper trader error:', error);
        
        // Send event to status monitor
        if (this.statusMonitor) {
          this.statusMonitor.addEvent('error_occurred', undefined, error, 
            `Paper trader error: ${error instanceof Error ? error.message : error}`);
        }
      });

      this.paperTrader!.on('status-update', (status: string) => {
        this.emit('statusUpdate', status);
        this.logger.info('Paper trader status update', { status });
        
        // Send event to status monitor
        if (this.statusMonitor) {
          this.statusMonitor.addEvent('status_update', undefined, { status }, 
            `Paper trader status: ${status}`);
        }
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
   * Get initial prices for all symbols
   */
  private getInitialPrices(): Record<string, number> {
    if (!this.strategyEngine || !this.config) {
      return {};
    }

    const initialPrices: Record<string, number> = {};
    
    for (const symbolConfig of this.config.symbols) {
      const state = this.strategyEngine.getStrategyState(symbolConfig.pair);
      if (state) {
        initialPrices[symbolConfig.pair] = state.currentPrice;
      }
    }

    return initialPrices;
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

  /**
   * Initialize strategies for all configured symbols.
   * This method ensures that historical data is fetched and strategies are ready
   * before any trading activity begins.
   */
  private async initializeAllStrategies(): Promise<void> {
    if (!this.config || !this.strategyEngine || !this.binanceService) {
      throw new Error('Required services not initialized');
    }

    // Get minimum data requirements from strategy engine
    const dataRequirements = this.strategyEngine.getMinimumDataRequirements();
    
    this.logger.info('Strategy data requirements determined', {
      atr: dataRequirements.atr,
      dailyBarDiff: dataRequirements.dailyBarDiff,
      ema: dataRequirements.ema,
      recommended: dataRequirements.recommended
    });

    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.pair;
      
      try {
        // Use recommended amount to ensure all calculations work properly
        const requiredBars = dataRequirements.recommended;
        
        this.logger.info(`Fetching ${requiredBars} initial bars for ${symbol}...`);
        
        // Fetch historical data with proper amount
        const historicalData = await this.fetchSufficientHistoricalData(
          symbol, 
          requiredBars,
          this.config.strategySettings.timeframe || '1m'
        );

        if (historicalData.length > 0) {
          // Convert BinanceKline[] to CandlestickData[]
          const candlestickData = historicalData.map(kline => ({
            open: kline.open,
            high: kline.high,
            low: kline.low,
            close: kline.close,
            volume: kline.volume,
            timestamp: kline.openTime
          }));

          // Validate data sufficiency before initializing strategy
          const dataValidation = this.strategyEngine.validateHistoricalDataSufficiency(candlestickData);
          
          if (!dataValidation.sufficient) {
            this.logger.warn(`Insufficient data for full strategy initialization for ${symbol}`, {
              available: dataValidation.available,
              requirements: dataValidation.requirements,
              missingFor: dataValidation.missingFor
            });
          }

          // Initialize strategy with the converted data
          this.strategyEngine.initializeStrategy(symbol, candlestickData);
          this.logger.info(`Strategy initialized for ${symbol}`, {
            barsProvided: candlestickData.length,
            dataSufficient: dataValidation.sufficient,
            missingFor: dataValidation.missingFor
          });
        } else {
          this.logger.warn(`No historical data available for ${symbol}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch initial data for ${symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue with other symbols instead of failing completely
      }
    }
  }

  /**
   * Fetch sufficient historical data with chunking if needed
   */
  private async fetchSufficientHistoricalData(
    symbol: string, 
    requiredBars: number, 
    timeframe: string
  ): Promise<any[]> {
    if (!this.binanceService) {
      throw new Error('BinanceService not initialized');
    }

    const maxBarsPerRequest = 1000; // Binance limit
    
    if (requiredBars <= maxBarsPerRequest) {
      // Single request is sufficient
      return await this.binanceService.getHistoricalKlines({
        symbol,
        interval: timeframe as any,
        limit: requiredBars
      });
    }

    // Need multiple requests for large amounts of data
    this.logger.info(`Fetching ${requiredBars} bars in chunks for ${symbol}`);
    
    const allData: any[] = [];
    let remainingBars = requiredBars;
    let endTime = Date.now();

    while (remainingBars > 0 && allData.length < requiredBars) {
      const barsToFetch = Math.min(remainingBars, maxBarsPerRequest);
      
      try {
        const chunkData = await this.binanceService.getHistoricalKlines({
          symbol,
          interval: timeframe as any,
          limit: barsToFetch,
          endTime
        });

        if (chunkData.length === 0) {
          this.logger.warn(`No more data available for ${symbol} after ${allData.length} bars`);
          break;
        }

        // Prepend to maintain chronological order (oldest first)
        allData.unshift(...chunkData);
        
        // Update endTime to the start of the oldest bar we just fetched
        if (chunkData[0]) {
          endTime = chunkData[0].openTime - 1;
        }
        remainingBars -= chunkData.length;

        this.logger.debug(`Fetched ${chunkData.length} bars for ${symbol}, total: ${allData.length}/${requiredBars}`);

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        this.logger.error(`Failed to fetch chunk for ${symbol}`, { error });
        break;
      }
    }

    this.logger.info(`Fetched total ${allData.length} bars for ${symbol} (requested: ${requiredBars})`);
    return allData;
  }

}

export default GridBotApp;
