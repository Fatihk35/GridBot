/**
 * Backtesting Service Implementation
 * Comprehensive backtesting engine for grid trading strategies
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { BotConfigType } from '../config/schema';
import { BinanceService } from './BinanceService';
import { StrategyEngine } from './StrategyEngine';
import { ReportService } from './ReportService';
import { Logger } from '../utils/logger';
import { PerformanceCalculator } from '../utils/performance';
import { BinanceKline } from '../types/binance';

import {
  BacktestConfig,
  BacktestConfigSchema,
  BacktestResult,
  BacktestTrade,
  BacktestCandle,
  PortfolioSnapshot,
  SymbolPerformance,
  BacktestProgress,
  BacktestExecutionContext,
  OrderSimulationParams,
  OrderSimulationResult,
  HistoricalDataResult,
  DataSourceConfig,
  MarketDataStats
} from '../types/backtest';

/**
 * Portfolio manager for backtest execution
 */
class BacktestPortfolioManager {
  private baseBalances: Map<string, number> = new Map(); // BTC, ETH, etc.
  private quoteBalance: number; // USDT balance
  private quoteCurrency: string;
  private commissionRate: number;
  private portfolioHistory: PortfolioSnapshot[] = [];
  private unrealizedPnL: number = 0;
  private realizedPnL: number = 0;
  
  constructor(initialBalance: number, quoteCurrency: string, commissionRate: number) {
    this.quoteBalance = initialBalance;
    this.quoteCurrency = quoteCurrency;
    this.commissionRate = commissionRate;
  }

  /**
   * Execute a simulated buy order
   */
  executeBuy(symbol: string, quantity: number, price: number, commission: number): void {
    const symbolParts = symbol.split('/');
    const baseCurrency = symbolParts[0];
    if (!baseCurrency) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }
    
    const cost = quantity * price + commission;
    
    if (this.quoteBalance < cost) {
      throw new Error(`Insufficient ${this.quoteCurrency} balance for buy order`);
    }
    
    this.quoteBalance -= cost;
    const currentBase = this.baseBalances.get(baseCurrency) || 0;
    this.baseBalances.set(baseCurrency, currentBase + quantity);
  }

  /**
   * Execute a simulated sell order
   */
  executeSell(symbol: string, quantity: number, price: number, commission: number): number {
    const symbolParts = symbol.split('/');
    const baseCurrency = symbolParts[0];
    if (!baseCurrency) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }
    
    const currentBase = this.baseBalances.get(baseCurrency) || 0;
    
    if (currentBase < quantity) {
      throw new Error(`Insufficient ${baseCurrency} balance for sell order`);
    }
    
    const proceeds = quantity * price - commission;
    const profit = proceeds - (quantity * this.getAverageCost(baseCurrency, quantity));
    
    this.baseBalances.set(baseCurrency, currentBase - quantity);
    this.quoteBalance += proceeds;
    this.realizedPnL += profit;
    
    return profit;
  }

  /**
   * Calculate total portfolio value at current prices
   */
  calculateTotalValue(currentPrices: Map<string, number>): number {
    let totalValue = this.quoteBalance;
    
    for (const [baseCurrency, balance] of this.baseBalances) {
      if (balance > 0) {
        const symbol = `${baseCurrency}/${this.quoteCurrency}`;
        const price = currentPrices.get(symbol) || 0;
        totalValue += balance * price;
      }
    }
    
    return totalValue;
  }

  /**
   * Take portfolio snapshot
   */
  takeSnapshot(timestamp: number, currentPrices: Map<string, number>, initialBalance: number): void {
    const totalValue = this.calculateTotalValue(currentPrices);
    
    // Calculate unrealized PnL
    this.unrealizedPnL = 0;
    for (const [baseCurrency, balance] of this.baseBalances) {
      if (balance > 0) {
        const symbol = `${baseCurrency}/${this.quoteCurrency}`;
        const currentPrice = currentPrices.get(symbol) || 0;
        const currentValue = balance * currentPrice;
        const costBasis = balance * this.getAverageCost(baseCurrency, balance);
        this.unrealizedPnL += currentValue - costBasis;
      }
    }
    
    // Calculate drawdown
    const highWaterMark = this.portfolioHistory.length > 0 
      ? Math.max(...this.portfolioHistory.map(s => s.totalValue), totalValue)
      : totalValue;
    const drawdown = Math.max(0, highWaterMark - totalValue);
    const drawdownPercentage = highWaterMark > 0 ? drawdown / highWaterMark : 0;
    
    const snapshot: PortfolioSnapshot = {
      timestamp,
      totalValue,
      baseBalances: Object.fromEntries(this.baseBalances),
      quoteBalance: this.quoteBalance,
      unrealizedPnL: this.unrealizedPnL,
      realizedPnL: this.realizedPnL,
      drawdown,
      drawdownPercentage
    };
    
    this.portfolioHistory.push(snapshot);
  }

  /**
   * Get average cost basis for a currency (simplified - assumes FIFO)
   */
  private getAverageCost(baseCurrency: string, quantity: number): number {
    // Simplified: return current market price for cost basis calculation
    // In a real implementation, this would track actual purchase prices
    return 0; // This would need to be implemented with proper cost tracking
  }

  /**
   * Get portfolio history
   */
  getPortfolioHistory(): PortfolioSnapshot[] {
    return [...this.portfolioHistory];
  }

  /**
   * Get current balances
   */
  getCurrentBalances(): { baseBalances: Map<string, number>; quoteBalance: number } {
    return {
      baseBalances: new Map(this.baseBalances),
      quoteBalance: this.quoteBalance
    };
  }
}

/**
 * Order simulator for realistic trade execution
 */
class OrderSimulator {
  /**
   * Simulate order execution with slippage and market conditions
   */
  static simulateOrder(params: OrderSimulationParams): OrderSimulationResult {
    const { symbol, side, type, quantity, price, candle, slippagePercentage, commissionRate } = params;
    
    let executionPrice: number;
    let executed = false;
    let slippage = 0;
    let reason: string | undefined;

    if (type === 'MARKET') {
      // Market orders execute immediately with slippage
      executed = true;
      if (side === 'BUY') {
        executionPrice = candle.high; // Assume worst case for buy
        slippage = (executionPrice - candle.close) * quantity;
      } else {
        executionPrice = candle.low; // Assume worst case for sell
        slippage = (candle.close - executionPrice) * quantity;
      }
      slippage = Math.max(0, slippage); // Only positive slippage
    } else {
      // Limit orders execute only if price is reached
      if (side === 'BUY' && price && candle.low <= price) {
        executed = true;
        executionPrice = Math.min(price, candle.close);
        slippage = 0; // Limit orders have no slippage at limit price
      } else if (side === 'SELL' && price && candle.high >= price) {
        executed = true;
        executionPrice = Math.max(price, candle.close);
        slippage = 0;
      } else {
        executed = false;
        executionPrice = price || candle.close;
        reason = `Limit price not reached: ${side} @ ${price}, candle range: ${candle.low}-${candle.high}`;
      }
    }

    // Add configured slippage
    if (executed && slippagePercentage > 0) {
      const additionalSlippage = executionPrice * slippagePercentage;
      if (side === 'BUY') {
        executionPrice += additionalSlippage;
      } else {
        executionPrice -= additionalSlippage;
      }
      slippage += additionalSlippage * quantity;
    }

    const value = quantity * executionPrice;
    const commission = value * commissionRate;

    return {
      executed,
      executionPrice,
      executedQuantity: executed ? quantity : 0,
      slippage,
      commission: executed ? commission : 0,
      value: executed ? value : 0,
      ...(reason && { reason })
    };
  }
}

/**
 * Main Backtester class
 */
export class Backtester {
  private config: BotConfigType;
  private binanceService: BinanceService;
  private strategyEngine: StrategyEngine;
  private reportService: ReportService;
  private logger: Logger;
  private performanceCalculator: PerformanceCalculator;
  
  private dataSourceConfig: DataSourceConfig;
  private executionContext?: BacktestExecutionContext;

  constructor(
    config: BotConfigType,
    binanceService: BinanceService,
    strategyEngine: StrategyEngine,
    reportService: ReportService,
    logger?: Logger,
    options?: { disableCache?: boolean }
  ) {
    this.config = config;
    this.binanceService = binanceService;
    this.strategyEngine = strategyEngine;
    this.reportService = reportService;
    this.logger = logger || Logger.getInstance();
    this.performanceCalculator = new PerformanceCalculator();
    
    this.dataSourceConfig = {
      type: 'binance',
      cachePath: path.join(this.config.logging.reportDirectory, 'historical_data'),
      enableCache: options?.disableCache ? false : true,
      maxRetries: 3,
      retryDelayMs: 1000
    };
  }

  /**
   * Run comprehensive backtest
   */
  async runBacktest(backtestConfig: BacktestConfig): Promise<BacktestResult> {
    const startTime = Date.now();
    
    try {
      // Validate configuration
      BacktestConfigSchema.parse(backtestConfig);
      
      const resultId = uuidv4();
      this.logger.info(`Starting backtest ${resultId}`, { config: backtestConfig });

      // Initialize execution context
      this.executionContext = {
        id: resultId,
        config: backtestConfig,
        startTime,
        currentProgress: new Map(),
        isRunning: true,
        isPaused: false,
        canCancel: true,
        errorsEncountered: []
      };

      // Load historical data for all symbols
      const historicalDataMap = new Map<string, HistoricalDataResult>();
      for (const symbol of backtestConfig.symbols) {
        this.logger.info(`Loading historical data for ${symbol}`);
        const dataResult = await this.loadHistoricalData(
          symbol,
          backtestConfig.interval,
          backtestConfig.startTime,
          backtestConfig.endTime
        );
        historicalDataMap.set(symbol, dataResult);
      }

      // Initialize portfolio manager
      const portfolioManager = new BacktestPortfolioManager(
        backtestConfig.initialBalance,
        'USDT', // Assume USDT as quote currency
        this.config.binanceSettings.commissionRate
      );

      // Initialize strategy for each symbol
      for (const symbol of backtestConfig.symbols) {
        const dataResult = historicalDataMap.get(symbol)!;
        const initialData = dataResult.data.slice(0, 500); // First 500 candles for indicators
        this.strategyEngine.initializeStrategy(symbol, this.convertCandlesToStrategyFormat(initialData));
      }

      // Track trades and performance
      const allTrades: BacktestTrade[] = [];
      const symbolPerformance = new Map<string, SymbolPerformance>();
      const marketDataStats = new Map<string, MarketDataStats>();
      let dataPointsProcessed = 0;
      const errorsEncountered: string[] = [];

      // Calculate market data statistics
      for (const [symbol, dataResult] of historicalDataMap) {
        const stats = this.calculateMarketDataStats(symbol, dataResult.data);
        marketDataStats.set(symbol, stats);
      }

      // Main backtest simulation loop
      await this.simulateTrading(
        backtestConfig,
        historicalDataMap,
        portfolioManager,
        allTrades,
        errorsEncountered,
        (processed) => { dataPointsProcessed = processed; }
      );

      // Calculate performance metrics
      const portfolioHistory = portfolioManager.getPortfolioHistory();
      const overallPerformance = this.performanceCalculator.calculateOverallPerformance(
        portfolioHistory,
        allTrades,
        backtestConfig.initialBalance
      );

      const tradingMetrics = this.performanceCalculator.calculateTradingMetrics(allTrades);

      // Calculate symbol-specific performance
      for (const symbol of backtestConfig.symbols) {
        const symbolPerf = this.performanceCalculator.calculateSymbolPerformance(
          symbol,
          allTrades,
          portfolioHistory
        );
        symbolPerformance.set(symbol, symbolPerf);
      }

      // Create final result
      const result: BacktestResult = {
        id: resultId,
        config: backtestConfig,
        startTime: backtestConfig.startTime,
        endTime: backtestConfig.endTime,
        duration: backtestConfig.endTime - backtestConfig.startTime,
        
        // Portfolio metrics
        initialBalance: backtestConfig.initialBalance,
        finalBalance: portfolioHistory[portfolioHistory.length - 1]?.totalValue || backtestConfig.initialBalance,
        ...overallPerformance,
        
        // Trading metrics
        ...tradingMetrics,
        
        // Performance by symbol
        symbolPerformance,
        
        // Time series data
        portfolioHistory,
        trades: allTrades,
        
        // Execution metrics
        executionTimeMs: Date.now() - startTime,
        dataPointsProcessed,
        errorsEncountered: this.executionContext?.errorsEncountered || [],
        
        // Metadata
        createdAt: startTime,
        version: '1.0.0'
      };

      // Save report
      await this.reportService.saveBacktestReport(result);
      
      this.logger.info(`Backtest ${resultId} completed successfully`, {
        duration: result.executionTimeMs,
        trades: result.totalTrades,
        return: result.totalReturnPercentage
      });

      return result;

    } catch (error) {
      this.logger.error('Backtest failed:', error);
      throw error;
    } finally {
      if (this.executionContext) {
        this.executionContext.isRunning = false;
      }
    }
  }

  /**
   * Load historical data from cache or API
   */
  async loadHistoricalData(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<HistoricalDataResult> {
    const loadStartTime = Date.now();
    let dataSource: 'cache' | 'api' = 'api';
    
    // Try to load from cache first
    if (this.dataSourceConfig.enableCache) {
      try {
        const cacheResult = await this.loadFromCache(symbol, interval, startTime, endTime);
        if (cacheResult) {
          dataSource = 'cache';
          this.logger.info(`Loaded ${symbol} data from cache: ${cacheResult.length} candles`);
          
          return {
            symbol,
            interval,
            data: cacheResult,
            startTime,
            endTime,
            dataSource,
            loadTimeMs: Date.now() - loadStartTime
          };
        }
      } catch (error) {
        this.logger.warn(`Cache load failed for ${symbol}:`, error);
      }
    }

    // Load from API with retries
    let data: BacktestCandle[] = [];
    for (let attempt = 1; attempt <= this.dataSourceConfig.maxRetries; attempt++) {
      try {
        const rawData = await this.binanceService.getHistoricalKlines({
          symbol: symbol.replace('/', ''), // Remove slash for Binance API
          interval: interval as any, // Cast to BinanceInterval
          startTime,
          endTime,
          limit: 1000
        });

        data = this.convertRawKlinesToCandles(rawData, symbol);
        this.logger.info(`Loaded ${symbol} data from API: ${data.length} candles (attempt ${attempt})`);
        break;

      } catch (error) {
        this.logger.warn(`API load attempt ${attempt} failed for ${symbol}:`, error);
        
        if (attempt === this.dataSourceConfig.maxRetries) {
          throw new Error(`Failed to load data for ${symbol} after ${attempt} attempts`);
        }
        
        await new Promise(resolve => setTimeout(resolve, this.dataSourceConfig.retryDelayMs * attempt));
      }
    }

    // Save to cache
    if (this.dataSourceConfig.enableCache && data.length > 0) {
      try {
        await this.saveToCache(symbol, interval, startTime, endTime, data);
      } catch (error) {
        this.logger.warn(`Failed to save ${symbol} data to cache:`, error);
      }
    }

    return {
      symbol,
      interval,
      data,
      startTime,
      endTime,
      dataSource,
      loadTimeMs: Date.now() - loadStartTime
    };
  }

  /**
   * Main trading simulation loop
   */
  private async simulateTrading(
    config: BacktestConfig,
    historicalDataMap: Map<string, HistoricalDataResult>,
    portfolioManager: BacktestPortfolioManager,
    allTrades: BacktestTrade[],
    errorsEncountered: string[],
    progressCallback: (processed: number) => void
  ): Promise<void> {
    // Find the minimum and maximum timestamps across all data
    let minTimestamp = Infinity;
    let maxTimestamp = 0;
    let totalCandles = 0;

    for (const dataResult of historicalDataMap.values()) {
      if (dataResult.data.length > 0) {
        minTimestamp = Math.min(minTimestamp, dataResult.data[0]?.timestamp || Infinity);
        maxTimestamp = Math.max(maxTimestamp, dataResult.data[dataResult.data.length - 1]?.timestamp || 0);
        totalCandles += dataResult.data.length;
      }
    }

    if (minTimestamp === Infinity) {
      throw new Error('No historical data available');
    }

    // Create time-aligned data iterators
    const dataIterators = new Map<string, number>();
    for (const symbol of config.symbols) {
      dataIterators.set(symbol, 500); // Start after initial data used for indicators
    }

    let processedCandles = 0;
    const snapshotInterval = 60 * 60 * 1000; // Take portfolio snapshots every hour
    let lastSnapshotTime = minTimestamp;

    // Simulate trading minute by minute
    for (let currentTime = minTimestamp; currentTime <= maxTimestamp; currentTime += 60000) { // 1-minute intervals
      if (!this.executionContext?.isRunning) {
        throw new Error('Backtest was cancelled');
      }

      const currentPrices = new Map<string, number>();

      // Process each symbol at current time
      for (const symbol of config.symbols) {
        try {
          const dataResult = historicalDataMap.get(symbol)!;
          const currentIndex = dataIterators.get(symbol)!;
          
          if (currentIndex >= dataResult.data.length) continue;

          const candle = dataResult.data[currentIndex];
          if (!candle || candle.timestamp > currentTime) continue;

          // Update current price
          currentPrices.set(symbol, candle.close);

          // Update strategy state
          this.strategyEngine.updateState(symbol, {
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
          }, []); // Empty historical data array for performance

          // Get trading signals
          let signals;
          try {
            signals = this.strategyEngine.getTradeSignals(symbol);
          } catch (error) {
            const errorMessage = `Strategy engine error for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.error(errorMessage, error);
            if (this.executionContext) {
              this.executionContext.errorsEncountered.push(errorMessage);
            }
            continue; // Skip this iteration
          }

          // Process buy signals
          for (const buySignal of signals.buy) {
            try {
              const orderParams: OrderSimulationParams = {
                symbol,
                side: 'BUY',
                type: 'LIMIT',
                quantity: buySignal.quantity,
                price: buySignal.price,
                candle,
                slippagePercentage: config.slippagePercentage,
                commissionRate: this.config.binanceSettings.commissionRate
              };

              const result = OrderSimulator.simulateOrder(orderParams);
              
              if (result.executed) {
                portfolioManager.executeBuy(symbol, result.executedQuantity, result.executionPrice, result.commission);
                
                const trade: BacktestTrade = {
                  id: uuidv4(),
                  timestamp: candle.timestamp,
                  symbol,
                  side: 'BUY',
                  type: 'LIMIT',
                  price: buySignal.price,
                  quantity: result.executedQuantity,
                  value: result.value,
                  commission: result.commission,
                  gridLevel: buySignal.price,
                  executionPrice: result.executionPrice,
                  slippage: result.slippage,
                  candleTime: candle.timestamp
                };

                allTrades.push(trade);
              }
            } catch (error) {
              errorsEncountered.push(`Buy order failed for ${symbol}: ${error}`);
            }
          }

          // Process sell signals
          for (const sellSignal of signals.sell) {
            try {
              if (sellSignal.quantity === 0) continue;

              const orderParams: OrderSimulationParams = {
                symbol,
                side: 'SELL',
                type: 'LIMIT',
                quantity: sellSignal.quantity,
                price: sellSignal.price,
                candle,
                slippagePercentage: config.slippagePercentage,
                commissionRate: this.config.binanceSettings.commissionRate
              };

              const result = OrderSimulator.simulateOrder(orderParams);
              
              if (result.executed) {
                const profit = portfolioManager.executeSell(symbol, result.executedQuantity, result.executionPrice, result.commission);
                
                const trade: BacktestTrade = {
                  id: uuidv4(),
                  timestamp: candle.timestamp,
                  symbol,
                  side: 'SELL',
                  type: 'LIMIT',
                  price: sellSignal.price,
                  quantity: result.executedQuantity,
                  value: result.value,
                  commission: result.commission,
                  profit,
                  gridLevel: sellSignal.price,
                  executionPrice: result.executionPrice,
                  slippage: result.slippage,
                  candleTime: candle.timestamp
                };

                allTrades.push(trade);
              }
            } catch (error) {
              errorsEncountered.push(`Sell order failed for ${symbol}: ${error}`);
            }
          }

          // Move to next candle
          dataIterators.set(symbol, currentIndex + 1);
          processedCandles++;

        } catch (error) {
          errorsEncountered.push(`Error processing ${symbol} at ${currentTime}: ${error}`);
        }
      }

      // Take portfolio snapshot periodically
      if (currentTime - lastSnapshotTime >= snapshotInterval && currentPrices.size > 0) {
        portfolioManager.takeSnapshot(currentTime, currentPrices, config.initialBalance);
        lastSnapshotTime = currentTime;
      }

      // Update progress
      if (processedCandles % 1000 === 0) {
        progressCallback(processedCandles);
        
        // Update execution context progress
        if (this.executionContext) {
          const progress = (currentTime - minTimestamp) / (maxTimestamp - minTimestamp);
          // Could emit progress events here for UI updates
        }
      }
    }

    // Take final snapshot
    if (historicalDataMap.size > 0) {
      const finalPrices = new Map<string, number>();
      for (const [symbol, dataResult] of historicalDataMap) {
        if (dataResult.data.length > 0) {
          const lastCandle = dataResult.data[dataResult.data.length - 1];
          if (lastCandle) {
            finalPrices.set(symbol, lastCandle.close);
          }
        }
      }
      portfolioManager.takeSnapshot(maxTimestamp, finalPrices, config.initialBalance);
    }

    progressCallback(processedCandles);
  }

  /**
   * Convert BinanceKline objects to BacktestCandle format
   */
  private convertRawKlinesToCandles(klineData: BinanceKline[], symbol: string): BacktestCandle[] {
    return klineData.map(kline => ({
      timestamp: kline.openTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      symbol
    }));
  }

  /**
   * Convert candles to strategy engine format
   */
  private convertCandlesToStrategyFormat(candles: BacktestCandle[]): any[] {
    return candles.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }

  /**
   * Calculate market data statistics
   */
  private calculateMarketDataStats(symbol: string, data: BacktestCandle[]): MarketDataStats {
    if (data.length === 0) {
      return {
        symbol,
        startPrice: 0,
        endPrice: 0,
        priceChange: 0,
        priceChangePercentage: 0,
        high: 0,
        low: 0,
        averagePrice: 0,
        volatility: 0,
        volume: 0,
        candleCount: 0
      };
    }

    const startPrice = data[0]?.close || 0;
    const endPrice = data[data.length - 1]?.close || 0;
    const priceChange = endPrice - startPrice;
    const priceChangePercentage = startPrice > 0 ? (priceChange / startPrice) * 100 : 0;
    
    const high = Math.max(...data.map(c => c.high));
    const low = Math.min(...data.map(c => c.low));
    const averagePrice = data.reduce((sum, c) => sum + c.close, 0) / data.length;
    const volume = data.reduce((sum, c) => sum + c.volume, 0);
    
    // Calculate volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < data.length; i++) {
      const prevClose = data[i - 1]?.close || 0;
      const currentClose = data[i]?.close || 0;
      if (prevClose > 0) {
        returns.push((currentClose - prevClose) / prevClose);
      }
    }
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = Math.sqrt(
      returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1)
    ) * 100;

    return {
      symbol,
      startPrice,
      endPrice,
      priceChange,
      priceChangePercentage,
      high,
      low,
      averagePrice,
      volatility: isNaN(volatility) ? 0 : volatility,
      volume,
      candleCount: data.length
    };
  }

  /**
   * Load historical data from cache
   */
  private async loadFromCache(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<BacktestCandle[] | null> {
    if (!this.dataSourceConfig.cachePath) return null;

    const fileName = `${symbol.replace('/', '')}_${interval}_${startTime}_${endTime}.json`;
    const filePath = path.join(this.dataSourceConfig.cachePath, fileName);

    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Save historical data to cache
   */
  private async saveToCache(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    data: BacktestCandle[]
  ): Promise<void> {
    if (!this.dataSourceConfig.cachePath) return;

    await fs.mkdir(this.dataSourceConfig.cachePath, { recursive: true });

    const fileName = `${symbol.replace('/', '')}_${interval}_${startTime}_${endTime}.json`;
    const filePath = path.join(this.dataSourceConfig.cachePath, fileName);

    await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
  }

  /**
   * Get current backtest progress
   */
  getProgress(): BacktestProgress[] {
    if (!this.executionContext) return [];

    return Array.from(this.executionContext.currentProgress.values());
  }

  /**
   * Cancel running backtest
   */
  cancel(): void {
    if (this.executionContext) {
      this.executionContext.isRunning = false;
      this.logger.info(`Backtest ${this.executionContext.id} cancelled`);
    }
  }

  /**
   * Pause/resume backtest
   */
  setPaused(paused: boolean): void {
    if (this.executionContext) {
      this.executionContext.isPaused = paused;
      this.logger.info(`Backtest ${this.executionContext.id} ${paused ? 'paused' : 'resumed'}`);
    }
  }
}
