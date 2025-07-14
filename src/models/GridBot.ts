import { StrategyEngine, TradingSignal } from '../services/StrategyEngine';
import { BinanceService } from '../services/BinanceService';
import { ConfigLoader } from '../config/ConfigLoader';
import { BotConfigType } from '../config/schema';
import { Logger } from '../utils/logger';
import { CandlestickData } from '../utils/indicators';
import { z } from 'zod';

/**
 * GridBot execution status
 */
export interface GridBotStatus {
  isRunning: boolean;
  startTime: number;
  activeSymbols: string[];
  totalTrades: number;
  totalProfit: number;
  lastUpdateTime: number;
  errors: string[];
}

/**
 * Order execution result
 */
export interface OrderResult {
  success: boolean;
  orderId?: number;
  price?: number;
  quantity?: number;
  error?: string;
  symbol: string;
  side: 'buy' | 'sell';
}

/**
 * GridBot main class - Orchestrates the entire grid trading system
 */
export class GridBot {
  private readonly config: BotConfigType;
  private readonly strategyEngine: StrategyEngine;
  private readonly binanceService: BinanceService;
  private readonly logger: Logger;
  
  private isRunning: boolean = false;
  private startTime: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private status: GridBotStatus;
  private readonly updateInterval: number = 60000; // 1 minute default

  constructor(config: BotConfigType) {
    this.config = config;
    this.logger = Logger.getInstance();
    
    // Initialize services
    this.binanceService = new BinanceService(this.config);
    this.strategyEngine = new StrategyEngine(this.config);
    
    // Initialize status
    this.status = {
      isRunning: false,
      startTime: 0,
      activeSymbols: [],
      totalTrades: 0,
      totalProfit: 0,
      lastUpdateTime: 0,
      errors: []
    };

    this.logger.info('GridBot initialized', {
      tradeMode: this.config.tradeMode,
      symbols: this.config.symbols.map(s => s.pair),
      maxBudget: this.config.maxBudget
    });
  }

  /**
   * Start the GridBot trading system
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('GridBot is already running');
      return;
    }

    try {
      this.logger.info('Starting GridBot...');
      
      // Initialize Binance connection
      await this.binanceService.initialize();
      
      // Initialize strategies for all configured symbols
      await this.initializeStrategies();
      
      // Start the main trading loop
      this.startTradingLoop();
      
      this.isRunning = true;
      this.startTime = Date.now();
      this.status.isRunning = true;
      this.status.startTime = this.startTime;
      this.status.activeSymbols = this.strategyEngine.getActiveSymbols();
      
      this.logger.info('GridBot started successfully', {
        activeSymbols: this.status.activeSymbols,
        updateInterval: this.updateInterval
      });
      
    } catch (error) {
      const errorMessage = `Failed to start GridBot: ${String(error)}`;
      this.logger.error(errorMessage, { error });
      this.status.errors.push(errorMessage);
      throw error;
    }
  }

  /**
   * Stop the GridBot trading system
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('GridBot is not running');
      return;
    }

    try {
      this.logger.info('Stopping GridBot...');
      
      // Stop the trading loop
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
      // Cancel all open orders (in live mode)
      if (this.config.tradeMode === 'live') {
        await this.cancelAllOpenOrders();
      }
      
      this.isRunning = false;
      this.status.isRunning = false;
      
      this.logger.info('GridBot stopped successfully', {
        runDuration: Date.now() - this.startTime,
        totalTrades: this.status.totalTrades,
        totalProfit: this.status.totalProfit
      });
      
    } catch (error) {
      const errorMessage = `Error during GridBot shutdown: ${String(error)}`;
      this.logger.error(errorMessage, { error });
      this.status.errors.push(errorMessage);
      throw error;
    }
  }

  /**
   * Initialize trading strategies for all configured symbols
   */
  private async initializeStrategies(): Promise<void> {
    this.logger.info('Initializing strategies for all symbols...');

    for (const symbolConfig of this.config.symbols) {
      try {
        this.logger.info(`Initializing strategy for ${symbolConfig.pair}`);
        
        // Get historical data for the symbol
        const historicalData = await this.binanceService.getHistoricalData(
          symbolConfig.pair,
          '1h', // 1-hour intervals
          300   // 300 periods (about 12.5 days)
        );
        
        // Initialize strategy
        this.strategyEngine.initializeStrategy(symbolConfig.pair, historicalData);
        
        this.logger.info(`Strategy initialized for ${symbolConfig.pair}`, {
          dataPoints: historicalData.length,
          currentPrice: historicalData[historicalData.length - 1]?.close
        });
        
      } catch (error) {
        const errorMessage = `Failed to initialize strategy for ${symbolConfig.pair}: ${String(error)}`;
        this.logger.error(errorMessage, { error });
        this.status.errors.push(errorMessage);
        // Continue with other symbols instead of failing completely
      }
    }
  }

  /**
   * Start the main trading loop
   */
  private startTradingLoop(): void {
    this.intervalId = setInterval(async () => {
      try {
        await this.executeTradingCycle();
      } catch (error) {
        const errorMessage = `Error in trading cycle: ${String(error)}`;
        this.logger.error(errorMessage, { error });
        this.status.errors.push(errorMessage);
      }
    }, this.updateInterval);
  }

  /**
   * Execute one complete trading cycle
   */
  private async executeTradingCycle(): Promise<void> {
    this.logger.debug('Executing trading cycle...');
    
    const activeSymbols = this.strategyEngine.getActiveSymbols();
    
    for (const symbol of activeSymbols) {
      try {
        await this.processSymbol(symbol);
      } catch (error) {
        this.logger.error(`Error processing symbol ${symbol}`, { error });
        this.status.errors.push(`Error processing ${symbol}: ${String(error)}`);
      }
    }
    
    this.status.lastUpdateTime = Date.now();
    this.updateStatusMetrics();
  }

  /**
   * Process trading logic for a single symbol
   */
  private async processSymbol(symbol: string): Promise<void> {
    this.logger.debug(`Processing symbol: ${symbol}`);
    
    // Get latest market data
    const latestCandle = await this.binanceService.getLatestCandle(symbol, '1h');
    const historicalData = await this.binanceService.getHistoricalData(symbol, '1h', 100);
    
    // Update strategy state
    this.strategyEngine.updateState(symbol, latestCandle, historicalData);
    
    // Get trading signals
    const signals = this.strategyEngine.getTradeSignals(symbol);
    
    // Execute buy signals
    for (const buySignal of signals.buy) {
      await this.executeBuySignal(buySignal);
    }
    
    // Execute sell signals
    for (const sellSignal of signals.sell) {
      await this.executeSellSignal(sellSignal);
    }
    
    // Check for filled orders and update positions
    await this.checkFilledOrders(symbol);
  }

  /**
   * Execute a buy signal
   */
  private async executeBuySignal(signal: TradingSignal): Promise<void> {
    this.logger.info('Executing buy signal', {
      symbol: signal.symbol,
      price: signal.price,
      quantity: signal.quantity,
      confidence: signal.confidence
    });
    
    try {
      let result: OrderResult;
      
      if (this.config.tradeMode === 'live') {
        // Execute real order
        const order = await this.binanceService.placeLimitOrder(
          signal.symbol,
          'BUY',
          signal.quantity,
          signal.price
        );
        
        result = {
          success: true,
          orderId: order.orderId,
          price: signal.price,
          quantity: signal.quantity,
          symbol: signal.symbol,
          side: 'buy'
        };
        
      } else {
        // Simulate order for backtest/paper trading
        result = {
          success: true,
          orderId: Date.now(), // Fake order ID
          price: signal.price,
          quantity: signal.quantity,
          symbol: signal.symbol,
          side: 'buy'
        };
      }
      
      if (result.success && result.orderId) {
        // Update strategy engine with filled order
        this.strategyEngine.markGridLevelFilled(
          signal.symbol,
          signal.gridLevel.index,
          signal.price,
          signal.quantity,
          result.orderId
        );
        
        this.status.totalTrades++;
        
        this.logger.info('Buy order executed successfully', {
          symbol: signal.symbol,
          orderId: result.orderId,
          price: result.price,
          quantity: result.quantity
        });
      }
      
    } catch (error) {
      const errorMessage = `Failed to execute buy signal for ${signal.symbol}: ${String(error)}`;
      this.logger.error(errorMessage, { error });
      this.status.errors.push(errorMessage);
    }
  }

  /**
   * Execute a sell signal
   */
  private async executeSellSignal(signal: TradingSignal): Promise<void> {
    this.logger.info('Executing sell signal', {
      symbol: signal.symbol,
      price: signal.price,
      quantity: signal.quantity,
      confidence: signal.confidence
    });
    
    try {
      let result: OrderResult;
      
      if (this.config.tradeMode === 'live') {
        // Execute real order
        const order = await this.binanceService.placeLimitOrder(
          signal.symbol,
          'SELL',
          signal.quantity,
          signal.price
        );
        
        result = {
          success: true,
          orderId: order.orderId,
          price: signal.price,
          quantity: signal.quantity,
          symbol: signal.symbol,
          side: 'sell'
        };
        
      } else {
        // Simulate order for backtest/paper trading
        result = {
          success: true,
          orderId: Date.now(), // Fake order ID
          price: signal.price,
          quantity: signal.quantity,
          symbol: signal.symbol,
          side: 'sell'
        };
      }
      
      if (result.success) {
        // Process completed trade
        this.strategyEngine.processCompletedTrade(
          signal.symbol,
          signal.gridLevel.index,
          signal.price,
          signal.quantity
        );
        
        this.status.totalTrades++;
        
        this.logger.info('Sell order executed successfully', {
          symbol: signal.symbol,
          orderId: result.orderId,
          price: result.price,
          quantity: result.quantity
        });
      }
      
    } catch (error) {
      const errorMessage = `Failed to execute sell signal for ${signal.symbol}: ${String(error)}`;
      this.logger.error(errorMessage, { error });
      this.status.errors.push(errorMessage);
    }
  }

  /**
   * Check for filled orders and update positions
   */
  private async checkFilledOrders(symbol: string): Promise<void> {
    if (this.config.tradeMode !== 'live') {
      return; // Only check real orders in live mode
    }
    
    try {
      // Get open orders for symbol
      const openOrders = await this.binanceService.getOpenOrders(symbol);
      
      // This is a simplified implementation
      // In a real system, you'd track order IDs and check their status
      // For now, we'll assume orders are filled if they're not in the open orders list
      
      this.logger.debug(`Checked filled orders for ${symbol}`, {
        openOrdersCount: openOrders.length
      });
      
    } catch (error) {
      this.logger.error(`Error checking filled orders for ${symbol}`, { error });
    }
  }

  /**
   * Cancel all open orders
   */
  private async cancelAllOpenOrders(): Promise<void> {
    this.logger.info('Cancelling all open orders...');
    
    const activeSymbols = this.strategyEngine.getActiveSymbols();
    
    for (const symbol of activeSymbols) {
      try {
        await this.binanceService.cancelAllOrders(symbol);
        this.logger.info(`Cancelled all orders for ${symbol}`);
      } catch (error) {
        this.logger.error(`Failed to cancel orders for ${symbol}`, { error });
      }
    }
  }

  /**
   * Update status metrics
   */
  private updateStatusMetrics(): void {
    const activeSymbols = this.strategyEngine.getActiveSymbols();
    let totalProfit = 0;
    
    for (const symbol of activeSymbols) {
      const metrics = this.strategyEngine.getMetrics(symbol);
      if (metrics) {
        totalProfit += metrics.totalProfit;
      }
    }
    
    this.status.totalProfit = totalProfit;
    this.status.activeSymbols = activeSymbols;
  }

  /**
   * Get current GridBot status
   */
  public getStatus(): GridBotStatus {
    return { ...this.status };
  }

  /**
   * Get detailed status for a specific symbol
   */
  public getSymbolStatus(symbol: string): {
    state?: any;
    metrics?: any;
  } {
    return {
      state: this.strategyEngine.getStrategyState(symbol),
      metrics: this.strategyEngine.getMetrics(symbol)
    };
  }

  /**
   * Force strategy recalculation for a symbol
   */
  public async recalculateStrategy(symbol: string): Promise<void> {
    this.logger.info(`Forcing strategy recalculation for ${symbol}`);
    
    try {
      // Get fresh historical data
      const historicalData = await this.binanceService.getHistoricalData(symbol, '1h', 300);
      
      // Reset and reinitialize strategy
      this.strategyEngine.resetStrategy(symbol);
      this.strategyEngine.initializeStrategy(symbol, historicalData);
      
      this.logger.info(`Strategy recalculated for ${symbol}`);
      
    } catch (error) {
      const errorMessage = `Failed to recalculate strategy for ${symbol}: ${String(error)}`;
      this.logger.error(errorMessage, { error });
      throw error;
    }
  }

  /**
   * Get profit/loss report
   */
  public getProfitLossReport(): {
    totalProfit: number;
    symbolBreakdown: Array<{
      symbol: string;
      profit: number;
      trades: number;
      winRate: number;
    }>;
  } {
    const activeSymbols = this.strategyEngine.getActiveSymbols();
    const symbolBreakdown: Array<{
      symbol: string;
      profit: number;
      trades: number;
      winRate: number;
    }> = [];
    
    let totalProfit = 0;
    
    for (const symbol of activeSymbols) {
      const metrics = this.strategyEngine.getMetrics(symbol);
      if (metrics) {
        totalProfit += metrics.totalProfit;
        symbolBreakdown.push({
          symbol,
          profit: metrics.totalProfit,
          trades: metrics.totalTrades,
          winRate: metrics.winRate
        });
      }
    }
    
    return {
      totalProfit,
      symbolBreakdown
    };
  }

  /**
   * Create GridBot instance from configuration file
   */
  public static async fromConfigFile(configPath?: string): Promise<GridBot> {
    const configLoader = new ConfigLoader(configPath);
    const config = await configLoader.loadConfig();
    return new GridBot(config);
  }
}

/**
 * GridBot factory function for easy initialization
 */
export async function createGridBot(configPath?: string): Promise<GridBot> {
  return GridBot.fromConfigFile(configPath);
}

export { GridBot as default };
