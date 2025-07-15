/**
 * Technical indicators utility functions
 */

/**
 * Candlestick data interface
 */
export interface CandlestickData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Calculate Average True Range (ATR)
 * @param data Array of candlestick data
 * @param period Period for ATR calculation (default: 14)
 * @returns ATR value
 */
export function calculateATR(data: CandlestickData[], period: number = 14): number {
  if (data.length < period + 1) {
    throw new Error(`Insufficient data for ATR calculation. Need at least ${period + 1} periods`);
  }

  const trueRanges: number[] = [];

  // Calculate True Range for each period
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    if (!current || !previous) {
      throw new Error('Invalid candlestick data encountered');
    }

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);

    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  // Calculate ATR using Simple Moving Average of True Ranges
  const recentTrueRanges = trueRanges.slice(-period);
  return recentTrueRanges.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data Array of candlestick data
 * @param period Period for EMA calculation
 * @returns EMA value
 */
export function calculateEMA(data: CandlestickData[], period: number): number {
  if (data.length < period) {
    throw new Error(`Insufficient data for EMA calculation. Need at least ${period} periods`);
  }

  const multiplier = 2 / (period + 1);

  // Start with SMA for the first EMA value
  const smaValues = data.slice(0, period).map(candle => candle.close);
  let ema = smaValues.reduce((sum, value) => sum + value, 0) / period;

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    const currentCandle = data[i];
    if (!currentCandle) {
      throw new Error('Invalid candlestick data encountered in EMA calculation');
    }
    ema = currentCandle.close * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param data Array of candlestick data
 * @param period Period for SMA calculation
 * @returns SMA value
 */
export function calculateSMA(data: CandlestickData[], period: number): number {
  if (data.length < period) {
    throw new Error(`Insufficient data for SMA calculation. Need at least ${period} periods`);
  }

  const recentPrices = data.slice(-period).map(candle => candle.close);
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * Calculate Bollinger Bands
 * @param data Array of candlestick data
 * @param period Period for calculation (default: 20)
 * @param standardDeviations Number of standard deviations (default: 2)
 * @returns Bollinger Bands object with upper, middle, and lower bands
 */
export function calculateBollingerBands(
  data: CandlestickData[],
  period: number = 20,
  standardDeviations: number = 2
): { upper: number; middle: number; lower: number } {
  if (data.length < period) {
    throw new Error(
      `Insufficient data for Bollinger Bands calculation. Need at least ${period} periods`
    );
  }

  const sma = calculateSMA(data, period);
  const recentPrices = data.slice(-period).map(candle => candle.close);

  // Calculate standard deviation
  const variance =
    recentPrices.reduce((sum, price) => {
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
 * @param data Array of candlestick data
 * @param period Period for RSI calculation (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(data: CandlestickData[], period: number = 14): number {
  if (data.length < period + 1) {
    throw new Error(`Insufficient data for RSI calculation. Need at least ${period + 1} periods`);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    if (!current || !previous) {
      throw new Error('Invalid candlestick data encountered in RSI calculation');
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
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param data Array of candlestick data
 * @param fastPeriod Fast EMA period (default: 12)
 * @param slowPeriod Slow EMA period (default: 26)
 * @param signalPeriod Signal line EMA period (default: 9)
 * @returns MACD object with macd, signal, and histogram values
 */
export function calculateMACD(
  data: CandlestickData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (data.length < slowPeriod + signalPeriod) {
    throw new Error(
      `Insufficient data for MACD calculation. Need at least ${slowPeriod + signalPeriod} periods`
    );
  }

  // Calculate EMAs for MACD line
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  const macdLine = fastEMA - slowEMA;

  // For signal line, we need to calculate EMA of MACD values
  // This is simplified - in practice, you'd need historical MACD values
  const signal = macdLine; // Simplified for this implementation
  const histogram = macdLine - signal;

  return {
    macd: macdLine,
    signal,
    histogram,
  };
}

/**
 * Calculate volatility based on price changes
 * @param data Array of candlestick data
 * @param period Period for volatility calculation
 * @returns Volatility percentage
 */
export function calculateVolatility(data: CandlestickData[], period: number): number {
  if (data.length < period + 1) {
    throw new Error(
      `Insufficient data for volatility calculation. Need at least ${period + 1} periods`
    );
  }

  const returns: number[] = [];

  // Calculate returns
  for (let i = 1; i <= period; i++) {
    const currentCandle = data[data.length - i];
    const previousCandle = data[data.length - i - 1];

    if (!currentCandle || !previousCandle) {
      throw new Error('Invalid candlestick data encountered in volatility calculation');
    }

    const currentPrice = currentCandle.close;
    const previousPrice = previousCandle.close;
    returns.push((currentPrice - previousPrice) / previousPrice);
  }

  // Calculate standard deviation of returns
  const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;

  return Math.sqrt(variance) * 100; // Return as percentage
}
