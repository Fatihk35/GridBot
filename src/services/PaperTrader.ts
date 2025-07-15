/**
 * Paper Trader Implementation
 * Simulates real-time trading with virtual funds using live market data
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { BotConfigType } from '@/config/schema';
import { BinanceService } from '@/services/BinanceService';
import { StrategyEngine, TradingSignal } from '@/services/StrategyEngine';
import { NotificationService } from '@/services/NotificationService';
import { ReportService } from '@/services/ReportService';
import { Logger } from '@/utils/logger';
import { CandlestickData } from '@/utils/indicators';
import {
  VirtualBalance,
  VirtualOrder,
  PaperTradingState,
  PaperTradingResult,
  PaperTradingConfig,
  MarketDataBar,
} from '@/types';
import { BinanceWebSocketKline } from '@/types/binance';

/**
 * Virtual order schema for validation
 */
const VirtualOrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  price: z.number().positive(),
  quantity: z.number().positive(),
  status: z.enum(['NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED']),
  filledQuantity: z.number().nonnegative(),
  createTime: z.number().int().positive(),
  updateTime: z.number().int().positive(),
  gridLevelIndex: z.number().int().optional(),
});

/**
 * Paper trading configuration schema
 */
const PaperTradingConfigSchema = z.object({
  initialBalance: z.number().positive().default(10000),
  currency: z.string().default('USDT'),
  enableReporting: z.boolean().default(true),
  reportingInterval: z.number().int().positive().default(60), // minutes
  enableNotifications: z.boolean().default(true),
  slippageRate: z.number().nonnegative().default(0.001), // 0.1%
  latencyMs: z.number().int().nonnegative().default(100),
});

/**
 * Paper Trader Events
 */
interface PaperTraderEvents {
  'order-created': (order: VirtualOrder) => void;
  'order-filled': (order: VirtualOrder) => void;
  'order-canceled': (order: VirtualOrder) => void;
  'balance-updated': (balances: VirtualBalance) => void;
  'profit-realized': (profit: number, symbol: string) => void;
  error: (error: Error) => void;
  'status-update': (status: string) => void;
}

/**
 * Paper Trader for simulating trades with virtual funds
 */
export class PaperTrader extends EventEmitter {
  private config: BotConfigType;
  private paperConfig: PaperTradingConfig;
  private binanceService: BinanceService;
  private strategyEngine: StrategyEngine;
  private notificationService: NotificationService;
  private reportService: ReportService;
  private logger: Logger;

  private state!: PaperTradingState;
  private marketDataSubscriptions: Map<string, string> = new Map(); // Store subscription IDs
  private reportingInterval?: NodeJS.Timeout | undefined;
  private startTime: number = 0;

  // Performance tracking
  private performanceData: Map<
    string,
    {
      totalTrades: number;
      winningTrades: number;
      totalProfit: number;
      lastPrice: number;
    }
  > = new Map();

  constructor(
    config: BotConfigType,
    binanceService: BinanceService,
    strategyEngine: StrategyEngine,
    notificationService: NotificationService,
    reportService: ReportService,
    paperTradingConfig?: Partial<PaperTradingConfig>,
    logger?: Logger
  ) {
    super();

    this.config = config;
    this.binanceService = binanceService;
    this.strategyEngine = strategyEngine;
    this.notificationService = notificationService;
    this.reportService = reportService;
    this.logger = logger || Logger.getInstance();

    // Parse and validate paper trading config
    this.paperConfig = PaperTradingConfigSchema.parse({
      initialBalance: config.maxBudget.amount,
      currency: config.maxBudget.currency,
      ...paperTradingConfig,
    });

    // Initialize state
    this.initializeState();

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize paper trading state
   */
  private initializeState(): void {
    this.state = {
      isRunning: false,
      startTime: 0,
      virtualBalances: {
        [this.paperConfig.currency]: this.paperConfig.initialBalance,
      },
      virtualOrders: new Map(),
      lastOrderId: 0,
      totalTrades: 0,
      totalProfit: 0,
      maxDrawdown: 0,
      highestBalance: this.paperConfig.initialBalance,
    };

    this.logger.info('PaperTrader state initialized', {
      initialBalance: this.paperConfig.initialBalance,
      currency: this.paperConfig.currency,
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    this.on('order-filled', this.handleOrderFilled.bind(this));
    this.on('balance-updated', this.handleBalanceUpdated.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  /**
   * Start paper trading
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Paper trading is already running');
    }

    try {
      this.logger.info('Starting paper trading mode...');
      this.state.isRunning = true;
      this.state.startTime = Date.now();
      this.startTime = this.state.startTime;

      // Send start notification
      await this.notificationService.sendNotification(
        'Paper trading started successfully',
        'success'
      );

      // Initialize strategy for each symbol
      await this.initializeStrategies();

      // Subscribe to real-time market data
      await this.subscribeToMarketData();

      // Start periodic reporting if enabled
      if (this.paperConfig.enableReporting) {
        this.startPeriodicReporting();
      }

      this.emit('status-update', 'started');
      this.logger.info('Paper trading started successfully');
    } catch (error) {
      this.state.isRunning = false;
      this.logger.error('Failed to start paper trading:', error);
      await this.notificationService.sendErrorNotification(
        error as Error,
        'Failed to start paper trading'
      );
      throw error;
    }
  }

  /**
   * Stop paper trading
   */
  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping paper trading...');
      this.state.isRunning = false;

      // Unsubscribe from market data
      this.unsubscribeFromMarketData();

      // Stop periodic reporting
      if (this.reportingInterval) {
        clearInterval(this.reportingInterval);
        this.reportingInterval = undefined;
      }

      // Generate final report
      await this.generateFinalReport();

      // Send stop notification
      await this.notificationService.sendNotification('Paper trading stopped', 'info');

      this.emit('status-update', 'stopped');
      this.logger.info('Paper trading stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping paper trading:', error);
      await this.notificationService.sendErrorNotification(
        error as Error,
        'Error stopping paper trading'
      );
    }
  }

  /**
   * Initialize strategies for all configured symbols
   */
  private async initializeStrategies(): Promise<void> {
    this.logger.info('Initializing strategies for symbols...');

    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.pair;

      try {
        this.logger.info(`Initializing strategy for ${symbol}...`);

        // Fetch historical data for initial calculations
        const endTime = Date.now();
        const startTime = endTime - 500 * 60 * 1000; // 500 minutes of 1m candles

        const historicalData = await this.binanceService.getHistoricalKlines({
          symbol,
          interval: '1m' as any,
          startTime,
          endTime,
        });

        // Convert to CandlestickData format
        const candlestickData: CandlestickData[] = historicalData.map(kline => ({
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
          volume: kline.volume,
          timestamp: kline.openTime,
        }));

        // Initialize strategy
        this.strategyEngine.initializeStrategy(symbol, candlestickData);

        // Initialize performance tracking
        this.performanceData.set(symbol, {
          totalTrades: 0,
          winningTrades: 0,
          totalProfit: 0,
          lastPrice: historicalData[historicalData.length - 1]?.close || 0,
        });

        this.logger.info(`Strategy initialized for ${symbol}`);
      } catch (error) {
        this.logger.error(`Failed to initialize strategy for ${symbol}:`, error);
        await this.notificationService.sendErrorNotification(
          error as Error,
          `Failed to initialize strategy for ${symbol}`
        );
        throw error; // Re-throw to fail the start() method
      }
    }
  }

  /**
   * Subscribe to real-time market data for all symbols
   */
  private async subscribeToMarketData(): Promise<void> {
    this.logger.info('Subscribing to real-time market data...');

    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.pair;

      try {
        this.logger.info(`Subscribing to real-time data for ${symbol}...`);

        const subscriptionId = this.binanceService.subscribeToKlineUpdates(
          symbol,
          '1m' as any,
          (kline: BinanceWebSocketKline) => {
            if (!this.state.isRunning) return;

            // Process only completed candles
            if (kline.k.x) {
              // x indicates if kline is closed
              this.processKline(symbol, kline);
            }
          }
        );

        this.marketDataSubscriptions.set(symbol, subscriptionId);
        this.logger.info(`Subscribed to real-time data for ${symbol}`);
      } catch (error) {
        this.logger.error(`Failed to subscribe to market data for ${symbol}:`, error);
        await this.notificationService.sendErrorNotification(
          error as Error,
          `Failed to subscribe to market data for ${symbol}`
        );
      }
    }
  }

  /**
   * Unsubscribe from all market data
   */
  private unsubscribeFromMarketData(): void {
    this.logger.info('Unsubscribing from market data...');

    this.marketDataSubscriptions.forEach((subscriptionId, symbol) => {
      try {
        this.binanceService.unsubscribeFromUpdates(subscriptionId);
        this.logger.info(`Unsubscribed from ${symbol}`);
      } catch (error) {
        this.logger.warn(`Error unsubscribing from ${symbol}:`, error);
      }
    });

    this.marketDataSubscriptions.clear();
  }

  /**
   * Process new kline data
   */
  private async processKline(symbol: string, kline: BinanceWebSocketKline): Promise<void> {
    try {
      // Convert kline to MarketDataBar format
      const bar: MarketDataBar = {
        time: kline.k.t,
        open: parseFloat(kline.k.o),
        high: parseFloat(kline.k.h),
        low: parseFloat(kline.k.l),
        close: parseFloat(kline.k.c),
        volume: parseFloat(kline.k.v),
      };

      // Convert to CandlestickData
      const candlestick: CandlestickData = {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        timestamp: bar.time,
      };

      // Update strategy state - need to pass historical data too
      // For now, we'll pass an empty array as the third parameter
      // In a real implementation, you'd maintain a rolling window of historical data
      this.strategyEngine.updateState(symbol, candlestick, []);

      // Process virtual orders
      await this.processVirtualOrders(symbol, bar);

      // Get new trade signals
      const signals = this.strategyEngine.getTradeSignals(symbol);

      // Process trade signals
      await this.processTradeSignals(symbol, signals, bar.close);

      // Update performance data
      this.updatePerformanceData(symbol, bar.close);
    } catch (error) {
      this.logger.error(`Error processing kline for ${symbol}:`, error);
      this.emit('error', error as Error);
    }
  }

  /**
   * Process trade signals
   */
  private async processTradeSignals(
    symbol: string,
    signals: { buy: any[]; sell: any[] },
    currentPrice: number
  ): Promise<void> {
    // Process buy signals
    for (const buySignal of signals.buy) {
      await this.createVirtualOrder({
        symbol,
        side: 'BUY',
        type: 'LIMIT',
        price: buySignal.price,
        quantity: buySignal.quantity || buySignal.gridLevel?.buySize / buySignal.price || 0,
        gridLevelIndex: buySignal.gridLevel?.index,
      });
    }

    // Process sell signals
    for (const sellSignal of signals.sell) {
      await this.createVirtualOrder({
        symbol,
        side: 'SELL',
        type: 'LIMIT',
        price: sellSignal.price,
        quantity: sellSignal.quantity || sellSignal.gridLevel?.sellSize || 0,
        gridLevelIndex: sellSignal.gridLevel?.index,
      });
    }
  }

  /**
   * Create a virtual order
   */
  private async createVirtualOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    price: number;
    quantity: number;
    gridLevelIndex?: number;
  }): Promise<string | null> {
    const { symbol, side, type, price, quantity, gridLevelIndex } = params;

    try {
      // Validate price and quantity
      if (price <= 0 || quantity <= 0 || !isFinite(price) || !isFinite(quantity)) {
        this.logger.warn('Invalid price or quantity for order', {
          price,
          quantity,
          symbol,
          side,
        });
        return null;
      }

      // Check if we have enough balance
      const [baseCurrency, quoteCurrency] = this.parseSymbol(symbol);

      if (side === 'BUY') {
        const requiredBalance = price * quantity * (1 + this.config.binanceSettings.commissionRate);
        if (
          !this.state.virtualBalances[quoteCurrency] ||
          this.state.virtualBalances[quoteCurrency] < requiredBalance
        ) {
          this.logger.warn(`Insufficient ${quoteCurrency} balance for BUY order`, {
            required: requiredBalance,
            available: this.state.virtualBalances[quoteCurrency] || 0,
          });
          return null;
        }
      } else {
        if (
          !this.state.virtualBalances[baseCurrency] ||
          this.state.virtualBalances[baseCurrency] < quantity
        ) {
          this.logger.warn(`Insufficient ${baseCurrency} balance for SELL order`, {
            required: quantity,
            available: this.state.virtualBalances[baseCurrency] || 0,
          });
          return null;
        }
      }

      // Create virtual order
      const orderId = uuidv4();
      const now = Date.now();

      const order: VirtualOrder = {
        id: orderId,
        symbol,
        side,
        type,
        price,
        quantity,
        status: 'NEW',
        filledQuantity: 0,
        createTime: now,
        updateTime: now,
        ...(gridLevelIndex !== undefined && { gridLevelIndex }),
      };

      this.state.virtualOrders.set(orderId, order);
      this.state.lastOrderId++;

      // Emit event
      this.emit('order-created', order);

      // Log and notify
      this.logger.info(`Created virtual ${side} order`, {
        orderId,
        symbol,
        price,
        quantity,
        gridLevelIndex,
      });

      if (this.paperConfig.enableNotifications) {
        await this.notificationService.sendTradingNotification(
          'Order Created',
          symbol,
          price,
          quantity,
          side,
          'paper'
        );
      }

      return orderId;
    } catch (error) {
      this.logger.error('Failed to create virtual order:', error);
      this.emit('error', error as Error);
      return null;
    }
  }

  /**
   * Process virtual orders against market data
   */
  private async processVirtualOrders(symbol: string, bar: MarketDataBar): Promise<void> {
    const ordersToProcess = Array.from(this.state.virtualOrders.values()).filter(
      order => order.symbol === symbol && order.status === 'NEW'
    );

    for (const order of ordersToProcess) {
      await this.checkOrderExecution(order, bar);
    }
  }

  /**
   * Check if an order should be executed
   */
  private async checkOrderExecution(order: VirtualOrder, bar: MarketDataBar): Promise<void> {
    const shouldFill = this.shouldFillOrder(order, bar);

    if (shouldFill) {
      await this.fillOrder(order, bar);
    }
  }

  /**
   * Determine if an order should be filled based on market data
   */
  private shouldFillOrder(order: VirtualOrder, bar: MarketDataBar): boolean {
    // Add latency simulation
    if (this.paperConfig.latencyMs > 0) {
      // In a real implementation, you might want to queue these
      // For now, we'll just proceed
    }

    // Check if price was hit during the bar
    if (order.side === 'BUY') {
      // Buy order fills if market price went down to or below order price
      return bar.low <= order.price;
    } else {
      // Sell order fills if market price went up to or above order price
      return bar.high >= order.price;
    }
  }

  /**
   * Fill a virtual order
   */
  private async fillOrder(order: VirtualOrder, bar: MarketDataBar): Promise<void> {
    try {
      // Apply slippage
      let fillPrice = order.price;
      if (this.paperConfig.slippageRate > 0) {
        const slippage = order.price * this.paperConfig.slippageRate;
        fillPrice = order.side === 'BUY' ? order.price + slippage : order.price - slippage;
      }

      // Update order
      order.status = 'FILLED';
      order.filledQuantity = order.quantity;
      order.updateTime = Date.now();
      order.price = fillPrice; // Update with actual fill price

      // Update virtual balances
      await this.updateBalances(order);

      // Update performance tracking
      this.state.totalTrades++;

      // Emit events
      this.emit('order-filled', order);

      // Log and notify
      this.logger.info(`Filled virtual ${order.side} order`, {
        orderId: order.id,
        symbol: order.symbol,
        fillPrice,
        quantity: order.quantity,
        slippage: fillPrice - order.price,
      });

      if (this.paperConfig.enableNotifications) {
        await this.notificationService.sendTradingNotification(
          'Order Filled',
          order.symbol,
          fillPrice,
          order.quantity,
          order.side,
          'paper'
        );
      }
    } catch (error) {
      this.logger.error('Failed to fill order:', error);
      this.emit('error', error as Error);
    }
  }

  /**
   * Update virtual balances after order execution
   */
  private async updateBalances(order: VirtualOrder): Promise<void> {
    const [baseCurrency, quoteCurrency] = this.parseSymbol(order.symbol);

    if (order.side === 'BUY') {
      // Deduct quote currency (e.g., USDT)
      const cost = order.price * order.quantity;
      const commission = cost * this.config.binanceSettings.commissionRate;

      this.state.virtualBalances[quoteCurrency] =
        (this.state.virtualBalances[quoteCurrency] || 0) - (cost + commission);

      // Add base currency (e.g., BTC)
      this.state.virtualBalances[baseCurrency] =
        (this.state.virtualBalances[baseCurrency] || 0) + order.quantity;
    } else {
      // Deduct base currency
      this.state.virtualBalances[baseCurrency] =
        (this.state.virtualBalances[baseCurrency] || 0) - order.quantity;

      // Add quote currency
      const proceeds = order.price * order.quantity;
      const commission = proceeds * this.config.binanceSettings.commissionRate;

      this.state.virtualBalances[quoteCurrency] =
        (this.state.virtualBalances[quoteCurrency] || 0) + (proceeds - commission);

      // Calculate realized profit
      const profit = proceeds - commission;
      this.state.totalProfit += profit;
      this.emit('profit-realized', profit, order.symbol);
    }

    // Emit balance update event
    this.emit('balance-updated', { ...this.state.virtualBalances });
  }

  /**
   * Update performance data
   */
  private updatePerformanceData(symbol: string, currentPrice: number): void {
    const data = this.performanceData.get(symbol);
    if (data) {
      data.lastPrice = currentPrice;
    }
  }

  /**
   * Handle order filled event
   */
  private handleOrderFilled(order: VirtualOrder): void {
    // Log transaction
    this.reportService.logTransaction({
      time: order.updateTime,
      type: 'ORDER_FILLED',
      symbol: order.symbol,
      side: order.side,
      price: order.price,
      quantity: order.quantity,
      orderId: order.id,
    } as any);
  }

  /**
   * Handle balance updated event
   */
  private handleBalanceUpdated(balances: VirtualBalance): void {
    // Update max drawdown
    const totalValue = this.calculateTotalPortfolioValue(balances);

    if (totalValue > this.state.highestBalance) {
      this.state.highestBalance = totalValue;
    } else {
      const currentDrawdown = (this.state.highestBalance - totalValue) / this.state.highestBalance;
      if (currentDrawdown > this.state.maxDrawdown) {
        this.state.maxDrawdown = currentDrawdown;
      }
    }
  }

  /**
   * Handle error event
   */
  private async handleError(error: Error): Promise<void> {
    await this.notificationService.sendErrorNotification(error, 'Paper Trading Error');
  }

  /**
   * Calculate total portfolio value in base currency
   */
  private calculateTotalPortfolioValue(balances: VirtualBalance): number {
    // For simplicity, we'll just return the base currency balance
    // In a real implementation, you'd convert all balances to a common currency
    return balances[this.paperConfig.currency] || 0;
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    const intervalMs = this.paperConfig.reportingInterval * 60 * 1000;

    this.reportingInterval = setInterval(async () => {
      if (!this.state.isRunning) return;

      try {
        await this.generateStatusReport();
      } catch (error) {
        this.logger.error('Error generating status report:', error);
      }
    }, intervalMs);

    this.logger.info(
      `Periodic reporting started (interval: ${this.paperConfig.reportingInterval} minutes)`
    );
  }

  /**
   * Generate status report
   */
  private async generateStatusReport(): Promise<void> {
    const report = {
      time: Date.now(),
      mode: 'papertrade' as const,
      balances: this.state.virtualBalances,
      openOrders: Array.from(this.state.virtualOrders.values()).filter(
        order => order.status === 'NEW'
      ),
      performance: {
        totalReturn: this.state.totalProfit,
        drawdown: this.state.maxDrawdown * 100,
        trades: this.state.totalTrades,
      },
    };

    // Save report
    await this.reportService.saveStatusReport(report, 'papertrade');

    // Send notification
    if (this.paperConfig.enableNotifications) {
      await this.notificationService.sendStatusNotification('Paper Trading Status', {
        ...report.performance,
        balances: Object.entries(this.state.virtualBalances)
          .map(([currency, balance]) => `${balance.toFixed(8)} ${currency}`)
          .join(', '),
      });
    }

    this.logger.info('Status report generated', report);
  }

  /**
   * Generate final report
   */
  private async generateFinalReport(): Promise<void> {
    const endTime = Date.now();
    const duration = endTime - this.state.startTime;

    const results: PaperTradingResult[] = [];

    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.pair;
      const perfData = this.performanceData.get(symbol);

      const result: PaperTradingResult = {
        symbol,
        startTime: this.state.startTime,
        endTime,
        duration,
        initialBalance: this.paperConfig.initialBalance,
        finalBalance: this.calculateTotalPortfolioValue(this.state.virtualBalances),
        totalProfit: this.state.totalProfit,
        totalProfitPercentage: (this.state.totalProfit / this.paperConfig.initialBalance) * 100,
        totalTrades: this.state.totalTrades,
        winningTrades: perfData?.winningTrades || 0,
        losingTrades: this.state.totalTrades - (perfData?.winningTrades || 0),
        winRate:
          this.state.totalTrades > 0
            ? ((perfData?.winningTrades || 0) / this.state.totalTrades) * 100
            : 0,
        maxDrawdown: this.state.maxDrawdown * 100,
        trades: Array.from(this.state.virtualOrders.values()).filter(
          order => order.symbol === symbol && order.status === 'FILLED'
        ),
        finalBalances: this.state.virtualBalances,
      };

      results.push(result);
    }

    // Save final report
    for (const result of results) {
      await this.reportService.saveBacktestReport(result as any);
    }

    // Send final notification
    if (this.paperConfig.enableNotifications) {
      const summary = results.reduce(
        (acc, result) => ({
          totalProfit: acc.totalProfit + result.totalProfit,
          totalTrades: acc.totalTrades + result.totalTrades,
          winRate: (acc.winRate + result.winRate) / 2,
        }),
        { totalProfit: 0, totalTrades: 0, winRate: 0 }
      );

      await this.notificationService.sendNotification(
        `Paper Trading Completed\n` +
          `Duration: ${(duration / (60 * 60 * 1000)).toFixed(2)} hours\n` +
          `Total Profit: ${summary.totalProfit.toFixed(2)} ${this.paperConfig.currency}\n` +
          `Total Trades: ${summary.totalTrades}\n` +
          `Win Rate: ${summary.winRate.toFixed(2)}%\n` +
          `Max Drawdown: ${(this.state.maxDrawdown * 100).toFixed(2)}%`,
        'success'
      );
    }

    this.logger.info('Final report generated', { results });
  }

  /**
   * Get current state
   */
  getState(): Readonly<PaperTradingState> {
    return { ...this.state };
  }

  /**
   * Get current balances
   */
  getBalances(): Readonly<VirtualBalance> {
    return { ...this.state.virtualBalances };
  }

  /**
   * Get open orders
   */
  getOpenOrders(): VirtualOrder[] {
    return Array.from(this.state.virtualOrders.values()).filter(order => order.status === 'NEW');
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalTrades: number;
    totalProfit: number;
    maxDrawdown: number;
    winRate: number;
    runtime: number;
  } {
    const runtime = this.state.isRunning ? Date.now() - this.state.startTime : 0;

    return {
      totalTrades: this.state.totalTrades,
      totalProfit: this.state.totalProfit,
      maxDrawdown: this.state.maxDrawdown * 100,
      winRate:
        this.state.totalTrades > 0
          ? (Array.from(this.performanceData.values()).reduce(
              (acc, data) => acc + data.winningTrades,
              0
            ) /
              this.state.totalTrades) *
            100
          : 0,
      runtime,
    };
  }

  /**
   * Parse trading symbol to get base and quote currencies
   */
  private parseSymbol(symbol: string): [string, string] {
    // Handle common patterns like BTCUSDT, ETHUSDT, etc.
    if (symbol.endsWith('USDT')) {
      return [symbol.replace('USDT', ''), 'USDT'];
    }
    if (symbol.endsWith('BTC')) {
      return [symbol.replace('BTC', ''), 'BTC'];
    }
    if (symbol.endsWith('ETH')) {
      return [symbol.replace('ETH', ''), 'ETH'];
    }
    if (symbol.includes('/')) {
      const parts = symbol.split('/');
      return [parts[0] || 'BTC', parts[1] || 'USDT'];
    }
    // Default fallback
    return ['BTC', 'USDT'];
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
    this.logger.info('PaperTrader destroyed');
  }
}

/**
 * Declare event types for TypeScript
 */
export interface PaperTrader {
  on<K extends keyof PaperTraderEvents>(event: K, listener: PaperTraderEvents[K]): this;
  emit<K extends keyof PaperTraderEvents>(
    event: K,
    ...args: Parameters<PaperTraderEvents[K]>
  ): boolean;
}
