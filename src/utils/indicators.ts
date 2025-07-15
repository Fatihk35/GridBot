/**
 * Technical indicators utility functions for Grid Trading Bot
 * Implements ATR, EMA, and other indicators required for grid strategy
 */

import { z } from 'zod';

/**
 * OHLCV data interface for technical analysis
 */
export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Validation schema for OHLCV data
 */
export const OHLCVSchema = z.object({
  time: z.number().int().positive(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
}).refine((data) => {
  return data.high >= data.low && 
         data.high >= data.open && 
         data.high >= data.close &&
         data.low <= data.open &&
         data.low <= data.close;
}, {
  message: "Invalid OHLCV data: high must be >= low, open, close and low must be <= open, close"
});

/**
 * Validate OHLCV data array
 */
export function validateOHLCVArray(data: OHLCV[]): void {
  if (!Array.isArray(data)) {
    throw new Error('OHLCV data must be an array');
  }
  
  // Allow empty arrays - indicators will handle them gracefully
  if (data.length === 0) {
    return;
  }
  
  data.forEach((item, index) => {
    try {
      OHLCVSchema.parse(item);
    } catch (error) {
      throw new Error(`Invalid OHLCV data at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
  
  // Check if data is sorted by time
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    if (!current || !previous || current.time <= previous.time) {
      throw new Error(`OHLCV data must be sorted by time. Found invalid order at index ${i}`);
    }
  }
}

/**
 * Calculate True Range for a single period
 * @param current Current OHLCV bar
 * @param previous Previous OHLCV bar (null for first bar)
 * @returns True Range value
 */
export function calculateTR(current: OHLCV, previous: OHLCV | null): number {
  if (!previous) {
    return current.high - current.low; // First bar TR is simply High - Low
  }
  
  // True Range is the greatest of:
  // 1. Current High - Current Low
  // 2. |Current High - Previous Close|
  // 3. |Current Low - Previous Close|
  const highLow = current.high - current.low;
  const highPrevClose = Math.abs(current.high - previous.close);
  const lowPrevClose = Math.abs(current.low - previous.close);
  
  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate Average True Range (ATR)
 * @param data Array of OHLCV data
 * @param period ATR period (default: 14)
 * @returns ATR value, or 0 if insufficient data
 */
export function calculateATR(data: OHLCV[], period: number = 14): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data instead of throwing error
  if (data.length < period + 1) {
    return 0;
  }
  
  // Calculate True Range for each period
  const trValues: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const previous = i > 0 ? data[i - 1] : null;
    if (!current) {
      throw new Error(`Invalid OHLCV data at index ${i}`);
    }
    if (previous === undefined) {
      throw new Error(`Missing previous OHLCV data at index ${i - 1}`);
    }
    const tr = calculateTR(current, previous);
    trValues.push(tr);
  }
  
  // For the first ATR, use simple average of TR values
  let atr = trValues.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  
  // For subsequent ATRs, use the smoothing formula: ATR = ((Prior ATR * (period - 1)) + Current TR) / period
  for (let i = period; i < trValues.length; i++) {
    const tr = trValues[i];
    if (tr === undefined) {
      throw new Error(`Missing TR value at index ${i}`);
    }
    atr = ((atr * (period - 1)) + tr) / period;
  }
  
  return atr;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data Array of OHLCV data
 * @param period EMA period
 * @param field Data field to use (default: 'close')
 * @returns EMA value, or 0 if insufficient data
 */
export function calculateEMA(data: OHLCV[], period: number, field: keyof OHLCV = 'close'): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data instead of throwing error
  if (data.length < period) {
    return 0;
  }
  
  // Calculate multiplier: 2 / (period + 1)
  const multiplier = 2 / (period + 1);
  
  // Calculate SMA for the initial EMA value
  const initialSMA = data.slice(0, period).reduce((sum, bar) => sum + bar[field], 0) / period;
  
  // Calculate EMA
  let ema = initialSMA;
  
  for (let i = period; i < data.length; i++) {
    const current = data[i];
    if (!current) {
      throw new Error(`Invalid OHLCV data at index ${i}`);
    }
    ema = (current[field] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param data Array of OHLCV data
 * @param period SMA period
 * @param field Data field to use (default: 'close')
 * @returns SMA value, or 0 if insufficient data
 */
export function calculateSMA(data: OHLCV[], period: number, field: keyof OHLCV = 'close'): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data instead of throwing error
  if (data.length < period) {
    return 0;
  }
  
  const recentValues = data.slice(-period).map(bar => bar[field]);
  return recentValues.reduce((sum, value) => sum + value, 0) / period;
}

/**
 * Calculate daily bar difference average
 * @param data Array of OHLCV data
 * @param barCount Number of bars to analyze
 * @returns Average bar difference, or 0 if insufficient data
 */
export function calculateDailyBarDiffAverage(data: OHLCV[], barCount: number): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data instead of throwing error
  if (data.length < barCount) {
    return 0;
  }
  
  // Get the last N bars
  const bars = data.slice(-barCount);
  
  // Calculate absolute difference between open and close for each bar
  const diffs = bars.map(bar => Math.abs(bar.close - bar.open));
  
  // Calculate average difference
  const avgDiff = diffs.reduce((sum, diff) => sum + diff, 0) / barCount;
  
  return avgDiff;
}

/**
 * Calculate percentage of volatile bars
 * @param data Array of OHLCV data
 * @param barCount Number of bars to analyze
 * @param volatilityThreshold Minimum percentage change to consider a bar volatile
 * @returns Ratio of volatile bars (0-1), or 0 if insufficient data
 */
export function calculateVolatileBarRatio(data: OHLCV[], barCount: number, volatilityThreshold: number): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data instead of throwing error
  if (data.length < barCount) {
    return 0;
  }
  
  // Get the last N bars
  const bars = data.slice(-barCount);
  
  // Count volatile bars
  let volatileBarCount = 0;
  
  bars.forEach(bar => {
    const percentChange = Math.abs(bar.close - bar.open) / bar.open;
    if (percentChange > volatilityThreshold) {
      volatileBarCount++;
    }
  });
  
  // Calculate ratio
  return volatileBarCount / barCount;
}

/**
 * Check if price is within EMA deviation threshold
 * @param price Current price
 * @param ema EMA value
 * @param threshold Maximum allowed deviation as a percentage (0-1)
 * @returns Boolean indicating if price is within threshold
 */
export function isPriceWithinEmaThreshold(price: number, ema: number, threshold: number): boolean {
  if (price <= 0 || ema <= 0) {
    throw new Error('Price and EMA must be positive numbers');
  }
  
  if (threshold < 0 || threshold > 1) {
    throw new Error('Threshold must be between 0 and 1');
  }
  
  const deviation = Math.abs(price - ema) / ema;
  return deviation <= threshold;
}

/**
 * Calculate Bollinger Bands
 * @param data Array of OHLCV data
 * @param period Period for calculation (default: 20)
 * @param standardDeviations Number of standard deviations (default: 2)
 * @returns Bollinger Bands object with upper, middle, and lower bands
 */
export function calculateBollingerBands(
  data: OHLCV[],
  period: number = 20,
  standardDeviations: number = 2
): { upper: number; middle: number; lower: number } {
  validateOHLCVArray(data);
  
  // Return default values if insufficient data
  if (data.length < period) {
    return { upper: 0, middle: 0, lower: 0 };
  }

  const sma = calculateSMA(data, period);
  const recentPrices = data.slice(-period).map(bar => bar.close);

  // Calculate standard deviation
  const variance = recentPrices.reduce((sum, price) => {
    return sum + Math.pow(price - sma, 2);
  }, 0) / period;

  const standardDeviation = Math.sqrt(variance);

  return {
    upper: sma + standardDeviations * standardDeviation,
    middle: sma,
    lower: sma - standardDeviations * standardDeviation,
  };
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param data Array of OHLCV data
 * @param period Period for RSI calculation (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(data: OHLCV[], period: number = 14): number {
  validateOHLCVArray(data);
  
  // Return 50 (neutral) if insufficient data
  if (data.length < period + 1) {
    return 50;
  }

  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    if (!current || !previous) {
      throw new Error(`Invalid OHLCV data at index ${i} or ${i - 1}`);
    }
    const change = current.close - previous.close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Calculate average gains and losses
  const recentGains = gains.slice(-period);
  const recentLosses = losses.slice(-period);

  const avgGain = recentGains.reduce((sum, gain) => sum + gain, 0) / period;
  const avgLoss = recentLosses.reduce((sum, loss) => sum + loss, 0) / period;

  if (avgLoss === 0) {
    return 100; // Avoid division by zero
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate volatility based on price changes
 * @param data Array of OHLCV data
 * @param period Period for volatility calculation
 * @returns Volatility as standard deviation of returns
 */
export function calculateVolatility(data: OHLCV[], period: number): number {
  validateOHLCVArray(data);
  
  // Return 0 if insufficient data
  if (data.length < period + 1) {
    return 0;
  }

  const returns: number[] = [];

  // Calculate returns
  for (let i = 1; i <= period; i++) {
    const currentBar = data[data.length - i];
    const previousBar = data[data.length - i - 1];
    
    if (!currentBar || !previousBar) {
      throw new Error(`Invalid OHLCV data at index ${data.length - i} or ${data.length - i - 1}`);
    }
    
    const currentPrice = currentBar.close;
    const previousPrice = previousBar.close;
    returns.push((currentPrice - previousPrice) / previousPrice);
  }

  // Calculate standard deviation of returns
  const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;

  return Math.sqrt(variance);
}

/**
 * Helper function to convert price arrays to OHLCV format for testing
 * @param prices Array of closing prices
 * @param startTime Starting timestamp
 * @param interval Time interval between bars in milliseconds
 * @returns Array of OHLCV data
 */
export function createMockOHLCVFromPrices(prices: number[], startTime: number = Date.now(), interval: number = 60000): OHLCV[] {
  return prices.map((price, index) => {
    // Create realistic OHLC data around the close price
    const variation = price * 0.001; // 0.1% variation
    const open = price + (Math.random() - 0.5) * variation;
    const randomHigh = price + Math.random() * variation;
    const randomLow = price - Math.random() * variation;
    
    // Ensure OHLC relationships are valid
    const high = Math.max(open, price, randomHigh);
    const low = Math.min(open, price, randomLow);
    
    return {
      time: startTime + (index * interval),
      open: Math.round(open * 100) / 100, // Round to 2 decimal places
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: Math.round(1000 + Math.random() * 5000),
    };
  });
}

// Legacy interface for backward compatibility
export interface CandlestickData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Convert CandlestickData to OHLCV format
 * @param candlestickData CandlestickData array
 * @returns OHLCV array
 */
export function convertToOHLCV(candlestickData: CandlestickData[]): OHLCV[] {
  return candlestickData.map(candle => ({
    time: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}
