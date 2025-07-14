# Binance Service Usage Examples

This document provides comprehensive examples of how to use the BinanceService class for interacting with the Binance API.

## Table of Contents
- [Basic Setup](#basic-setup)
- [Historical Data](#historical-data)
- [Account Information](#account-information)
- [Order Management](#order-management)
- [Real-time Data (WebSocket)](#real-time-data-websocket)
- [Price Information](#price-information)
- [Symbol Information](#symbol-information)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Advanced Usage](#advanced-usage)

## Basic Setup

### Initialize the Service

```typescript
import { BinanceService } from '@/services/BinanceService';
import { ConfigLoader } from '@/config/ConfigLoader';

// Load configuration
const configLoader = new ConfigLoader();
const config = await configLoader.loadConfig();

// Create and initialize Binance service
const binanceService = new BinanceService(config);
await binanceService.initialize();
```

### Configuration Example

```json
{
  "tradeMode": "papertrade",
  "exchange": "binance",
  "apiKeys": {
    "binanceApiKey": "your-api-key",
    "binanceSecretKey": "your-secret-key"
  },
  "binanceSettings": {
    "testnet": true,
    "commissionRate": 0.001
  }
}
```

## Historical Data

### Fetch Klines/Candlestick Data

```typescript
// Get 24 hours of hourly data
const endTime = Date.now();
const startTime = endTime - (24 * 60 * 60 * 1000);

const klines = await binanceService.getHistoricalKlines({
  symbol: 'BTCUSDT',
  interval: '1h',
  startTime,
  endTime,
  limit: 24
});

console.log(`Fetched ${klines.length} klines`);
klines.forEach(kline => {
  console.log(`Time: ${new Date(kline.openTime)}, Close: ${kline.close}`);
});
```

### Different Time Intervals

```typescript
// 1-minute data for scalping
const minuteData = await binanceService.getHistoricalKlines({
  symbol: 'ETHUSDT',
  interval: '1m',
  limit: 100
});

// Daily data for trend analysis
const dailyData = await binanceService.getHistoricalKlines({
  symbol: 'BTCUSDT',
  interval: '1d',
  limit: 30
});

// Weekly data for long-term analysis
const weeklyData = await binanceService.getHistoricalKlines({
  symbol: 'BTCUSDT',
  interval: '1w',
  limit: 52
});
```

## Account Information

### Get Account Balance

```typescript
const accountInfo = await binanceService.getAccountInfo();

console.log('Account Type:', accountInfo.accountType);
console.log('Can Trade:', accountInfo.canTrade);

// Find specific asset balance
const btcBalance = accountInfo.balances.find(b => b.asset === 'BTC');
const usdtBalance = accountInfo.balances.find(b => b.asset === 'USDT');

console.log(`BTC Balance: ${btcBalance?.free} (Available: ${btcBalance?.free})`);
console.log(`USDT Balance: ${usdtBalance?.free} (Available: ${usdtBalance?.free})`);

// Calculate total portfolio value in USDT
let totalValue = 0;
for (const balance of accountInfo.balances) {
  if (parseFloat(balance.free) > 0) {
    if (balance.asset === 'USDT') {
      totalValue += parseFloat(balance.free);
    } else {
      // Get price for non-USDT assets
      try {
        const price = await binanceService.getSymbolPrice(`${balance.asset}USDT`);
        totalValue += parseFloat(balance.free) * parseFloat(price.price);
      } catch (error) {
        console.warn(`Could not get price for ${balance.asset}`);
      }
    }
  }
}

console.log(`Total Portfolio Value: ${totalValue.toFixed(2)} USDT`);
```

## Order Management

### Market Orders

```typescript
// Market buy order
const buyOrder = await binanceService.createOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quoteOrderQty: 100 // Buy $100 worth of BTC
});

console.log('Buy Order:', buyOrder);

// Market sell order
const sellOrder = await binanceService.createOrder({
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'MARKET',
  quantity: 0.001 // Sell 0.001 BTC
});

console.log('Sell Order:', sellOrder);
```

### Limit Orders

```typescript
// Get current price
const currentPrice = await binanceService.getSymbolPrice('BTCUSDT');
const price = parseFloat(currentPrice.price);

// Place limit buy order 1% below current price
const limitBuyOrder = await binanceService.createOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 0.001,
  price: price * 0.99,
  timeInForce: 'GTC' // Good Till Cancelled
});

console.log('Limit Buy Order:', limitBuyOrder);

// Place limit sell order 2% above current price
const limitSellOrder = await binanceService.createOrder({
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'LIMIT',
  quantity: 0.001,
  price: price * 1.02,
  timeInForce: 'GTC'
});

console.log('Limit Sell Order:', limitSellOrder);
```

### Order Status and Management

```typescript
// Query order status
const orderStatus = await binanceService.queryOrder({
  symbol: 'BTCUSDT',
  orderId: limitBuyOrder.orderId
});

console.log('Order Status:', orderStatus.status);
console.log('Executed Quantity:', orderStatus.executedQty);

// Cancel order if not filled
if (orderStatus.status === 'NEW' || orderStatus.status === 'PARTIALLY_FILLED') {
  const cancelResult = await binanceService.cancelOrder({
    symbol: 'BTCUSDT',
    orderId: limitBuyOrder.orderId
  });
  
  console.log('Order Cancelled:', cancelResult);
}
```

### Order Validation Example

```typescript
// The service automatically validates orders against symbol filters
try {
  await binanceService.createOrder({
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    quantity: 0.000001, // Too small quantity
    price: 50000
  });
} catch (error) {
  if (error instanceof BinanceSymbolFilterError) {
    console.error('Order validation failed:', error.message);
    console.error('Filter type:', error.filterType);
  }
}
```

## Real-time Data (WebSocket)

### Subscribe to Kline Updates

```typescript
// Subscribe to 1-minute kline updates for BTCUSDT
const subscriptionId = binanceService.subscribeToKlineUpdates(
  'BTCUSDT',
  '1m',
  (data) => {
    const kline = data.k;
    console.log(`${data.s} - Open: ${kline.o}, Close: ${kline.c}, Volume: ${kline.v}`);
    
    // Check if kline is closed (completed)
    if (kline.x) {
      console.log('Kline closed:', {
        symbol: kline.s,
        interval: kline.i,
        openTime: new Date(kline.t),
        closeTime: new Date(kline.T),
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v)
      });
    }
  }
);

// Unsubscribe later
setTimeout(() => {
  binanceService.unsubscribeFromUpdates(subscriptionId);
  console.log('Unsubscribed from kline updates');
}, 60000); // Unsubscribe after 1 minute
```

### Multiple Symbol Subscriptions

```typescript
const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
const subscriptions: string[] = [];

symbols.forEach(symbol => {
  const subId = binanceService.subscribeToKlineUpdates(
    symbol,
    '1m',
    (data) => {
      console.log(`${data.s}: ${data.k.c}`);
    }
  );
  subscriptions.push(subId);
});

// Cleanup all subscriptions
function cleanup() {
  subscriptions.forEach(subId => {
    binanceService.unsubscribeFromUpdates(subId);
  });
}

process.on('SIGINT', cleanup);
```

## Price Information

### Current Symbol Prices

```typescript
// Single symbol price
const btcPrice = await binanceService.getSymbolPrice('BTCUSDT');
console.log(`BTC Price: $${btcPrice.price}`);

// Multiple symbol prices (sequential)
const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
for (const symbol of symbols) {
  const price = await binanceService.getSymbolPrice(symbol);
  console.log(`${symbol}: $${price.price}`);
}
```

### 24hr Ticker Statistics

```typescript
// Single symbol ticker
const btcTicker = await binanceService.get24hrTicker('BTCUSDT');
console.log('BTC 24hr Stats:', {
  symbol: btcTicker.symbol,
  lastPrice: btcTicker.lastPrice,
  priceChange: btcTicker.priceChange,
  priceChangePercent: btcTicker.priceChangePercent,
  volume: btcTicker.volume,
  high: btcTicker.highPrice,
  low: btcTicker.lowPrice
});

// All symbols ticker (use carefully - large response)
const allTickers = await binanceService.get24hrTicker();
console.log(`Received data for ${(allTickers as any[]).length} symbols`);

// Find top gainers
const gainers = (allTickers as any[])
  .filter(ticker => parseFloat(ticker.priceChangePercent) > 0)
  .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
  .slice(0, 10);

console.log('Top 10 Gainers:');
gainers.forEach((ticker, index) => {
  console.log(`${index + 1}. ${ticker.symbol}: +${ticker.priceChangePercent}%`);
});
```

## Symbol Information

### Get Symbol Details

```typescript
const symbolInfo = await binanceService.getSymbolInfo('BTCUSDT');

if (symbolInfo) {
  console.log('Symbol Info:', {
    symbol: symbolInfo.symbol,
    status: symbolInfo.status,
    baseAsset: symbolInfo.baseAsset,
    quoteAsset: symbolInfo.quoteAsset,
    isSpotTradingAllowed: symbolInfo.isSpotTradingAllowed
  });

  // Check filters
  const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
  const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
  const minNotionalFilter = symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL');

  if (priceFilter) {
    console.log('Price constraints:', {
      minPrice: priceFilter.minPrice,
      maxPrice: priceFilter.maxPrice,
      tickSize: priceFilter.tickSize
    });
  }

  if (lotSizeFilter) {
    console.log('Quantity constraints:', {
      minQty: lotSizeFilter.minQty,
      maxQty: lotSizeFilter.maxQty,
      stepSize: lotSizeFilter.stepSize
    });
  }

  if (minNotionalFilter) {
    console.log('Minimum notional:', minNotionalFilter.minNotional);
  }
}
```

### Exchange Information

```typescript
const exchangeInfo = await binanceService.getExchangeInfo();

console.log('Exchange Info:', {
  timezone: exchangeInfo.timezone,
  serverTime: new Date(exchangeInfo.serverTime),
  symbolCount: exchangeInfo.symbols.length
});

// Find all USDT trading pairs
const usdtPairs = exchangeInfo.symbols
  .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
  .map(s => s.symbol);

console.log(`Found ${usdtPairs.length} USDT trading pairs`);
```

## Error Handling

### Comprehensive Error Handling

```typescript
import {
  BinanceApiError,
  BinanceRateLimitError,
  BinanceWebSocketError,
  BinanceOrderValidationError,
  BinanceSymbolFilterError
} from '@/utils/binanceErrors';

async function robustTrading() {
  try {
    const result = await binanceService.createOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: 100
    });
    
    console.log('Order successful:', result);
    
  } catch (error) {
    if (error instanceof BinanceRateLimitError) {
      console.error('Rate limit exceeded');
      console.log(`Retry after: ${error.retryAfter} seconds`);
      
      if (error.retryAfter) {
        await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
        // Retry the operation
      }
      
    } else if (error instanceof BinanceOrderValidationError) {
      console.error('Order validation failed:', error.message);
      console.log('Symbol:', error.symbol);
      console.log('Order params:', error.orderParams);
      
    } else if (error instanceof BinanceSymbolFilterError) {
      console.error('Symbol filter violation:', error.message);
      console.log('Filter type:', error.filterType);
      
    } else if (error instanceof BinanceApiError) {
      console.error('Binance API error:', error.message);
      console.log('Error code:', error.binanceCode);
      
      if (error.isAuthenticationError()) {
        console.error('Authentication failed - check API keys');
      } else if (error.isInsufficientBalance()) {
        console.error('Insufficient balance for order');
      }
      
    } else if (error instanceof BinanceWebSocketError) {
      console.error('WebSocket error:', error.message);
      
    } else {
      console.error('Unknown error:', error);
    }
  }
}
```

### Retry Logic Example

```typescript
async function retryableOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof BinanceApiError && error.isRetryable()) {
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError!;
}

// Usage
const accountInfo = await retryableOperation(() => 
  binanceService.getAccountInfo()
);
```

## Rate Limiting

### Monitor Rate Limit Status

```typescript
// Check rate limit status
const rateLimitStatus = binanceService.getRateLimitStatus();

console.log('Rate Limit Status:', {
  dailyRequests: rateLimitStatus.dailyRequestCount,
  dailyOrders: rateLimitStatus.dailyOrderCount,
  requestsPerSecond: rateLimitStatus.requestsPerSecond,
  orderRequestsPerSecond: rateLimitStatus.orderRequestsPerSecond,
  isNearLimit: rateLimitStatus.isNearLimit
});

if (rateLimitStatus.isNearLimit) {
  console.warn('Approaching rate limits - consider slowing down requests');
}
```

### Batch Operations with Rate Limiting

```typescript
async function batchGetPrices(symbols: string[]): Promise<Array<{symbol: string, price: string}>> {
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const priceData = await binanceService.getSymbolPrice(symbol);
      results.push(priceData);
      
      // Check if we're approaching limits
      const status = binanceService.getRateLimitStatus();
      if (status.isNearLimit) {
        console.log('Rate limit approaching, adding delay...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
    }
  }
  
  return results;
}
```

## Advanced Usage

### Grid Trading Example

```typescript
class SimpleGridTrader {
  private binanceService: BinanceService;
  private symbol: string;
  private gridLevels: number[] = [];
  private orders: Map<number, any> = new Map();

  constructor(binanceService: BinanceService, symbol: string) {
    this.binanceService = binanceService;
    this.symbol = symbol;
  }

  async setupGrid(centerPrice: number, gridSpacing: number, levels: number) {
    // Calculate grid levels
    for (let i = -levels; i <= levels; i++) {
      this.gridLevels.push(centerPrice + (i * gridSpacing));
    }

    console.log(`Grid setup with ${this.gridLevels.length} levels`);
  }

  async placeGridOrders() {
    const currentPrice = await this.binanceService.getSymbolPrice(this.symbol);
    const price = parseFloat(currentPrice.price);

    for (const gridLevel of this.gridLevels) {
      try {
        if (gridLevel < price) {
          // Place buy order below current price
          const order = await this.binanceService.createOrder({
            symbol: this.symbol,
            side: 'BUY',
            type: 'LIMIT',
            quantity: 0.001,
            price: gridLevel,
            timeInForce: 'GTC'
          });
          
          this.orders.set(order.orderId, { ...order, gridLevel, side: 'BUY' });
          
        } else if (gridLevel > price) {
          // Place sell order above current price
          const order = await this.binanceService.createOrder({
            symbol: this.symbol,
            side: 'SELL',
            type: 'LIMIT',
            quantity: 0.001,
            price: gridLevel,
            timeInForce: 'GTC'
          });
          
          this.orders.set(order.orderId, { ...order, gridLevel, side: 'SELL' });
        }
      } catch (error) {
        console.error(`Failed to place grid order at ${gridLevel}:`, error);
      }
    }

    console.log(`Placed ${this.orders.size} grid orders`);
  }

  async monitorGrid() {
    // Subscribe to real-time price updates
    const subscriptionId = this.binanceService.subscribeToKlineUpdates(
      this.symbol,
      '1m',
      async (data) => {
        if (data.k.x) { // Kline closed
          await this.checkOrderFills();
        }
      }
    );

    return subscriptionId;
  }

  private async checkOrderFills() {
    for (const [orderId, orderInfo] of this.orders) {
      try {
        const status = await this.binanceService.queryOrder({
          symbol: this.symbol,
          orderId
        });

        if (status.status === 'FILLED') {
          console.log(`Grid order filled: ${orderInfo.side} at ${orderInfo.gridLevel}`);
          this.orders.delete(orderId);
          
          // Place opposite order at the same level
          await this.placeOppositeOrder(orderInfo);
        }
      } catch (error) {
        console.error(`Error checking order ${orderId}:`, error);
      }
    }
  }

  private async placeOppositeOrder(filledOrder: any) {
    const oppositeSide = filledOrder.side === 'BUY' ? 'SELL' : 'BUY';
    
    try {
      const order = await this.binanceService.createOrder({
        symbol: this.symbol,
        side: oppositeSide,
        type: 'LIMIT',
        quantity: 0.001,
        price: filledOrder.gridLevel,
        timeInForce: 'GTC'
      });
      
      this.orders.set(order.orderId, { 
        ...order, 
        gridLevel: filledOrder.gridLevel, 
        side: oppositeSide 
      });
      
      console.log(`Placed opposite ${oppositeSide} order at ${filledOrder.gridLevel}`);
    } catch (error) {
      console.error(`Failed to place opposite order:`, error);
    }
  }
}

// Usage
const gridTrader = new SimpleGridTrader(binanceService, 'BTCUSDT');
await gridTrader.setupGrid(50000, 100, 10); // $50k center, $100 spacing, 10 levels each side
await gridTrader.placeGridOrders();
const monitoringId = await gridTrader.monitorGrid();
```

### Portfolio Rebalancing

```typescript
async function rebalancePortfolio(targetAllocations: Record<string, number>) {
  const accountInfo = await binanceService.getAccountInfo();
  const totalValue = await calculatePortfolioValue(accountInfo.balances);
  
  for (const [asset, targetPercent] of Object.entries(targetAllocations)) {
    const currentBalance = accountInfo.balances.find(b => b.asset === asset);
    const currentValue = currentBalance ? parseFloat(currentBalance.free) : 0;
    
    if (asset === 'USDT') {
      continue; // Skip USDT for now
    }
    
    const targetValue = totalValue * targetPercent;
    const difference = targetValue - currentValue;
    
    if (Math.abs(difference) > 10) { // Only rebalance if difference > $10
      const symbol = `${asset}USDT`;
      
      try {
        if (difference > 0) {
          // Need to buy more
          await binanceService.createOrder({
            symbol,
            side: 'BUY',
            type: 'MARKET',
            quoteOrderQty: difference
          });
          console.log(`Bought $${difference} of ${asset}`);
        } else {
          // Need to sell some
          const price = await binanceService.getSymbolPrice(symbol);
          const quantity = Math.abs(difference) / parseFloat(price.price);
          
          await binanceService.createOrder({
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity
          });
          console.log(`Sold $${Math.abs(difference)} of ${asset}`);
        }
      } catch (error) {
        console.error(`Failed to rebalance ${asset}:`, error);
      }
    }
  }
}

async function calculatePortfolioValue(balances: any[]): Promise<number> {
  let total = 0;
  
  for (const balance of balances) {
    const free = parseFloat(balance.free);
    if (free > 0) {
      if (balance.asset === 'USDT') {
        total += free;
      } else {
        try {
          const price = await binanceService.getSymbolPrice(`${balance.asset}USDT`);
          total += free * parseFloat(price.price);
        } catch (error) {
          // Skip assets without USDT pair
        }
      }
    }
  }
  
  return total;
}

// Rebalance to 50% BTC, 30% ETH, 20% USDT
await rebalancePortfolio({
  'BTC': 0.5,
  'ETH': 0.3,
  'USDT': 0.2
});
```

## Cleanup

Always remember to cleanup resources when done:

```typescript
// Cleanup WebSocket connections and other resources
binanceService.destroy();
```

This comprehensive guide covers all major functionality of the BinanceService. Remember to always test with small amounts on testnet before using with real funds, and implement proper error handling and rate limiting in production applications.
