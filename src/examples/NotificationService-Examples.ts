/**
 * NotificationService Example Usage
 * This file demonstrates comprehensive usage of the NotificationService
 * for the GridBot trading system.
 */

import { NotificationService } from '../services/NotificationService';
import { ConfigLoader } from '../config/ConfigLoader';
import { Logger } from '../utils/logger';

/**
 * Helper function to create a sample configuration for examples
 */
function createExampleConfig() {
  return {
    tradeMode: 'papertrade' as const,
    exchange: 'binance' as const,
    maxBudget: {
      amount: 10000,
      currency: 'USDT',
    },
    symbols: [
      {
        pair: 'BTCUSDT',
        minDailyBarDiffThreshold: 0.01,
        gridSize: 100,
        pricePrecision: 8,
        quantityPrecision: 8,
      },
    ],
    apiKeys: {
      binanceApiKey: 'example-api-key',
      binanceSecretKey: 'example-secret-key',
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
    },
    strategySettings: {
      barCountForVolatility: 20,
      minVolatilityPercentage: 0.02,
      minVolatileBarRatio: 0.3,
      emaPeriod: 200,
      emaDeviationThreshold: 0.05,
    },
    binanceSettings: {
      testnet: true,
      commissionRate: 0.001,
    },
    logging: {
      enableConsoleOutput: true,
      enableTelegramOutput: !!process.env.TELEGRAM_BOT_TOKEN,
      reportDirectory: './reports',
      transactionLogFileName: 'transactions.log',
    },
  };
}

/**
 * Example 1: Basic Initialization and Setup
 */
async function basicSetupExample(): Promise<void> {
  console.log('=== Basic NotificationService Setup ===');
  
  // Create example configuration
  const config = createExampleConfig();
  const logger = Logger.getInstance();
  
  // Initialize notification service
  const notificationService = new NotificationService(config, logger);
  
  // Send basic notifications
  await notificationService.sendNotification(
    'GridBot trading system initialized successfully',
    'success'
  );
  
  // Send notification with metadata
  await notificationService.sendNotification(
    'Market analysis complete',
    'info',
    {
      symbol: 'BTCUSDT',
      volatility: 0.025,
      trend: 'bullish',
      confidence: 0.87
    }
  );
  
  console.log('Basic setup example completed');
}

/**
 * Example 2: Trading Notifications
 */
async function tradingNotificationsExample(): Promise<void> {
  console.log('=== Trading Notifications Examples ===');
  
  const config = createExampleConfig();
  const notificationService = new NotificationService(config);
  
  // Example: Live trading notification
  await notificationService.sendTradingNotification(
    'Order Executed',
    'BTCUSDT',
    51250.75,
    0.05,
    'BUY',
    'live'
  );
  
  // Example: Paper trading notification
  await notificationService.sendTradingNotification(
    'Grid Level Hit',
    'ETHUSDT', 
    3125.50,
    0.25,
    'SELL',
    'paper'
  );
  
  // Example: Using the enhanced sendTradeNotification method
  await notificationService.sendTradeNotification({
    symbol: 'ADAUSDT',
    side: 'BUY',
    price: 0.45,
    quantity: 2000,
    mode: 'live'
  });
  
  console.log('Trading notifications example completed');
}

/**
 * Example 3: Status and Performance Monitoring
 */
async function statusMonitoringExample(): Promise<void> {
  console.log('=== Status and Performance Monitoring ===');
  
  const config = createExampleConfig();
  const notificationService = new NotificationService(config);
  
  // Send structured status update
  await notificationService.sendStatusNotification({
    mode: 'live',
    balances: {
      USDT: 8750.25,
      BTC: 0.175,
      ETH: 2.5
    },
    profit: 375.50,
    trades: 28
  });
  
  // Send performance metrics
  const performanceMetrics = {
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    activeConnections: 5,
    errorRate: 0.03 // 3% error rate
  };
  
  await notificationService.sendPerformanceNotification(performanceMetrics);
  
  console.log('Status monitoring example completed');
}

/**
 * Example 4: Error Handling and Notifications
 */
async function errorHandlingExample(): Promise<void> {
  console.log('=== Error Handling Examples ===');
  
  const config = createExampleConfig();
  const notificationService = new NotificationService(config);
  
  try {
    // Simulate a trading error
    throw new Error('Insufficient balance for trade execution');
  } catch (error) {
    // Send detailed error notification
    await notificationService.sendErrorNotification(
      error as Error,
      'Order Placement',
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.1,
        attemptedPrice: 50000,
        availableBalance: 2500
      }
    );
  }
  
  // Different log levels
  notificationService.log('Debug information about market conditions', 'DEBUG');
  notificationService.log('Grid strategy activated', 'INFO');
  notificationService.log('High volatility detected', 'WARNING');
  notificationService.log('Critical system error occurred', 'ERROR');
  
  console.log('Error handling example completed');
}

/**
 * Example 5: Real-world Trading Bot Integration
 */
class ExampleTradingBot {
  private notificationService!: NotificationService;
  private isRunning = false;
  private totalTrades = 0;
  private currentProfit = 0;
  private balances = { USDT: 10000, BTC: 0, ETH: 0 };
  private monitoringInterval: NodeJS.Timeout | undefined;

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();
      this.notificationService = new NotificationService(config);
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      await this.notificationService.sendNotification(
        'GridBot starting up...',
        'info',
        { mode: 'live', startTime: new Date().toISOString() }
      );

      // Simulate initialization
      await this.initialize();
      
      this.isRunning = true;
      
      await this.notificationService.sendNotification(
        'GridBot successfully started and ready for trading',
        'success',
        {
          mode: 'live',
          strategiesLoaded: ['grid_trading', 'dca'],
          initialBalance: this.balances.USDT
        }
      );

      // Start trading loop
      await this.runTradingLoop();
      
    } catch (error) {
      await this.notificationService.sendErrorNotification(
        error instanceof Error ? error : new Error(String(error)),
        'Bot Startup',
        { phase: 'initialization' }
      );
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    // Simulate API connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.notificationService.sendNotification(
      'Connected to Binance API successfully',
      'success'
    );
  }

  private async runTradingLoop(): Promise<void> {
    let loopCount = 0;
    
    while (this.isRunning && loopCount < 5) { // Limit for demo
      try {
        // Simulate market analysis
        await this.analyzeMarket();
        
        // Simulate trade execution
        if (Math.random() > 0.6) { // 40% chance to trade
          await this.executeTrade();
        }
        
        // Send periodic status updates
        if (loopCount % 2 === 0) {
          await this.sendStatusUpdate();
        }
        
        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, 2000));
        loopCount++;
        
      } catch (error) {
        await this.notificationService.sendErrorNotification(
          error instanceof Error ? error : new Error(String(error)),
          'Trading Loop',
          { iteration: loopCount }
        );
      }
    }
    
    await this.stop();
  }

  private async analyzeMarket(): Promise<void> {
    // Simulate market analysis
    const volatility = Math.random() * 0.1; // 0-10% volatility
    
    if (volatility > 0.05) {
      await this.notificationService.sendNotification(
        `High volatility detected: ${(volatility * 100).toFixed(2)}%`,
        'warning',
        { volatility, marketCondition: 'volatile' }
      );
    }
  }

  private async executeTrade(): Promise<void> {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
    const sides: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
    
    const symbol = symbols[Math.floor(Math.random() * symbols.length)] ?? 'BTCUSDT';
    const side = sides[Math.floor(Math.random() * sides.length)] ?? 'BUY';
    const price = Math.random() * 50000 + 10000; // Random price
    const quantity = Math.random() * 0.1 + 0.01; // Random quantity
    
    try {
      // Simulate trade execution
      await this.notificationService.sendTradeNotification({
        symbol,
        side,
        price,
        quantity,
        mode: 'live'
      });
      
      // Update statistics
      this.totalTrades++;
      const tradeValue = price * quantity;
      this.currentProfit += (side === 'BUY' ? -tradeValue : tradeValue) * 0.01; // 1% profit simulation
      
      // Update balances (simplified)
      if (side === 'BUY') {
        this.balances.USDT -= tradeValue;
      } else {
        this.balances.USDT += tradeValue;
      }
      
    } catch (error) {
      await this.notificationService.sendErrorNotification(
        error instanceof Error ? error : new Error(String(error)),
        'Trade Execution',
        { symbol, side, price, quantity }
      );
    }
  }

  private async sendStatusUpdate(): Promise<void> {
    await this.notificationService.sendStatusNotification({
      mode: 'live',
      balances: this.balances,
      profit: this.currentProfit,
      trades: this.totalTrades
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    await this.notificationService.sendNotification(
      'GridBot shutting down...',
      'info',
      {
        finalStats: {
          totalTrades: this.totalTrades,
          finalProfit: this.currentProfit,
          uptime: process.uptime()
        }
      }
    );
    
    // Cleanup
    await this.notificationService.destroy();
    
    console.log('Trading bot stopped');
  }
}

/**
 * Example 6: Monitoring and Alert System
 */
class MonitoringSystem {
  private notificationService!: NotificationService;
  private monitoringInterval: NodeJS.Timeout | undefined;

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();
      this.notificationService = new NotificationService(config);
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  }

  startMonitoring(): void {
    console.log('Starting system monitoring...');
    
    this.monitoringInterval = setInterval(async () => {
      await this.checkSystemHealth();
    }, 30000); // Check every 30 seconds
  }

  private async checkSystemHealth(): Promise<void> {
    const metrics = {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      activeConnections: Math.floor(Math.random() * 10) + 1,
      errorRate: Math.random() * 0.2 // 0-20% error rate
    };

    // Send performance notification
    await this.notificationService.sendPerformanceNotification(metrics);

    // Check for specific issues
    if (metrics.errorRate > 0.1) {
      await this.notificationService.sendNotification(
        'High error rate detected - investigating...',
        'warning',
        {
          errorRate: metrics.errorRate,
          recommendation: 'Check network connectivity and API status'
        }
      );
    }

    if (metrics.memoryUsage.heapUsed > metrics.memoryUsage.heapTotal * 0.8) {
      await this.notificationService.sendNotification(
        'Memory usage is high - consider restarting application',
        'warning',
        {
          memoryUsagePercent: (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal * 100).toFixed(2)
        }
      );
    }
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('System monitoring stopped');
    }
  }
}

/**
 * Main execution function
 */
async function runExamples(): Promise<void> {
  console.log('🚀 Starting NotificationService Examples\n');

  try {
    // Run examples sequentially
    await basicSetupExample();
    console.log('');
    
    await tradingNotificationsExample();
    console.log('');
    
    await statusMonitoringExample();
    console.log('');
    
    await errorHandlingExample();
    console.log('');

    // Run trading bot example
    console.log('=== Trading Bot Integration Example ===');
    const bot = new ExampleTradingBot();
    await bot.start();
    console.log('');

    // Run monitoring system example
    console.log('=== Monitoring System Example ===');
    const monitor = new MonitoringSystem();
    monitor.startMonitoring();
    
    // Run monitoring for 10 seconds then stop
    await new Promise(resolve => setTimeout(resolve, 10000));
    monitor.stopMonitoring();

    console.log('\n✅ All NotificationService examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export for use in other modules
export {
  basicSetupExample,
  tradingNotificationsExample,
  statusMonitoringExample,
  errorHandlingExample,
  ExampleTradingBot,
  MonitoringSystem,
  runExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
