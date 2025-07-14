# GridBot Usage Examples

This document provides comprehensive examples of how to use the GridBot Grid Strategy Engine.

## Quick Start

```typescript
import { StrategyEngine } from './services/StrategyEngine';
import { BinanceService } from './services/BinanceService';
import { ConfigLoader } from './config/ConfigLoader';

// Load configuration
const configLoader = new ConfigLoader();
const config = await configLoader.loadConfig();

// Initialize services
const binanceService = new BinanceService(config);
const strategyEngine = new StrategyEngine(config);

// Initialize Binance connection
await binanceService.initialize();

// Get historical data for BTCUSDT
const historicalData = await binanceService.getHistoricalData('BTCUSDT', '1h', 300);

// Initialize strategy for the symbol
strategyEngine.initializeStrategy('BTCUSDT', historicalData);

// Get trading signals
const signals = strategyEngine.getTradeSignals('BTCUSDT');

console.log('Buy signals:', signals.buy.length);
console.log('Sell signals:', signals.sell.length);
```

## Configuration Examples

### Basic Configuration

```json
{
  "tradeMode": "papertrade",
  "exchange": "binance",
  "maxBudget": {
    "amount": 10000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "minDailyBarDiffThreshold": 100,
      "gridSize": 1000,
      "pricePrecision": 2,
      "quantityPrecision": 6
    }
  ],
  "apiKeys": {
    "binanceApiKey": "your-api-key",
    "binanceSecretKey": "your-secret-key"
  },
  "strategySettings": {
    "barCountForVolatility": 24,
    "minVolatilityPercentage": 0.01,
    "minVolatileBarRatio": 0.3,
    "emaPeriod": 200,
    "emaDeviationThreshold": 0.1
  },
  "binanceSettings": {
    "testnet": true,
    "commissionRate": 0.001
  },
  "logging": {
    "enableConsoleOutput": true,
    "enableTelegramOutput": false,
    "reportDirectory": "./reports",
    "transactionLogFileName": "transactions.log"
  }
}
```

### Advanced Multi-Symbol Configuration

```json
{
  "tradeMode": "live",
  "exchange": "binance",
  "maxBudget": {
    "amount": 50000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "minDailyBarDiffThreshold": 200,
      "gridSize": 2000,
      "pricePrecision": 2,
      "quantityPrecision": 6
    },
    {
      "pair": "ETHUSDT",
      "minDailyBarDiffThreshold": 10,
      "gridSize": 500,
      "pricePrecision": 2,
      "quantityPrecision": 6
    },
    {
      "pair": "ADAUSDT",
      "minDailyBarDiffThreshold": 0.01,
      "gridSize": 100,
      "pricePrecision": 4,
      "quantityPrecision": 2
    }
  ]
}
```

## Strategy Engine Examples

### Custom Strategy Configuration

```typescript
const customStrategyConfig = {
  gridLevelsCount: 30,
  gridIntervalMethod: 'ATR' as const,
  atrPeriod: 21,
  emaPeriod: 200,
  emaDeviationThreshold: 0.05,
  profitTargetMultiplier: 6,
  dcaMultipliers: {
    standard: 1,
    moderate: 2.5,
    aggressive: 5
  },
  gridRecalculationIntervalHours: 24
};

const strategyEngine = new StrategyEngine(config, customStrategyConfig);
```

### Working with Grid Levels

```typescript
// Initialize strategy
strategyEngine.initializeStrategy('BTCUSDT', historicalData);

// Get strategy state
const state = strategyEngine.getStrategyState('BTCUSDT');
console.log('Current price:', state?.currentPrice);
console.log('Grid levels:', state?.gridLevels.length);
console.log('Open positions:', state?.openPositions.size);

// Get metrics
const metrics = strategyEngine.getMetrics('BTCUSDT');
console.log('Total trades:', metrics?.totalTrades);
console.log('Win rate:', metrics?.winRate + '%');
console.log('Total profit:', metrics?.totalProfit);
```

### Handling Order Execution

```typescript
// Get trading signals
const signals = strategyEngine.getTradeSignals('BTCUSDT');

// Process buy signals
for (const buySignal of signals.buy) {
  try {
    // Place order (example with paper trading)
    const orderId = Date.now(); // Mock order ID
    
    // Mark grid level as filled
    strategyEngine.markGridLevelFilled(
      buySignal.symbol,
      buySignal.gridLevel.index,
      buySignal.price,
      buySignal.quantity,
      orderId
    );
    
    console.log(`Buy order placed: ${buySignal.quantity} ${buySignal.symbol} at ${buySignal.price}`);
  } catch (error) {
    console.error('Failed to place buy order:', error);
  }
}

// Process sell signals
for (const sellSignal of signals.sell) {
  try {
    // Process completed trade
    strategyEngine.processCompletedTrade(
      sellSignal.symbol,
      sellSignal.gridLevel.index,
      sellSignal.price,
      sellSignal.quantity
    );
    
    console.log(`Sell order completed: ${sellSignal.quantity} ${sellSignal.symbol} at ${sellSignal.price}`);
  } catch (error) {
    console.error('Failed to process sell order:', error);
  }
}
```

## GridBot Main Class Examples

### Basic Usage

```typescript
import { GridBot } from './models/GridBot';

// Create GridBot from configuration file
const gridBot = await GridBot.fromConfigFile('./config/config.json');

// Start the bot
await gridBot.start();

// Get status
const status = gridBot.getStatus();
console.log('Bot running:', status.isRunning);
console.log('Active symbols:', status.activeSymbols);
console.log('Total trades:', status.totalTrades);
console.log('Total profit:', status.totalProfit);

// Get detailed symbol status
const btcStatus = gridBot.getSymbolStatus('BTCUSDT');
console.log('BTC state:', btcStatus.state);
console.log('BTC metrics:', btcStatus.metrics);

// Get profit/loss report
const report = gridBot.getProfitLossReport();
console.log('Total profit:', report.totalProfit);
report.symbolBreakdown.forEach(symbol => {
  console.log(`${symbol.symbol}: ${symbol.profit} USDT (${symbol.trades} trades, ${symbol.winRate}% win rate)`);
});

// Stop the bot
await gridBot.stop();
```

### Advanced Usage with Custom Handling

```typescript
import { GridBot } from './models/GridBot';

class CustomGridBot {
  private gridBot: GridBot;
  private isMonitoring: boolean = false;

  constructor(configPath: string) {
    this.init(configPath);
  }

  private async init(configPath: string) {
    this.gridBot = await GridBot.fromConfigFile(configPath);
  }

  async start() {
    await this.gridBot.start();
    this.startMonitoring();
  }

  async stop() {
    this.isMonitoring = false;
    await this.gridBot.stop();
  }

  private startMonitoring() {
    this.isMonitoring = true;
    
    // Custom monitoring loop
    setInterval(() => {
      if (!this.isMonitoring) return;
      
      const status = this.gridBot.getStatus();
      
      // Custom logic for monitoring
      if (status.errors.length > 0) {
        console.warn('Errors detected:', status.errors);
        // Handle errors (e.g., send alerts)
      }
      
      // Check for significant profit/loss
      const report = this.gridBot.getProfitLossReport();
      if (report.totalProfit > 1000) {
        console.log('Significant profit detected:', report.totalProfit);
        // Custom action (e.g., adjust strategy)
      }
      
      if (report.totalProfit < -500) {
        console.warn('Loss threshold reached:', report.totalProfit);
        // Custom action (e.g., pause trading)
      }
      
    }, 30000); // Check every 30 seconds
  }

  // Custom method to recalculate strategies for all symbols
  async recalculateAllStrategies() {
    const status = this.gridBot.getStatus();
    
    for (const symbol of status.activeSymbols) {
      try {
        await this.gridBot.recalculateStrategy(symbol);
        console.log(`Strategy recalculated for ${symbol}`);
      } catch (error) {
        console.error(`Failed to recalculate strategy for ${symbol}:`, error);
      }
    }
  }
}

// Usage
const customBot = new CustomGridBot('./config/config.json');
await customBot.start();

// Recalculate strategies every hour
setInterval(() => {
  customBot.recalculateAllStrategies();
}, 60 * 60 * 1000);
```

## CLI Usage Examples

### Basic Commands

```bash
# Start with default configuration
npm start

# Start with custom configuration
npm start -- --config ./my-config.json

# Test API connection
npm start -- --test-connection

# Enable verbose logging
npm start -- --verbose

# Show help
npm start -- --help

# Show version
npm start -- --version
```

### Advanced CLI Usage

```bash
# Test connection with custom config
npm start -- --config ./prod-config.json --test-connection

# Start with verbose logging and custom config
npm start -- --config ./config/live.json --verbose

# Production deployment example
NODE_ENV=production npm start -- --config ./config/production.json > bot.log 2>&1 &
```

## Testing Examples

### Unit Testing

```typescript
import { StrategyEngine } from '../services/StrategyEngine';
import { generateMockCandlestickData } from './helpers/mockData';

describe('StrategyEngine Integration', () => {
  let strategyEngine: StrategyEngine;
  let mockData: CandlestickData[];

  beforeEach(() => {
    const mockConfig = createMockConfig();
    strategyEngine = new StrategyEngine(mockConfig);
    mockData = generateMockCandlestickData(300);
  });

  test('should generate trading signals', () => {
    strategyEngine.initializeStrategy('BTCUSDT', mockData);
    
    const signals = strategyEngine.getTradeSignals('BTCUSDT');
    
    expect(signals.buy).toBeDefined();
    expect(signals.sell).toBeDefined();
    expect(Array.isArray(signals.buy)).toBe(true);
    expect(Array.isArray(signals.sell)).toBe(true);
  });

  test('should track profit/loss correctly', () => {
    strategyEngine.initializeStrategy('BTCUSDT', mockData);
    
    // Simulate filled order
    strategyEngine.markGridLevelFilled('BTCUSDT', 5, 50000, 0.02, 12345);
    
    // Simulate completed trade
    strategyEngine.processCompletedTrade('BTCUSDT', 5, 51000, 0.02);
    
    const metrics = strategyEngine.getMetrics('BTCUSDT');
    expect(metrics?.totalTrades).toBe(1);
    expect(metrics?.totalProfit).toBeGreaterThan(0);
  });
});
```

### Integration Testing

```typescript
describe('GridBot Integration', () => {
  test('should initialize and start successfully', async () => {
    const gridBot = await GridBot.fromConfigFile('./config/test-config.json');
    
    await expect(gridBot.start()).resolves.not.toThrow();
    
    const status = gridBot.getStatus();
    expect(status.isRunning).toBe(true);
    expect(status.activeSymbols.length).toBeGreaterThan(0);
    
    await gridBot.stop();
    expect(gridBot.getStatus().isRunning).toBe(false);
  });
});
```

## Performance Optimization Examples

### Memory Management

```typescript
// Proper cleanup
class GridBotManager {
  private gridBot: GridBot;
  private cleanupInterval: NodeJS.Timeout;

  async start() {
    this.gridBot = await GridBot.fromConfigFile('./config/config.json');
    await this.gridBot.start();
    
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // Every hour
  }

  async stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.gridBot.stop();
  }

  private performCleanup() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    console.log('Memory usage:', {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB'
    });
  }
}
```

### Rate Limiting Best Practices

```typescript
// Configure rate limiting for optimal performance
const binanceConfig = {
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
  baseURL: 'https://api.binance.com',
  maxRetries: 3,
  requestsPerSecond: 10, // Conservative rate limit
  burstSize: 20
};

const binanceService = new BinanceService(binanceConfig);
```

## Error Handling Examples

### Robust Error Handling

```typescript
class RobustGridBot {
  private gridBot: GridBot;
  private errorCount: number = 0;
  private maxErrors: number = 10;

  async start() {
    try {
      this.gridBot = await GridBot.fromConfigFile('./config/config.json');
      await this.gridBot.start();
    } catch (error) {
      await this.handleError('Startup error', error);
    }
  }

  private async handleError(context: string, error: any) {
    this.errorCount++;
    console.error(`${context}:`, error);

    if (this.errorCount >= this.maxErrors) {
      console.error('Too many errors, shutting down...');
      await this.gridBot?.stop();
      process.exit(1);
    }

    // Reset error count after successful operation
    setTimeout(() => {
      if (this.errorCount > 0) {
        this.errorCount--;
      }
    }, 60000); // Reset one error per minute
  }
}
```

This documentation provides comprehensive examples of how to use the GridBot system effectively. Each example includes error handling, proper resource management, and best practices for production deployment.
