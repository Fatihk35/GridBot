# NotificationService Usage Guide

The NotificationService provides comprehensive notification capabilities for the GridBot trading system, supporting console output, file logging, and Telegram messaging with proper error handling and retry mechanisms.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [Notification Types](#notification-types)
- [Trading Notifications](#trading-notifications)
- [Error Handling](#error-handling)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The NotificationService is designed to handle all notification requirements for the GridBot system, including:

- Console logging with different severity levels
- File-based logging through Winston integration
- Telegram Bot API integration for real-time messages
- Structured notification formatting
- Retry mechanisms for external services
- Type-safe validation with Zod schemas

## Configuration

The service is configured through the main bot configuration:

```typescript
import { BotConfigType } from '@/config/schema';

const config: BotConfigType = {
  // ... other configuration
  logging: {
    enableConsoleOutput: true,     // Enable console notifications
    enableTelegramOutput: true,    // Enable Telegram notifications
    reportDirectory: './reports',  // Directory for log files
    transactionLogFileName: 'transactions.log'
  },
  apiKeys: {
    telegramBotToken: 'YOUR_BOT_TOKEN',  // Required for Telegram
    telegramChatId: 'YOUR_CHAT_ID',      // Required for Telegram
    // ... other API keys
  }
};
```

### Environment Variables

You can also configure the service using environment variables:

```bash
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Logging Configuration  
LOG_LEVEL=info
ENABLE_CONSOLE_OUTPUT=true
ENABLE_TELEGRAM_OUTPUT=true
```

## Basic Usage

### Initialization

```typescript
import { NotificationService } from '@/services/NotificationService';
import { Logger } from '@/utils/logger';
import { BotConfigType } from '@/config/schema';

// Initialize with configuration
const logger = Logger.getInstance();
const notificationService = new NotificationService(config, logger);

// The service initializes automatically and tests Telegram connectivity
```

### Simple Notifications

```typescript
// Basic info notification
await notificationService.sendNotification(
  'Trading bot started successfully',
  'info'
);

// Warning notification
await notificationService.sendNotification(
  'Price volatility detected',
  'warning'
);

// Error notification
await notificationService.sendNotification(
  'Failed to connect to exchange',
  'error'
);

// Success notification
await notificationService.sendNotification(
  'Order executed successfully',
  'success'
);
```

## Notification Types

The service supports four notification types:

### Info (`info`)
- 🔵 For general information
- Default logging level
- Used for status updates and general events

### Warning (`warning`)
- ⚠️ For potential issues
- Non-critical alerts
- Market condition changes

### Error (`error`)
- 🚨 For critical issues
- System failures
- API errors

### Success (`success`)
- ✅ For positive outcomes
- Successful operations
- Goal achievements

## Trading Notifications

### Trade Execution Notifications

```typescript
// Notify about a trade execution
await notificationService.sendTradingNotification(
  'Order Filled',           // Action description
  'BTCUSDT',               // Trading pair
  50000.00,                // Price
  0.1,                     // Quantity
  'BUY',                   // Side (BUY/SELL)
  'live'                   // Mode (paper/live)
);
```

This generates a formatted message like:
```
🟢 Live Trade: Order Filled
Symbol: BTCUSDT
Side: BUY
Price: 50000.00000000
Quantity: 0.10000000
Value: 5000.00 USDT
```

### Status Updates

```typescript
// Send comprehensive status update
await notificationService.sendStatusNotification(
  'Daily Trading Summary', 
  {
    totalTrades: 15,
    profit: 125.50,
    winRate: 0.73,
    balance: 10125.50
  }
);
```

## Error Handling

### Error Notifications with Context

```typescript
try {
  // Some trading operation
  await binanceService.placeOrder(orderData);
} catch (error) {
  // Send detailed error notification
  await notificationService.sendErrorNotification(
    error,
    'Order Placement',
    {
      symbol: orderData.symbol,
      side: orderData.side,
      quantity: orderData.quantity
    }
  );
}
```

### Structured Error Handling

```typescript
// Handle different error types
const handleTradingError = async (error: Error, context: string) => {
  if (error.message.includes('INSUFFICIENT_BALANCE')) {
    await notificationService.sendErrorNotification(
      'Insufficient balance for trade execution',
      context,
      { errorCode: 'BALANCE_ERROR', suggestion: 'Check account balance' }
    );
  } else if (error.message.includes('MARKET_CLOSED')) {
    await notificationService.sendNotification(
      'Market is closed, pausing trading',
      'warning'
    );
  } else {
    await notificationService.sendErrorNotification(error, context);
  }
};
```

## Advanced Features

### Structured Notifications

```typescript
import { NotificationMessage } from '@/types';

// Create custom structured notification
const customNotification: NotificationMessage = {
  type: 'info',
  title: 'Custom Alert',
  message: 'Market trend analysis completed',
  timestamp: Date.now(),
  metadata: {
    trend: 'bullish',
    confidence: 0.85,
    timeframe: '4h',
    indicators: ['RSI', 'MACD', 'EMA']
  }
};

await notificationService.sendStructuredNotification(customNotification);
```

### Metadata Integration

```typescript
// Add context metadata to notifications
await notificationService.sendNotification(
  'Grid strategy activated',
  'info',
  {
    strategy: 'grid_trading',
    symbol: 'BTCUSDT',
    gridLevels: 10,
    priceRange: { min: 45000, max: 55000 },
    timestamp: Date.now()
  }
);
```

### Notification Formatting

The service automatically formats notifications for different channels:

#### Console Output
```
2024-01-15T10:30:00.123Z [Information] Grid strategy activated
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "metadata": {
    "strategy": "grid_trading",
    "symbol": "BTCUSDT"
  }
}
```

#### Telegram Output
```
ℹ️ *Information*

Grid strategy activated

_Metadata:_
• strategy: `grid_trading`
• symbol: `BTCUSDT`
• gridLevels: `10`

_2024-01-15, 10:30:00_
```

## Best Practices

### 1. Use Appropriate Notification Types

```typescript
// ✅ Good: Use appropriate types
await notificationService.sendNotification('Order filled', 'success');
await notificationService.sendNotification('High volatility detected', 'warning');
await notificationService.sendNotification('API connection failed', 'error');

// ❌ Avoid: Using wrong types
await notificationService.sendNotification('Critical error', 'info'); // Should be 'error'
```

### 2. Include Relevant Metadata

```typescript
// ✅ Good: Include useful context
await notificationService.sendNotification(
  'Stop loss triggered',
  'warning',
  {
    symbol: 'BTCUSDT',
    triggerPrice: 48500,
    currentPrice: 48450,
    loss: -2.5
  }
);

// ❌ Avoid: No context
await notificationService.sendNotification('Stop loss triggered', 'warning');
```

### 3. Handle Errors Gracefully

```typescript
// ✅ Good: Wrap in try-catch
try {
  await notificationService.sendTradingNotification(/* ... */);
} catch (notificationError) {
  console.error('Failed to send notification:', notificationError);
  // Continue with main logic
}

// ❌ Avoid: Letting notification errors break main flow
await notificationService.sendTradingNotification(/* ... */); // Could throw
```

### 4. Use Trading-Specific Methods

```typescript
// ✅ Good: Use specialized methods for trades
await notificationService.sendTradingNotification(
  'Position Opened',
  'BTCUSDT',
  50000,
  0.1,
  'BUY',
  'live'
);

// ❌ Avoid: Generic notifications for trades
await notificationService.sendNotification(
  'Bought 0.1 BTCUSDT at 50000',
  'info'
);
```

## Examples

### Complete Trading Bot Integration

```typescript
import { NotificationService } from '@/services/NotificationService';
import { BinanceService } from '@/services/BinanceService';
import { ConfigLoader } from '@/config/ConfigLoader';

class TradingBot {
  private notificationService: NotificationService;
  private binanceService: BinanceService;

  constructor() {
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadConfig();
    this.notificationService = new NotificationService(config);
    this.binanceService = new BinanceService(config);
  }

  async start(): Promise<void> {
    try {
      await this.notificationService.sendNotification(
        'Trading bot initializing...',
        'info'
      );

      await this.binanceService.initialize();
      
      await this.notificationService.sendNotification(
        'Trading bot started successfully',
        'success',
        {
          mode: 'live',
          exchange: 'binance',
          strategies: ['grid_trading']
        }
      );

      await this.runTradingLoop();
    } catch (error) {
      await this.notificationService.sendErrorNotification(
        error,
        'Bot Initialization'
      );
      throw error;
    }
  }

  private async executeTrade(order: OrderData): Promise<void> {
    try {
      const result = await this.binanceService.placeOrder(order);
      
      // Use new enhanced trade notification method
      await this.notificationService.sendTradeNotification({
        symbol: order.symbol,
        side: order.side,
        price: result.price,
        quantity: result.quantity,
        mode: 'live'
      });
    } catch (error) {
      await this.notificationService.sendErrorNotification(
        error,
        'Trade Execution',
        {
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity
        }
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.notificationService.sendNotification(
      'Trading bot shutting down...',
      'info'
    );
    
    await this.notificationService.destroy();
  }
}
```

### Error Recovery Example

```typescript
class ErrorRecoveryManager {
  constructor(private notificationService: NotificationService) {}

  async handleApiError(error: Error, operation: string): Promise<boolean> {
    // Send immediate error notification
    await this.notificationService.sendErrorNotification(
      error,
      operation,
      { severity: 'high', requiresAttention: true }
    );

    // Determine if recovery is possible
    if (this.isRecoverableError(error)) {
      await this.notificationService.sendNotification(
        `Attempting to recover from ${operation} error`,
        'warning',
        { recoveryAttempt: 1 }
      );
      
      return this.attemptRecovery(operation);
    }

    // Unrecoverable error
    await this.notificationService.sendNotification(
      `Critical error in ${operation} - manual intervention required`,
      'error',
      { 
        requiresManualIntervention: true,
        suggestedActions: ['Check API keys', 'Verify network connectivity']
      }
    );
    
    return false;
  }
}
```

### Monitoring and Alerts

```typescript
class MonitoringService {
  constructor(private notificationService: NotificationService) {}

  async checkSystemHealth(): Promise<void> {
    const health = await this.getSystemHealth();
    
    if (health.status === 'healthy') {
      // Only send detailed health reports periodically
      if (this.shouldSendPeriodicUpdate()) {
        await this.notificationService.sendStatusNotification({
          mode: 'live',
          balances: health.balances,
          profit: health.profit,
          trades: health.totalTrades
        });
      }
    } else {
      // Always alert on health issues
      await this.notificationService.sendNotification(
        `System health warning: ${health.issues.join(', ')}`,
        'warning',
        {
          issues: health.issues,
          recommendations: health.recommendations
        }
      );
    }
  }

  async monitorPerformance(): Promise<void> {
    const metrics = {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      activeConnections: 5,
      errorRate: 0.03 // 3%
    };

    await this.notificationService.sendPerformanceNotification(metrics);
  }
}
```

## Resource Cleanup

Always ensure proper cleanup when shutting down:

```typescript
// At application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  try {
    await notificationService.sendNotification(
      'Application shutting down',
      'info'
    );
    
    // Give time for notification to send
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Clean up resources
    await notificationService.destroy();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  process.exit(0);
});
```

This comprehensive NotificationService provides robust, type-safe notification capabilities that integrate seamlessly with the GridBot trading system while maintaining high code quality and reliability standards.
