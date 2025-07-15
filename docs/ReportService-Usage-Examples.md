# ReportService Usage Examples

The ReportService provides comprehensive reporting functionality for the GridBot project, including transaction logging, backtest report generation, and status monitoring.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Transaction Logging](#transaction-logging)
- [Backtest Report Generation](#backtest-report-generation)
- [Status and Final Reports](#status-and-final-reports)
- [Report Retrieval](#report-retrieval)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)

## Basic Setup

```typescript
import { ReportService } from '../services/ReportService';
import { Logger } from '../utils/logger';

// Initialize with default logger
const reportService = new ReportService('./reports');

// Or with custom logger
const customLogger = Logger.getInstance();
const reportService = new ReportService('./reports', customLogger);
```

## Transaction Logging

### Basic Transaction Logging

```typescript
// Log a buy order
await reportService.logTransaction({
  time: Date.now(),
  type: 'ORDER_FILLED',
  symbol: 'BTCUSDT',
  side: 'BUY',
  price: 50000,
  quantity: 0.001,
  orderId: 'order-123',
});

// Log a sell order
await reportService.logTransaction({
  time: Date.now(),
  type: 'ORDER_FILLED',
  symbol: 'BTCUSDT',
  side: 'SELL',
  price: 51000,
  quantity: 0.001,
  orderId: 'order-124',
});
```

### Different Transaction Types

```typescript
// Order created
await reportService.logTransaction({
  time: Date.now(),
  type: 'ORDER_CREATED',
  symbol: 'ETHUSDT',
  side: 'BUY',
  price: 3000,
  quantity: 0.1,
  orderId: 'order-125',
});

// Order canceled
await reportService.logTransaction({
  time: Date.now(),
  type: 'ORDER_CANCELED',
  symbol: 'ETHUSDT',
  orderId: 'order-125',
  metadata: {
    reason: 'User canceled',
    originalPrice: 3000
  }
});

// Position opened/closed
await reportService.logTransaction({
  time: Date.now(),
  type: 'POSITION_OPENED',
  symbol: 'ADAUSDT',
  side: 'BUY',
  price: 0.5,
  quantity: 1000,
  metadata: {
    strategy: 'grid-trading',
    gridLevel: 1
  }
});
```

## Backtest Report Generation

### JSON Report Generation

```typescript
import { BacktestResult } from '../types/backtest';

const backtestResult: BacktestResult = {
  id: 'backtest-001',
  createdAt: Date.now(),
  version: '1.0.0',
  config: {
    startTime: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days ago
    endTime: Date.now(),
    symbols: ['BTCUSDT', 'ETHUSDT'],
    interval: '1h',
    initialBalance: 10000,
    slippagePercentage: 0.001,
    enableDetailedLogging: true,
    saveHistoricalData: true,
    maxConcurrentSymbols: 2,
  },
  // ... other required fields
};

// Save as JSON (default)
const jsonPath = await reportService.saveBacktestReport(backtestResult, {
  format: 'json',
  includeTrades: true,
  includePortfolioHistory: true,
  includeSymbolBreakdown: true,
});

console.log(`JSON report saved to: ${jsonPath}`);
```

### CSV Report Generation

```typescript
// Save as CSV with all data
const csvPath = await reportService.saveBacktestReport(backtestResult, {
  format: 'csv',
  includeTrades: true,
  includePortfolioHistory: true,
  includeSymbolBreakdown: true,
});

console.log(`CSV reports saved to directory: ${csvPath}`);
// This creates multiple CSV files:
// - summary.csv (performance summary)
// - trades.csv (all trade details)
// - portfolio_history.csv (portfolio snapshots over time)
// - symbol_performance.csv (per-symbol performance metrics)
```

### HTML Report Generation

```typescript
// Save as HTML for visual reports
const htmlPath = await reportService.saveBacktestReport(backtestResult, {
  format: 'html',
  includeSymbolBreakdown: true,
  includeCharts: false, // Charts not implemented yet
});

console.log(`HTML report saved to: ${htmlPath}`);
```

### Custom Report Options

```typescript
// Minimal report (summary only)
await reportService.saveBacktestReport(backtestResult, {
  format: 'json',
  includeTrades: false,
  includePortfolioHistory: false,
  includeSymbolBreakdown: false,
});

// Trades-focused report
await reportService.saveBacktestReport(backtestResult, {
  format: 'csv',
  includeTrades: true,
  includePortfolioHistory: false,
  includeSymbolBreakdown: true,
});
```

## Status and Final Reports

### Status Reports (Real-time Monitoring)

```typescript
// Save current trading status
const statusReport = {
  time: Date.now(),
  mode: 'papertrade' as const,
  balances: {
    USDT: 9500.25,
    BTC: 0.025,
    ETH: 2.1
  },
  openOrders: [
    {
      id: 'order-126',
      symbol: 'BTCUSDT',
      side: 'BUY' as const,
      price: 49000,
      quantity: 0.001,
      status: 'NEW'
    }
  ],
  performance: {
    totalReturn: 5.25,
    drawdown: -2.1,
    trades: 45
  }
};

await reportService.saveStatusReport(statusReport, 'papertrade');
```

### Final Reports (Session Summary)

```typescript
// Save final trading session report
const finalReport = {
  startTime: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
  endTime: Date.now(),
  duration: '1 day',
  finalBalances: {
    USDT: 10125.50,
    BTC: 0,
    ETH: 0
  },
  profitLoss: {
    USDT: 125.50
  },
  trades: [
    // Array of completed trades
  ],
  totalTrades: 25,
  winningTrades: 16,
  losingTrades: 9,
  winRate: 64.0
};

await reportService.saveFinalReport(finalReport, 'live');
```

## Report Retrieval

### List Available Reports

```typescript
// Get list of all backtest reports
const reports = await reportService.getBacktestReports();

console.log('Available reports:');
reports.forEach(report => {
  console.log(`ID: ${report.id}, Date: ${report.date}, Path: ${report.path}`);
});

// Example output:
// ID: backtest-001, Date: 2024-01-15T10:30:00:000Z, Path: /reports/backtests/backtest_backtest-001_2024-01-15T10-30-00-000Z.json
```

### Load Specific Report

```typescript
import fs from 'fs/promises';

// Load a specific report by path
const reports = await reportService.getBacktestReports();
if (reports.length > 0) {
  const latestReport = reports[0]; // Reports are sorted by date (newest first)
  const reportData = JSON.parse(await fs.readFile(latestReport.path, 'utf8'));
  
  console.log('Latest backtest results:');
  console.log(`Total Return: ${reportData.summary.totalReturn}`);
  console.log(`Win Rate: ${reportData.summary.overallWinRate}%`);
  console.log(`Total Trades: ${reportData.summary.totalTrades}`);
}
```

## Configuration Options

### Report Format Options

```typescript
interface ReportOptions {
  format: 'json' | 'csv' | 'html' | 'pdf'; // pdf not yet implemented
  includeCharts: boolean;        // For future chart generation
  includeTrades: boolean;        // Include individual trade details
  includePortfolioHistory: boolean; // Include portfolio snapshots
  includeSymbolBreakdown: boolean;  // Include per-symbol performance
  outputPath?: string;           // Custom output path (optional)
  template?: string;             // Custom template (optional)
}
```

### Directory Structure

The ReportService automatically creates the following directory structure:

```
reports/
├── backtests/           # Backtest reports
│   ├── backtest_id_timestamp.json
│   ├── backtest_id_timestamp.html
│   └── backtest_id_timestamp/   # CSV reports directory
│       ├── summary.csv
│       ├── trades.csv
│       ├── portfolio_history.csv
│       └── symbol_performance.csv
├── transactions/        # Daily transaction logs
│   ├── transactions_2024-01-15.jsonl
│   └── transactions_2024-01-16.jsonl
├── status/             # Status reports
│   └── status_mode_timestamp.json
└── final/              # Final session reports
    └── final_mode_timestamp.json
```

## Error Handling

### Transaction Logging Errors

```typescript
try {
  await reportService.logTransaction({
    time: Date.now(),
    type: 'ORDER_FILLED',
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: 50000,
    quantity: 0.001,
  });
} catch (error) {
  console.error('Failed to log transaction:', error);
  // Handle error appropriately - maybe retry or use fallback logging
}
```

### Report Generation Errors

```typescript
try {
  const reportPath = await reportService.saveBacktestReport(backtestResult);
  console.log(`Report saved successfully: ${reportPath}`);
} catch (error) {
  console.error('Failed to save backtest report:', error);
  
  // Try saving with minimal options as fallback
  try {
    const fallbackPath = await reportService.saveBacktestReport(backtestResult, {
      format: 'json',
      includeTrades: false,
      includePortfolioHistory: false,
      includeSymbolBreakdown: false,
    });
    console.log(`Fallback report saved: ${fallbackPath}`);
  } catch (fallbackError) {
    console.error('Fallback report also failed:', fallbackError);
  }
}
```

### Data Validation Errors

```typescript
// The ReportService uses Zod validation for data integrity
try {
  await reportService.logTransaction({
    time: 'invalid-time', // This will cause validation error
    type: 'ORDER_FILLED',
    symbol: 'BTCUSDT',
  });
} catch (error) {
  if (error.name === 'ZodError') {
    console.error('Invalid transaction data:', error.issues);
    // Handle validation errors specifically
  } else {
    console.error('Other error:', error);
  }
}
```

## Performance Considerations

### Batch Transaction Logging

```typescript
// For high-frequency trading, consider batching transactions
const transactions = [];

// Collect transactions
transactions.push({
  time: Date.now(),
  type: 'ORDER_FILLED',
  symbol: 'BTCUSDT',
  side: 'BUY',
  price: 50000,
  quantity: 0.001,
});

// Log in batch (implementation would need modification)
// Currently each transaction is logged individually
for (const transaction of transactions) {
  await reportService.logTransaction(transaction);
}
```

### Large Dataset Handling

```typescript
// For large backtests, consider using streaming or chunked processing
const largeBacktestResult = {
  // ... result with thousands of trades
  trades: Array(10000).fill(null).map((_, i) => ({
    id: `trade-${i}`,
    timestamp: Date.now() + i * 1000,
    // ... other trade properties
  }))
};

// Save without including all trades in memory-intensive formats
await reportService.saveBacktestReport(largeBacktestResult, {
  format: 'json', // More efficient than HTML for large datasets
  includeTrades: false, // Skip trades in summary report
  includePortfolioHistory: true,
  includeSymbolBreakdown: true,
});

// Save trades separately as CSV for better performance
await reportService.saveBacktestReport(largeBacktestResult, {
  format: 'csv',
  includeTrades: true,
  includePortfolioHistory: false,
  includeSymbolBreakdown: false,
});
```

## Integration Examples

### With GridBot Trading

```typescript
import { ReportService } from './services/ReportService';
import { GridBot } from './models/GridBot';

class TradingSession {
  private reportService: ReportService;
  private gridBot: GridBot;

  constructor(reportsPath: string) {
    this.reportService = new ReportService(reportsPath);
    this.gridBot = new GridBot(/* config */);
  }

  async startTrading() {
    // Log session start
    await this.reportService.logTransaction({
      time: Date.now(),
      type: 'POSITION_OPENED',
      symbol: 'BTCUSDT',
      metadata: { 
        sessionStart: true,
        strategy: 'grid-trading'
      }
    });

    // Set up periodic status reporting
    setInterval(async () => {
      await this.saveCurrentStatus();
    }, 60000); // Every minute

    // Trade execution with logging
    this.gridBot.on('orderFilled', async (order) => {
      await this.reportService.logTransaction({
        time: Date.now(),
        type: 'ORDER_FILLED',
        symbol: order.symbol,
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        orderId: order.id,
      });
    });
  }

  private async saveCurrentStatus() {
    const balances = await this.gridBot.getBalances();
    const openOrders = await this.gridBot.getOpenOrders();
    const performance = await this.gridBot.getPerformance();

    await this.reportService.saveStatusReport({
      time: Date.now(),
      mode: 'live',
      balances,
      openOrders,
      performance,
    }, 'live');
  }

  async stopTrading() {
    const finalReport = await this.gridBot.getFinalReport();
    await this.reportService.saveFinalReport(finalReport, 'live');
  }
}
```

This documentation provides comprehensive examples for using the ReportService in various scenarios, from basic transaction logging to advanced backtest report generation and integration with the broader GridBot system.
