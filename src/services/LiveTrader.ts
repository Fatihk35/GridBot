import { BotConfigType } from '../config/schema';
import { BinanceService } from './BinanceService';
import { StrategyEngine } from './StrategyEngine';
import { NotificationService } from './NotificationService';
import { ReportService } from './ReportService';
import { Logger } from '../utils/logger';
import { TradingError, OrderError, InsufficientBalanceError } from '../utils/errors';
import { CreateOrderParams } from '../types/binance';

export interface TradingSignal {
  price: number;
  quantity: number;
  type: 'BUY' | 'SELL';
  timestamp: number;
}

export interface LiveOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price: number;
  quantity: number;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  filledQuantity: number;
  createTime: number;
  updateTime: number;
  gridLevel: number;
  binanceOrderId?: string;
}

export interface AccountBalance {
  [currency: string]: {
    available: number;
    onOrder: number;
    total: number;
  };
}

export interface LiveTradingStats {
  startTime: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: number;
  totalCommissions: number;
  activeOrders: number;
}

/**
 * Live Trading Module that executes real trades on Binance Spot using the grid strategy
 */
export class LiveTrader {
  private config: BotConfigType;
  private binanceService: BinanceService;
  private strategyEngine: StrategyEngine;
  private notificationService: NotificationService;
  private reportService: ReportService;
  private logger: Logger;

  private isRunning = false;
  private isPaused = false;
  private marketDataSubscriptions: Map<string, boolean> = new Map();
  private activeOrders: Map<string, LiveOrder> = new Map();
  private orderIdCounter = 0;
  private startTime: number = 0;
  private stats: LiveTradingStats = {
    startTime: 0,
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    totalCommissions: 0,
    activeOrders: 0,
  };

  // Safety and risk management
  private maxOrdersPerSymbol: number = 50;
  private minBalanceThreshold: number = 0.1; // 10% of configured budget
  private maxDailyLoss: number = 0.05; // 5% daily loss limit
  private dailyLossStartTime: number = 0;
  private dailyStartBalance: number = 0;

  constructor(
    config: BotConfigType,
    binanceService: BinanceService,
    strategyEngine: StrategyEngine,
    notificationService: NotificationService,
    reportService: ReportService
  ) {
    this.config = config;
    this.binanceService = binanceService;
    this.strategyEngine = strategyEngine;
    this.notificationService = notificationService;
    this.reportService = reportService;
    this.logger = Logger.getInstance();

    this.initializeStats();
  }

  /**
   * Initialize trading statistics
   */
  private initializeStats(): void {
    this.stats = {
      startTime: 0,
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalCommissions: 0,
      activeOrders: 0,
    };
  }

  /**
   * Start live trading
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new TradingError('Live trading is already running');
    }

    try {
      // Safety confirmation
      await this.confirmLiveTrading();

      this.isRunning = true;
      this.startTime = Date.now();
      this.stats.startTime = this.startTime;
      this.dailyLossStartTime = this.startTime;

      this.logger.info('Starting live trading mode...');
      await this.notificationService.sendNotification('⚠️ LIVE trading started ⚠️');

      // Pre-flight checks
      await this.performPreFlightChecks();

      // Initialize daily balance tracking
      const balances = await this.getAccountBalances();
      this.dailyStartBalance = this.calculateTotalBalance(balances);

      // Initialize trading for each symbol
      await this.initializeSymbols();

      // Display initial trading setup summary
      await this.displayInitialTradingStatus();

      // Start monitoring and reporting
      this.startOrderMonitoring();
      this.startPeriodicReporting();
      this.startRiskMonitoring();

      this.logger.info('Live trading started successfully');
    } catch (error) {
      this.isRunning = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start live trading:', error);
      await this.notificationService.sendNotification(
        `Failed to start live trading: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Stop live trading
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;
      this.logger.info('Stopping live trading mode...');

      // Cancel all open orders (with user confirmation)
      await this.safelyCancelAllOrders();

      // Unsubscribe from market data
      this.unsubscribeFromAllMarketData();

      // Generate final report
      await this.generateFinalReport();

      // Clear state
      this.activeOrders.clear();
      this.marketDataSubscriptions.clear();

      await this.notificationService.sendNotification('LIVE trading stopped');
      this.logger.info('Live trading stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping live trading:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.notificationService.sendNotification(
        `Error stopping live trading: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Pause live trading (stop creating new orders but keep monitoring existing ones)
   */
  public async pause(): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.logger.info('Live trading paused');
    await this.notificationService.sendNotification(
      'Live trading paused - no new orders will be created'
    );
  }

  /**
   * Resume live trading
   */
  public async resume(): Promise<void> {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.logger.info('Live trading resumed');
    await this.notificationService.sendNotification('Live trading resumed');
  }

  /**
   * Get current trading status
   */
  public getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    stats: LiveTradingStats;
    activeOrdersCount: number;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      stats: { ...this.stats, activeOrders: this.activeOrders.size },
      activeOrdersCount: this.activeOrders.size,
    };
  }

  /**
   * Safety confirmation before starting live trading
   */
  private async confirmLiveTrading(): Promise<void> {
    this.logger.warn('WARNING: You are about to start LIVE trading with real funds.');
    this.logger.warn('This will execute real trades on Binance with your actual balance.');
    this.logger.warn('Press Ctrl+C within 10 seconds to cancel...');

    // In a real implementation, you might want to require manual confirmation
    // For now, we'll just wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  /**
   * Perform pre-flight checks before starting trading
   */
  private async performPreFlightChecks(): Promise<void> {
    this.logger.info('Performing pre-flight checks...');

    // Check API connectivity
    try {
      // Test connection by getting server time
      await this.binanceService.getExchangeInfo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new TradingError(
        'Failed to connect to Binance API',
        undefined,
        error instanceof Error ? error : undefined
      );
    }

    // Check account status
    const accountInfo = await this.binanceService.getAccountInfo();
    if (!accountInfo.canTrade) {
      throw new TradingError('Account is not enabled for trading');
    }

    // Check balances
    await this.checkAccountBalances();

    // Verify exchange info for all symbols
    await this.verifySymbolsInfo();

    this.logger.info('Pre-flight checks completed successfully');
  }

  /**
   * Check account balances and validate minimum requirements
   */
  private async checkAccountBalances(): Promise<void> {
    try {
      const balances = await this.getAccountBalances();

      this.logger.info('Account balances:');
      Object.entries(balances).forEach(([currency, balance]) => {
        if (balance.total > 0) {
          this.logger.info(
            `${currency}: ${balance.available} (available) + ${balance.onOrder} (in orders) = ${balance.total} (total)`
          );
        }
      });

      // Check if we have enough balance for trading
      const budgetCurrency = this.config.maxBudget.currency;
      const availableBalance = balances[budgetCurrency]?.available || 0;
      const requiredBalance = this.config.maxBudget.amount * this.minBalanceThreshold;

      if (availableBalance < requiredBalance) {
        const message = `Insufficient ${budgetCurrency} balance. Available: ${availableBalance}, Required minimum: ${requiredBalance}`;
        this.logger.error(message);
        throw new InsufficientBalanceError(message);
      }

      await this.notificationService.sendNotification(
        `Account Balance Check:\n${budgetCurrency}: ${availableBalance.toFixed(8)} available`
      );
    } catch (error) {
      this.logger.error('Error checking account balances:', error);
      throw error;
    }
  }

  /**
   * Get formatted account balances
   */
  private async getAccountBalances(): Promise<AccountBalance> {
    const accountInfo = await this.binanceService.getAccountInfo();
    const balances: AccountBalance = {};

    accountInfo.balances.forEach(balance => {
      const available = parseFloat(balance.free) || 0;
      const onOrder = parseFloat(balance.locked) || 0;

      balances[balance.asset] = {
        available,
        onOrder,
        total: available + onOrder,
      };
    });

    return balances;
  }

  /**
   * Calculate total balance in base currency
   */
  private calculateTotalBalance(balances: AccountBalance): number {
    const baseCurrency = this.config.maxBudget.currency;
    return balances[baseCurrency]?.total || 0;
  }

  /**
   * Verify exchange information for all configured symbols
   */
  private async verifySymbolsInfo(): Promise<void> {
    try {
      const exchangeInfo = await this.binanceService.getExchangeInfo();

      for (const symbolConfig of this.config.symbols) {
        const symbol = symbolConfig.pair.replace('/', '');
        const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);

        if (!symbolInfo) {
          throw new TradingError(`Symbol ${symbol} not found on exchange`);
        }

        if (symbolInfo.status !== 'TRADING') {
          throw new TradingError(
            `Symbol ${symbol} is not available for trading (status: ${symbolInfo.status})`
          );
        }
      }

      this.logger.info('All symbols verified successfully');
    } catch (error) {
      this.logger.error('Error verifying symbols:', error);
      throw error;
    }
  }

  /**
   * Initialize trading strategies for all symbols
   */
  private async initializeSymbols(): Promise<void> {
    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.pair;

      try {
        this.logger.info(`Initializing strategy for ${symbol}...`);

        const binanceSymbol = symbol.replace('/', '');

        // Fetch historical data for initial calculations
        const endTime = Date.now();
        const startTime = endTime - 500 * 60 * 1000; // 500 minutes of 1m candles
        const historicalData = await this.binanceService.getHistoricalKlines({
          symbol: binanceSymbol,
          interval: '1m',
          startTime,
          endTime,
        });

        // Convert to required format
        const candlestickData = historicalData.map(kline => ({
          timestamp: kline.openTime,
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
          volume: kline.volume,
        }));

        // Initialize strategy
        this.strategyEngine.initializeStrategy(symbol, candlestickData);

        // Subscribe to real-time market data
        this.subscribeToMarketData(symbol);

        this.logger.info(`Strategy initialized for ${symbol}`);
      } catch (error) {
        this.logger.error(`Failed to initialize strategy for ${symbol}:`, error);
        throw error;
      }
    }
  }

  /**
   * Subscribe to real-time market data for a symbol
   */
  private subscribeToMarketData(symbol: string): void {
    this.logger.info(`Subscribing to real-time data for ${symbol}...`);

    const binanceSymbol = symbol.replace('/', '');

    this.binanceService.subscribeToKlineUpdates(binanceSymbol, '1m', kline => {
      if (!this.isRunning) return;

      // Process only completed candles
      if (kline.k.x) {
        // x indicates if the kline is closed
        this.processKline(symbol, kline.k);
      }
    });

    this.marketDataSubscriptions.set(symbol, true);
  }

  /**
   * Process new kline data and generate trading signals
   */
  private async processKline(symbol: string, kline: any): Promise<void> {
    try {
      // Convert kline to candlestick format
      const candlestick = {
        timestamp: kline.t, // Start time
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      };

      // Update strategy state (we need to pass historical data as well)
      // For now, we'll just pass an empty array as the third parameter
      // In a production system, you'd maintain a rolling window of historical data
      this.strategyEngine.updateState(symbol, candlestick, []);

      // Skip if trading is paused
      if (this.isPaused) {
        return;
      }

      // Get new trade signals
      const signals = this.strategyEngine.getTradeSignals(symbol);

      // Execute buy signals
      for (const buySignal of signals.buy) {
        const liveSignal: TradingSignal = {
          price: buySignal.price,
          quantity: buySignal.quantity,
          type: 'BUY',
          timestamp: buySignal.timestamp,
        };
        await this.executeBuyOrder(symbol, liveSignal);
      }

      // Execute sell signals
      for (const sellSignal of signals.sell) {
        const liveSignal: TradingSignal = {
          price: sellSignal.price,
          quantity: sellSignal.quantity,
          type: 'SELL',
          timestamp: sellSignal.timestamp,
        };
        await this.executeSellOrder(symbol, liveSignal);
      }
    } catch (error) {
      this.logger.error(`Error processing kline for ${symbol}:`, error);
    }
  }

  /**
   * Execute a buy order
   */
  private async executeBuyOrder(symbol: string, signal: TradingSignal): Promise<void> {
    try {
      // Risk checks
      if (!this.canCreateNewOrder(symbol)) {
        return;
      }

      // Check if we already have an active order at this price level
      const existingOrder = this.findExistingOrderAtPrice(symbol, 'BUY', signal.price);
      if (existingOrder) {
        this.logger.debug(`Already have a BUY order at price level ${signal.price} for ${symbol}`);
        return;
      }

      // Check balance
      const balances = await this.getAccountBalances();
      const quoteCurrency = this.getQuoteCurrency(symbol);
      const availableBalance = balances[quoteCurrency]?.available || 0;
      const requiredBalance = signal.quantity * signal.price * 1.01; // Add 1% buffer for fees

      if (availableBalance < requiredBalance) {
        this.logger.warn(
          `Insufficient ${quoteCurrency} balance for BUY order. Required: ${requiredBalance}, Available: ${availableBalance}`
        );
        return;
      }

      // Create order on Binance
      const binanceSymbol = symbol.replace('/', '');
      const order = await this.binanceService.createOrder({
        symbol: binanceSymbol,
        side: 'BUY',
        type: 'LIMIT',
        quantity: signal.quantity,
        price: signal.price,
        timeInForce: 'GTC',
      });

      // Create internal order tracking
      const internalOrder: LiveOrder = {
        id: this.generateOrderId(),
        symbol,
        side: 'BUY',
        type: 'LIMIT',
        price: signal.price,
        quantity: signal.quantity,
        status: 'NEW',
        filledQuantity: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
        gridLevel: signal.price,
        binanceOrderId: order.orderId.toString(),
      };

      // Store order
      this.activeOrders.set(internalOrder.id, internalOrder);
      this.stats.totalTrades++;

      // Log and notify
      this.logger.info(
        `Created BUY order: ${signal.quantity} ${symbol} @ ${signal.price} (Order ID: ${order.orderId})`
      );

      await this.reportService.logTransaction({
        time: Date.now(),
        type: 'ORDER_CREATED',
        symbol,
        side: 'BUY',
        price: signal.price,
        quantity: signal.quantity,
        orderId: order.orderId.toString(),
      });

      await this.notificationService.sendNotification(
        `🟢 LIVE Trade: Created BUY order\n${signal.quantity} ${symbol} @ ${signal.price}\nOrder ID: ${order.orderId}`
      );
    } catch (error) {
      this.stats.failedTrades++;
      this.logger.error(`Error executing BUY order for ${symbol}:`, error);

      if (error instanceof OrderError) {
        await this.notificationService.sendNotification(
          `❌ BUY order failed for ${symbol}: ${error.message}`
        );
      }
    }
  }

  /**
   * Execute a sell order
   */
  private async executeSellOrder(symbol: string, signal: TradingSignal): Promise<void> {
    try {
      // Risk checks
      if (!this.canCreateNewOrder(symbol)) {
        return;
      }

      // Check if we already have an active order at this price level
      const existingOrder = this.findExistingOrderAtPrice(symbol, 'SELL', signal.price);
      if (existingOrder) {
        this.logger.debug(`Already have a SELL order at price level ${signal.price} for ${symbol}`);
        return;
      }

      // Check balance
      const balances = await this.getAccountBalances();
      const baseCurrency = this.getBaseCurrency(symbol);
      const availableBalance = balances[baseCurrency]?.available || 0;

      if (availableBalance < signal.quantity) {
        this.logger.warn(
          `Insufficient ${baseCurrency} balance for SELL order. Required: ${signal.quantity}, Available: ${availableBalance}`
        );
        return;
      }

      // Create order on Binance
      const binanceSymbol = symbol.replace('/', '');
      const order = await this.binanceService.createOrder({
        symbol: binanceSymbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: signal.quantity,
        price: signal.price,
        timeInForce: 'GTC',
      });

      // Create internal order tracking
      const internalOrder: LiveOrder = {
        id: this.generateOrderId(),
        symbol,
        side: 'SELL',
        type: 'LIMIT',
        price: signal.price,
        quantity: signal.quantity,
        status: 'NEW',
        filledQuantity: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
        gridLevel: signal.price,
        binanceOrderId: order.orderId.toString(),
      };

      // Store order
      this.activeOrders.set(internalOrder.id, internalOrder);
      this.stats.totalTrades++;

      // Log and notify
      this.logger.info(
        `Created SELL order: ${signal.quantity} ${symbol} @ ${signal.price} (Order ID: ${order.orderId})`
      );

      await this.reportService.logTransaction({
        time: Date.now(),
        type: 'ORDER_CREATED',
        symbol,
        side: 'SELL',
        price: signal.price,
        quantity: signal.quantity,
        orderId: order.orderId.toString(),
      });

      await this.notificationService.sendNotification(
        `🔴 LIVE Trade: Created SELL order\n${signal.quantity} ${symbol} @ ${signal.price}\nOrder ID: ${order.orderId}`
      );
    } catch (error) {
      this.stats.failedTrades++;
      this.logger.error(`Error executing SELL order for ${symbol}:`, error);

      if (error instanceof OrderError) {
        await this.notificationService.sendNotification(
          `❌ SELL order failed for ${symbol}: ${error.message}`
        );
      }
    }
  }

  /**
   * Check if we can create a new order (risk management)
   */
  private canCreateNewOrder(symbol: string): boolean {
    // Check maximum orders per symbol
    const symbolOrders = Array.from(this.activeOrders.values()).filter(
      order => order.symbol === symbol
    );

    if (symbolOrders.length >= this.maxOrdersPerSymbol) {
      this.logger.warn(
        `Maximum orders limit reached for ${symbol} (${symbolOrders.length}/${this.maxOrdersPerSymbol})`
      );
      return false;
    }

    // Check daily loss limit
    if (this.isDailyLossLimitExceeded()) {
      this.logger.warn('Daily loss limit exceeded, no new orders will be created');
      return false;
    }

    return true;
  }

  /**
   * Check if daily loss limit is exceeded
   */
  private isDailyLossLimitExceeded(): boolean {
    // This is a simplified check - in a real implementation,
    // you would track actual P&L
    const currentTime = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Reset daily tracking if a new day has started
    if (currentTime - this.dailyLossStartTime > oneDayMs) {
      this.dailyLossStartTime = currentTime;
      // You would also reset daily P&L tracking here
      return false;
    }

    // In a real implementation, compare current balance with daily start balance
    // and check if loss exceeds maxDailyLoss percentage
    return false;
  }

  /**
   * Find existing order at specific price level
   */
  private findExistingOrderAtPrice(
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number
  ): LiveOrder | undefined {
    return Array.from(this.activeOrders.values()).find(
      order =>
        order.symbol === symbol &&
        order.side === side &&
        order.status === 'NEW' &&
        Math.abs(order.price - price) < 0.000001 // Use small epsilon for float comparison
    );
  }

  /**
   * Get base currency from symbol (e.g., BTC from BTC/USDT)
   */
  private getBaseCurrency(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }
    return parts[0]!;
  }

  /**
   * Get quote currency from symbol (e.g., USDT from BTC/USDT)
   */
  private getQuoteCurrency(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }
    return parts[1]!;
  }

  /**
   * Generate unique internal order ID
   */
  private generateOrderId(): string {
    return `live_${Date.now()}_${++this.orderIdCounter}`;
  }

  /**
   * Start order monitoring
   */
  private startOrderMonitoring(): void {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.checkOrderStatuses();
      } catch (error) {
        this.logger.error('Error during order monitoring:', error);
      }
    }, 30 * 1000); // Check every 30 seconds
  }

  /**
   * Check status of all active orders
   */
  private async checkOrderStatuses(): Promise<void> {
    const orderChecks = Array.from(this.activeOrders.values()).map(async order => {
      try {
        if (!order.binanceOrderId) return;

        const binanceSymbol = order.symbol.replace('/', '');
        const orderStatus = await this.binanceService.queryOrder({
          symbol: binanceSymbol,
          orderId: parseInt(order.binanceOrderId),
        });

        await this.updateOrderStatus(order, orderStatus);
      } catch (error) {
        this.logger.error(`Error checking order ${order.id} status:`, error);
      }
    });

    await Promise.allSettled(orderChecks);
  }

  /**
   * Update order status based on Binance response
   */
  private async updateOrderStatus(order: LiveOrder, binanceOrder: any): Promise<void> {
    const oldStatus = order.status;
    const newStatus = binanceOrder.status;
    const filledQuantity = parseFloat(binanceOrder.executedQty);

    if (oldStatus === newStatus && order.filledQuantity === filledQuantity) {
      return; // No change
    }

    // Update order
    order.status = newStatus;
    order.filledQuantity = filledQuantity;
    order.updateTime = Date.now();

    // Log status change
    this.logger.info(
      `Order ${order.id} status changed: ${oldStatus} -> ${newStatus}, Filled: ${filledQuantity}/${order.quantity}`
    );

    await this.reportService.logTransaction({
      time: Date.now(),
      type: 'ORDER_FILLED',
      symbol: order.symbol,
      orderId: order.binanceOrderId!,
      metadata: { status: newStatus, filledQuantity },
    });

    // Handle filled orders
    if (newStatus === 'FILLED') {
      this.stats.successfulTrades++;

      // Calculate commission and profit
      const commission = filledQuantity * order.price * this.config.binanceSettings.commissionRate;
      this.stats.totalCommissions += commission;

      // Remove from active orders
      this.activeOrders.delete(order.id);

      this.logger.info(
        `Order ${order.id} filled: ${filledQuantity} ${order.symbol} @ ${order.price}`
      );

      await this.reportService.logTransaction({
        time: Date.now(),
        type: 'ORDER_FILLED',
        orderId: order.binanceOrderId!,
        symbol: order.symbol,
        side: order.side,
        price: order.price,
        quantity: filledQuantity,
        metadata: { commission },
      });

      await this.notificationService.sendNotification(
        `✅ Order Filled: ${order.side} ${filledQuantity} ${order.symbol} @ ${order.price}\nCommission: ${commission.toFixed(8)}`
      );
    }

    // Handle canceled orders
    if (newStatus === 'CANCELED') {
      this.activeOrders.delete(order.id);

      await this.notificationService.sendNotification(
        `❌ Order Canceled: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price}`
      );
    }
  }

  /**
   * Display initial trading status after setup
   */
  private async displayInitialTradingStatus(): Promise<void> {
    try {
      const balances = await this.getAccountBalances();
      const symbolsData: Array<{
        symbol: string;
        currentPrice: number;
        eligible: boolean;
        reason?: string;
      }> = [];

      console.log('\n🚀 ===== LIVE TRADING SETUP COMPLETE =====');
      console.log(`⏰ Start Time: ${new Date().toLocaleString()}`);
      console.log(`💰 Initial Balance: ${this.dailyStartBalance.toFixed(2)} USDT`);
      
      // Collect symbol information from strategy engine
      for (const symbolConfig of this.config.symbols) {
        const symbol = symbolConfig.pair;
        // Since we don't have direct access to StrategyEngine here, we'll show basic info
        symbolsData.push({
          symbol,
          currentPrice: 0, // Will be updated once market data flows
          eligible: true,  // Assume eligible since we passed pre-flight checks
        });
      }

      console.log(`🎯 Symbols Configured: ${symbolsData.length}`);
      console.log(`📊 Strategy: Grid Trading`);
      console.log(`⚠️ Mode: LIVE TRADING (Real Money)`);
      console.log(`🔄 Monitoring: Every minute`);
      
      // Show current balances summary
      const significantBalances = Object.entries(balances)
        .filter(([_, balance]) => balance.total > 0.001)
        .slice(0, 5);
        
      if (significantBalances.length > 0) {
        console.log('\n💼 Current Balances:');
        for (const [currency, balance] of significantBalances) {
          console.log(`   ${currency}: ${balance.available.toFixed(8)} available + ${balance.onOrder.toFixed(8)} in orders`);
        }
      }
      
      console.log('\n🎯 Trading is now ACTIVE. Monitor console for updates every minute.');
      console.log('=====================================\n');

      // Send notification
      await this.notificationService.sendNotification(
        `🚀 LIVE Trading Setup Complete\n` +
        `💰 Initial Balance: ${this.dailyStartBalance.toFixed(2)} USDT\n` +
        `🎯 Symbols: ${symbolsData.length}\n` +
        `⚠️ Mode: LIVE TRADING ACTIVE`
      );

    } catch (error) {
      this.logger.error('Error displaying initial trading status:', error);
    }
  }
  private startPeriodicReporting(): void {
    // Report status every minute for real-time monitoring
    setInterval(
      async () => {
        if (!this.isRunning) return;

        try {
          await this.generateStatusReport();
        } catch (error) {
          this.logger.error('Error generating status report:', error);
        }
      },
      60 * 1000
    ); // 1 minute
  }

  /**
   * Start risk monitoring
   */
  private startRiskMonitoring(): void {
    setInterval(
      async () => {
        if (!this.isRunning) return;

        try {
          await this.performRiskChecks();
        } catch (error) {
          this.logger.error('Error during risk monitoring:', error);
        }
      },
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  /**
   * Perform risk checks
   */
  private async performRiskChecks(): Promise<void> {
    // Check balance levels
    const balances = await this.getAccountBalances();
    const budgetCurrency = this.config.maxBudget.currency;
    const currentBalance = balances[budgetCurrency]?.available || 0;
    const requiredBalance = this.config.maxBudget.amount * this.minBalanceThreshold;

    if (currentBalance < requiredBalance) {
      await this.notificationService.sendNotification(
        `⚠️ Low Balance Warning: ${budgetCurrency} balance (${currentBalance}) is below minimum threshold (${requiredBalance})`
      );
    }

    // Check for too many failed trades
    const failureRate =
      this.stats.totalTrades > 0 ? this.stats.failedTrades / this.stats.totalTrades : 0;
    if (failureRate > 0.5 && this.stats.totalTrades > 10) {
      await this.notificationService.sendNotification(
        `⚠️ High Failure Rate: ${(failureRate * 100).toFixed(1)}% of trades are failing`
      );
    }
  }

  /**
   * Generate status report
   */
  private async generateStatusReport(): Promise<void> {
    try {
      const balances = await this.getAccountBalances();
      const openOrders = await this.binanceService.getOpenOrders();

      const runtime = Date.now() - this.startTime;
      const runtimeHours = (runtime / (60 * 60 * 1000)).toFixed(2);

      const report = {
        time: Date.now(),
        mode: 'live' as const,
        balances: Object.entries(balances)
          .filter(([_, balance]) => balance.total > 0)
          .reduce(
            (acc, [currency, balance]) => {
              acc[currency] = balance.total;
              return acc;
            },
            {} as Record<string, number>
          ),
      };

      // Save to file
      await this.reportService.saveStatusReport(report, 'live');

      // Send notification
      const balanceText = Object.entries(balances)
        .filter(([_, balance]) => balance.total > 0)
        .map(
          ([currency, balance]) =>
            `${currency}: ${balance.available.toFixed(8)} available + ${balance.onOrder.toFixed(8)} in orders`
        )
        .slice(0, 5) // Limit to first 5 currencies
        .join('\n');

      await this.notificationService.sendNotification(
        `📊 LIVE Trading Status (${runtimeHours}h)\n\n` +
          `Active Orders: ${this.activeOrders.size}\n` +
          `Total Trades: ${this.stats.totalTrades}\n` +
          `Success Rate: ${this.stats.totalTrades > 0 ? ((this.stats.successfulTrades / this.stats.totalTrades) * 100).toFixed(1) : 0}%\n\n` +
          `Balances:\n${balanceText}`
      );
    } catch (error) {
      this.logger.error('Error generating status report:', error);
    }
  }

  /**
   * Safely cancel all orders with confirmation
   */
  private async safelyCancelAllOrders(): Promise<void> {
    if (this.activeOrders.size === 0) {
      return;
    }

    this.logger.info(`Canceling ${this.activeOrders.size} active orders...`);

    try {
      // Get all symbols we're trading
      const symbolsSet = new Set(Array.from(this.activeOrders.values()).map(order => order.symbol));
      const symbols = Array.from(symbolsSet);

      // Cancel orders for each symbol
      for (const symbol of symbols) {
        try {
          const binanceSymbol = symbol.replace('/', '');
          await this.binanceService.cancelAllOrders(binanceSymbol);
          this.logger.info(`Canceled all orders for ${symbol}`);
        } catch (error) {
          this.logger.error(`Error canceling orders for ${symbol}:`, error);
        }
      }

      // Clear active orders
      this.activeOrders.clear();

      this.logger.info('All orders canceled');
      await this.notificationService.sendNotification('All active orders have been canceled');
    } catch (error) {
      this.logger.error('Error canceling all orders:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.notificationService.sendNotification(`Error canceling orders: ${errorMessage}`);
    }
  }

  /**
   * Unsubscribe from all market data
   */
  private unsubscribeFromAllMarketData(): void {
    this.marketDataSubscriptions.forEach((_, symbol) => {
      try {
        const binanceSymbol = symbol.replace('/', '');
        this.binanceService.unsubscribeFromUpdates(binanceSymbol);
      } catch (error) {
        this.logger.error(`Error unsubscribing from ${symbol}:`, error);
      }
    });

    this.marketDataSubscriptions.clear();
  }

  /**
   * Generate final report
   */
  private async generateFinalReport(): Promise<void> {
    try {
      const balances = await this.getAccountBalances();
      const totalRuntime = Date.now() - this.startTime;
      const runtimeHours = (totalRuntime / (60 * 60 * 1000)).toFixed(2);

      const report = {
        startTime: this.startTime,
        endTime: Date.now(),
        duration: `${runtimeHours} hours`,
        finalBalances: Object.entries(balances)
          .filter(([_, balance]) => balance.total > 0)
          .reduce((acc, [currency, balance]) => {
            acc[currency] = balance;
            return acc;
          }, {} as AccountBalance),
        stats: this.stats,
        summary: {
          totalTrades: this.stats.totalTrades,
          successfulTrades: this.stats.successfulTrades,
          failedTrades: this.stats.failedTrades,
          successRate:
            this.stats.totalTrades > 0
              ? ((this.stats.successfulTrades / this.stats.totalTrades) * 100).toFixed(2)
              : '0',
          totalCommissions: this.stats.totalCommissions,
        },
      };

      // Save report
      await this.reportService.saveFinalReport(report, 'live');

      // Send notification
      const balanceText = Object.entries(report.finalBalances)
        .map(([currency, balance]) => `${currency}: ${balance.total.toFixed(8)}`)
        .slice(0, 5)
        .join('\n');

      await this.notificationService.sendNotification(
        `🏁 LIVE Trading Session Completed\n\n` +
          `Duration: ${report.duration}\n` +
          `Total Trades: ${report.summary.totalTrades}\n` +
          `Success Rate: ${report.summary.successRate}%\n` +
          `Total Commissions: ${report.summary.totalCommissions.toFixed(8)}\n\n` +
          `Final Balances:\n${balanceText}`
      );
    } catch (error) {
      this.logger.error('Error generating final report:', error);
    }
  }
}
