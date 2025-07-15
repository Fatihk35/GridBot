# Technical Indicators Usage Examples

This document provides comprehensive examples of how to use the technical indicators implemented for the GridBot project.

## Table of Contents

- [Basic Setup](#basic-setup)
- [ATR (Average True Range)](#atr-average-true-range)
- [EMA (Exponential Moving Average)](#ema-exponential-moving-average)
- [Daily Bar Analysis](#daily-bar-analysis)
- [Volatility Analysis](#volatility-analysis)
- [Price Threshold Checking](#price-threshold-checking)
- [Advanced Usage](#advanced-usage)
- [Grid Trading Integration](#grid-trading-integration)

## Basic Setup

First, import the necessary functions and types:

```typescript
import {
  OHLCV,
  calculateATR,
  calculateEMA,
  calculateSMA,
  calculateDailyBarDiffAverage,
  calculateVolatileBarRatio,
  isPriceWithinEmaThreshold,
  calculateBollingerBands,
  calculateRSI,
  calculateVolatility,
  createMockOHLCVFromPrices,
  validateOHLCVArray,
} from '../utils/indicators';
```

### Creating Sample Data

```typescript
// Create sample OHLCV data from price array
const prices = [50000, 50100, 49900, 50200, 50150, 50300];
const ohlcvData = createMockOHLCVFromPrices(prices);

// Or create manual OHLCV data
const manualData: OHLCV[] = [
  {
    time: 1640995200000,
    open: 50000,
    high: 50100,
    low: 49900,
    close: 50050,
    volume: 1500.5
  },
  {
    time: 1640995260000,
    open: 50050,
    high: 50200,
    low: 49950,
    close: 50150,
    volume: 1750.2
  }
];

// Always validate your data before using
validateOHLCVArray(manualData);
```

## ATR (Average True Range)

ATR is used to measure market volatility and determine appropriate grid intervals.

### Basic ATR Calculation

```typescript
// Calculate ATR with default 14-period
const atr14 = calculateATR(ohlcvData);
console.log(`ATR (14): ${atr14.toFixed(2)}`);

// Calculate ATR with custom period
const atr21 = calculateATR(ohlcvData, 21);
console.log(`ATR (21): ${atr21.toFixed(2)}`);
```

### Grid Interval Calculation Using ATR

```typescript
/**
 * Calculate grid intervals based on ATR
 */
function calculateGridIntervals(data: OHLCV[], gridLevels: number = 10): number[] {
  const atr = calculateATR(data);
  const currentPrice = data[data.length - 1].close;
  
  // Use ATR percentage of current price for grid spacing
  const gridSpacing = atr * 0.5; // 50% of ATR
  
  const intervals: number[] = [];
  
  // Create symmetric grid around current price
  for (let i = -(gridLevels / 2); i <= gridLevels / 2; i++) {
    if (i !== 0) { // Skip current price level
      intervals.push(currentPrice + (i * gridSpacing));
    }
  }
  
  return intervals.sort((a, b) => a - b);
}

// Example usage
const gridLevels = calculateGridIntervals(ohlcvData, 8);
console.log('Grid Levels:', gridLevels.map(level => level.toFixed(2)));
```

### Dynamic ATR-Based Stop Loss

```typescript
/**
 * Calculate stop loss based on ATR
 */
function calculateStopLoss(
  data: OHLCV[], 
  entryPrice: number, 
  isLong: boolean, 
  atrMultiplier: number = 2
): number {
  const atr = calculateATR(data);
  
  if (isLong) {
    return entryPrice - (atr * atrMultiplier);
  } else {
    return entryPrice + (atr * atrMultiplier);
  }
}

// Example usage
const entryPrice = 50000;
const longStopLoss = calculateStopLoss(ohlcvData, entryPrice, true, 2);
const shortStopLoss = calculateStopLoss(ohlcvData, entryPrice, false, 2);

console.log(`Long Stop Loss: ${longStopLoss.toFixed(2)}`);
console.log(`Short Stop Loss: ${shortStopLoss.toFixed(2)}`);
```

## EMA (Exponential Moving Average)

EMA is used for trend filtering and dynamic support/resistance levels.

### Basic EMA Calculation

```typescript
// Calculate EMA with different periods
const ema12 = calculateEMA(ohlcvData, 12);
const ema26 = calculateEMA(ohlcvData, 26);
const ema200 = calculateEMA(ohlcvData, 200);

console.log(`EMA 12: ${ema12.toFixed(2)}`);
console.log(`EMA 26: ${ema26.toFixed(2)}`);
console.log(`EMA 200: ${ema200.toFixed(2)}`);
```

### Trend Direction Detection

```typescript
/**
 * Determine trend direction using multiple EMAs
 */
function getTrendDirection(data: OHLCV[]): 'bullish' | 'bearish' | 'sideways' {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const ema50 = calculateEMA(data, 50);
  
  if (ema12 > ema26 && ema26 > ema50) {
    return 'bullish';
  } else if (ema12 < ema26 && ema26 < ema50) {
    return 'bearish';
  } else {
    return 'sideways';
  }
}

// Example usage
const trend = getTrendDirection(ohlcvData);
console.log(`Current trend: ${trend}`);
```

### EMA-Based Entry Signals

```typescript
/**
 * Generate entry signals based on EMA crossover
 */
function getEmaSignal(currentData: OHLCV[], previousData: OHLCV[]): 'buy' | 'sell' | 'hold' {
  const currentEma12 = calculateEMA(currentData, 12);
  const currentEma26 = calculateEMA(currentData, 26);
  
  const previousEma12 = calculateEMA(previousData, 12);
  const previousEma26 = calculateEMA(previousData, 26);
  
  // Golden Cross (bullish signal)
  if (currentEma12 > currentEma26 && previousEma12 <= previousEma26) {
    return 'buy';
  }
  
  // Death Cross (bearish signal)
  if (currentEma12 < currentEma26 && previousEma12 >= previousEma26) {
    return 'sell';
  }
  
  return 'hold';
}

// Example usage (requires historical data)
// const signal = getEmaSignal(currentOhlcvData, previousOhlcvData);
```

## Daily Bar Analysis

Analyze individual bar characteristics for grid strategy optimization.

### Average Bar Difference

```typescript
// Calculate average difference between open and close
const avgBarDiff = calculateDailyBarDiffAverage(ohlcvData, 20);
console.log(`Average bar difference (20 bars): ${avgBarDiff.toFixed(2)}`);

/**
 * Use bar difference for grid sizing
 */
function optimizeGridSpacing(data: OHLCV[], baseLevels: number = 10): number {
  const avgDiff = calculateDailyBarDiffAverage(data, 20);
  const atr = calculateATR(data);
  
  // Combine ATR and average bar difference for optimal spacing
  const optimalSpacing = Math.max(avgDiff * 1.5, atr * 0.3);
  
  return optimalSpacing;
}

const optimalSpacing = optimizeGridSpacing(ohlcvData);
console.log(`Optimal grid spacing: ${optimalSpacing.toFixed(2)}`);
```

### Volatility Ratio Analysis

```typescript
// Calculate percentage of volatile bars
const volatileRatio = calculateVolatileBarRatio(ohlcvData, 20, 0.02); // 2% threshold
console.log(`Volatile bars ratio: ${(volatileRatio * 100).toFixed(1)}%`);

/**
 * Adjust grid strategy based on volatility
 */
function getGridStrategy(data: OHLCV[]): 'aggressive' | 'moderate' | 'conservative' {
  const volatileRatio = calculateVolatileBarRatio(data, 20, 0.02);
  
  if (volatileRatio > 0.6) {
    return 'aggressive'; // High volatility - wider grids, fewer levels
  } else if (volatileRatio > 0.3) {
    return 'moderate'; // Medium volatility - balanced approach
  } else {
    return 'conservative'; // Low volatility - tighter grids, more levels
  }
}

const strategy = getGridStrategy(ohlcvData);
console.log(`Recommended strategy: ${strategy}`);
```

## Volatility Analysis

### Market Volatility Assessment

```typescript
// Calculate different volatility measures
const volatility20 = calculateVolatility(ohlcvData, 20);
const volatility50 = calculateVolatility(ohlcvData, 50);

console.log(`20-period volatility: ${(volatility20 * 100).toFixed(2)}%`);
console.log(`50-period volatility: ${(volatility50 * 100).toFixed(2)}%`);

/**
 * Volatility-based position sizing
 */
function calculatePositionSize(
  accountBalance: number,
  volatility: number,
  riskPercentage: number = 0.02 // 2% risk
): number {
  const riskAmount = accountBalance * riskPercentage;
  const volatilityAdjustment = Math.max(0.1, Math.min(1, 1 - volatility * 10));
  
  return riskAmount * volatilityAdjustment;
}

const positionSize = calculatePositionSize(10000, volatility20, 0.02);
console.log(`Recommended position size: $${positionSize.toFixed(2)}`);
```

## Price Threshold Checking

### EMA Deviation Analysis

```typescript
const currentPrice = ohlcvData[ohlcvData.length - 1].close;
const ema20 = calculateEMA(ohlcvData, 20);

// Check if price is within 5% of EMA
const withinThreshold = isPriceWithinEmaThreshold(currentPrice, ema20, 0.05);
console.log(`Price within 5% of EMA: ${withinThreshold}`);

/**
 * Dynamic grid activation based on EMA distance
 */
function shouldActivateGrid(data: OHLCV[], emaThreshold: number = 0.03): boolean {
  const currentPrice = data[data.length - 1].close;
  const ema50 = calculateEMA(data, 50);
  
  // Activate grid when price is close to long-term EMA
  return isPriceWithinEmaThreshold(currentPrice, ema50, emaThreshold);
}

const activateGrid = shouldActivateGrid(ohlcvData);
console.log(`Should activate grid: ${activateGrid}`);
```

## Advanced Usage

### Bollinger Bands Integration

```typescript
// Calculate Bollinger Bands
const bands = calculateBollingerBands(ohlcvData, 20, 2);
console.log(`Bollinger Bands - Upper: ${bands.upper.toFixed(2)}, Middle: ${bands.middle.toFixed(2)}, Lower: ${bands.lower.toFixed(2)}`);

/**
 * Grid boundaries based on Bollinger Bands
 */
function setBollingerGridBounds(data: OHLCV[]): { upper: number; lower: number } {
  const bands = calculateBollingerBands(data, 20, 2);
  
  return {
    upper: bands.upper,
    lower: bands.lower
  };
}

const gridBounds = setBollingerGridBounds(ohlcvData);
console.log(`Grid bounds - Upper: ${gridBounds.upper.toFixed(2)}, Lower: ${gridBounds.lower.toFixed(2)}`);
```

### RSI-Based Grid Modification

```typescript
// Calculate RSI
const rsi = calculateRSI(ohlcvData);
console.log(`RSI: ${rsi.toFixed(2)}`);

/**
 * Modify grid behavior based on RSI
 */
function getGridBias(data: OHLCV[]): 'buy' | 'sell' | 'neutral' {
  const rsi = calculateRSI(data);
  
  if (rsi < 30) {
    return 'buy'; // Oversold - favor buy orders
  } else if (rsi > 70) {
    return 'sell'; // Overbought - favor sell orders
  } else {
    return 'neutral'; // Balanced grid
  }
}

const gridBias = getGridBias(ohlcvData);
console.log(`Grid bias: ${gridBias}`);
```

## Grid Trading Integration

### Complete Grid Setup Example

```typescript
/**
 * Complete grid trading setup using technical indicators
 */
class GridSetup {
  constructor(private data: OHLCV[]) {
    validateOHLCVArray(this.data);
  }

  generateGridConfig() {
    const currentPrice = this.data[this.data.length - 1].close;
    const atr = calculateATR(this.data);
    const ema20 = calculateEMA(this.data, 20);
    const volatileRatio = calculateVolatileBarRatio(this.data, 20, 0.02);
    const rsi = calculateRSI(this.data);
    
    // Dynamic grid spacing based on ATR and volatility
    const baseSpacing = atr * 0.5;
    const volatilityMultiplier = volatileRatio > 0.5 ? 1.5 : 1.0;
    const gridSpacing = baseSpacing * volatilityMultiplier;
    
    // Number of grid levels based on market conditions
    const gridLevels = volatileRatio > 0.5 ? 8 : 12;
    
    // Grid bias based on RSI and EMA
    const emaBias = currentPrice > ema20 ? 'bullish' : 'bearish';
    const rsiBias = rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral';
    
    // Calculate grid levels
    const buyLevels: number[] = [];
    const sellLevels: number[] = [];
    
    for (let i = 1; i <= gridLevels / 2; i++) {
      buyLevels.push(currentPrice - (i * gridSpacing));
      sellLevels.push(currentPrice + (i * gridSpacing));
    }
    
    return {
      currentPrice,
      gridSpacing: gridSpacing.toFixed(2),
      buyLevels: buyLevels.map(level => level.toFixed(2)),
      sellLevels: sellLevels.map(level => level.toFixed(2)),
      emaBias,
      rsiBias,
      volatileRatio: (volatileRatio * 100).toFixed(1) + '%',
      atr: atr.toFixed(2),
      ema20: ema20.toFixed(2),
      rsi: rsi.toFixed(2)
    };
  }
}

// Example usage
const gridSetup = new GridSetup(ohlcvData);
const config = gridSetup.generateGridConfig();

console.log('Grid Configuration:', JSON.stringify(config, null, 2));
```

### Real-time Grid Adjustment

```typescript
/**
 * Dynamically adjust grid parameters based on market conditions
 */
function adjustGridParameters(
  currentConfig: any,
  newData: OHLCV[]
): { action: string; newConfig?: any } {
  const newAtr = calculateATR(newData);
  const currentAtr = parseFloat(currentConfig.atr);
  
  // Significant ATR change threshold (20%)
  const atrChangeThreshold = 0.2;
  const atrChange = Math.abs(newAtr - currentAtr) / currentAtr;
  
  if (atrChange > atrChangeThreshold) {
    // Recalculate grid with new parameters
    const gridSetup = new GridSetup(newData);
    const newConfig = gridSetup.generateGridConfig();
    
    return {
      action: 'recalculate',
      newConfig
    };
  }
  
  // Check for trend change
  const newEma = calculateEMA(newData, 20);
  const currentPrice = newData[newData.length - 1].close;
  const newBias = currentPrice > newEma ? 'bullish' : 'bearish';
  
  if (newBias !== currentConfig.emaBias) {
    return {
      action: 'adjust_bias',
      newConfig: { ...currentConfig, emaBias: newBias }
    };
  }
  
  return { action: 'maintain' };
}
```

## Performance Considerations

### Efficient Data Management

```typescript
/**
 * Efficient indicator calculation for real-time updates
 */
class IndicatorManager {
  private dataWindow: OHLCV[] = [];
  private readonly maxWindowSize = 200; // Keep only recent data
  
  addData(newBar: OHLCV) {
    this.dataWindow.push(newBar);
    
    // Maintain sliding window
    if (this.dataWindow.length > this.maxWindowSize) {
      this.dataWindow.shift();
    }
  }
  
  getIndicators() {
    if (this.dataWindow.length < 50) {
      throw new Error('Insufficient data for indicator calculation');
    }
    
    return {
      atr: calculateATR(this.dataWindow),
      ema20: calculateEMA(this.dataWindow, 20),
      ema50: calculateEMA(this.dataWindow, 50),
      rsi: calculateRSI(this.dataWindow),
      volatility: calculateVolatility(this.dataWindow, 20),
      volatileRatio: calculateVolatileBarRatio(this.dataWindow, 20, 0.02)
    };
  }
}

// Example usage
const indicatorManager = new IndicatorManager();

// Add historical data
ohlcvData.forEach(bar => indicatorManager.addData(bar));

// Get current indicators
const indicators = indicatorManager.getIndicators();
console.log('Current Indicators:', indicators);
```

This documentation provides comprehensive examples for using the technical indicators in various grid trading scenarios. The examples demonstrate practical applications, error handling, and performance considerations essential for a production trading system.
