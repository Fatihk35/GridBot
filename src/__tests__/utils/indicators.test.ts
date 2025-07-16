/**
 * Unit tests for Technical Indicators
 * Comprehensive test suite covering all indicator functions with edge cases
 */

import {
  OHLCV,
  OHLCVSchema,
  validateOHLCVArray,
  calculateTR,
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
  convertToOHLCV,
  CandlestickData,
} from '../../utils/indicators';

describe('Technical Indicators', () => {
  let mockOHLCVData: OHLCV[];
  let mockCandlestickData: CandlestickData[];

  beforeEach(() => {
    // Create realistic test data
    const basePrice = 50000;
    const startTime = Date.now() - (100 * 60 * 60 * 1000); // 100 hours ago
    const prices: number[] = [];

    // Generate price series with trend and volatility
    for (let i = 0; i < 100; i++) {
      const trend = i * 10; // Upward trend
      const sine = Math.sin(i * 0.1) * 500; // Cyclical movement
      const noise = (Math.random() - 0.5) * 200; // Random noise
      prices.push(basePrice + trend + sine + noise);
    }

    mockOHLCVData = createMockOHLCVFromPrices(prices, startTime, 60 * 60 * 1000);

    // Create legacy candlestick data for compatibility testing
    mockCandlestickData = mockOHLCVData.map(ohlcv => ({
      open: ohlcv.open,
      high: ohlcv.high,
      low: ohlcv.low,
      close: ohlcv.close,
      volume: ohlcv.volume,
      timestamp: ohlcv.time,
    }));
  });

  describe('OHLCV Validation', () => {
    it('should validate correct OHLCV data', () => {
      expect(() => validateOHLCVArray(mockOHLCVData)).not.toThrow();
    });

    it('should validate individual OHLCV item with schema', () => {
      const validItem: OHLCV = {
        time: Date.now(),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      };

      expect(() => OHLCVSchema.parse(validItem)).not.toThrow();
    });

    it('should reject invalid OHLCV data', () => {
      const invalidData = [
        {
          time: Date.now(),
          open: 100,
          high: 90, // High < Open (invalid)
          low: 95,
          close: 102,
          volume: 1000,
        }
      ];

      expect(() => validateOHLCVArray(invalidData as OHLCV[])).toThrow(/Invalid OHLCV data/);
    });

    it('should allow empty array', () => {
      expect(() => validateOHLCVArray([])).not.toThrow();
    });

    it('should reject unsorted data', () => {
      const unsortedData = [
        { time: 100, open: 50, high: 55, low: 45, close: 52, volume: 1000 },
        { time: 50, open: 51, high: 56, low: 46, close: 53, volume: 1000 }, // Earlier time
      ];

      expect(() => validateOHLCVArray(unsortedData)).toThrow(/sorted by time/);
    });
  });

  describe('calculateTR', () => {
    it('should calculate TR for first bar (no previous)', () => {
      const current: OHLCV = {
        time: Date.now(),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      };

      const tr = calculateTR(current, null);
      expect(tr).toBe(10); // high - low = 105 - 95
    });

    it('should calculate TR with previous bar', () => {
      const previous: OHLCV = {
        time: Date.now() - 1000,
        open: 98,
        high: 103,
        low: 93,
        close: 100,
        volume: 1000,
      };

      const current: OHLCV = {
        time: Date.now(),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      };

      const tr = calculateTR(current, previous);
      
      // Should be max of:
      // 1. High - Low = 105 - 95 = 10
      // 2. |High - Previous Close| = |105 - 100| = 5
      // 3. |Low - Previous Close| = |95 - 100| = 5
      expect(tr).toBe(10);
    });

    it('should handle gap up scenario', () => {
      const previous: OHLCV = {
        time: Date.now() - 1000,
        open: 98,
        high: 100,
        low: 96,
        close: 99,
        volume: 1000,
      };

      const current: OHLCV = {
        time: Date.now(),
        open: 110,
        high: 115,
        low: 108,
        close: 112,
        volume: 1000,
      };

      const tr = calculateTR(current, previous);
      
      // Should be max of:
      // 1. High - Low = 115 - 108 = 7
      // 2. |High - Previous Close| = |115 - 99| = 16  <- Maximum
      // 3. |Low - Previous Close| = |108 - 99| = 9
      expect(tr).toBe(16);
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR with default period', () => {
      const atr = calculateATR(mockOHLCVData);
      
      expect(typeof atr).toBe('number');
      expect(atr).toBeGreaterThan(0);
      expect(isFinite(atr)).toBe(true);
    });

    it('should calculate ATR with custom period', () => {
      const atr21 = calculateATR(mockOHLCVData, 21);
      const atr7 = calculateATR(mockOHLCVData, 7);
      
      expect(typeof atr21).toBe('number');
      expect(typeof atr7).toBe('number');
      expect(atr21).toBeGreaterThan(0);
      expect(atr7).toBeGreaterThan(0);
    });

    it('should return 0 for insufficient data', () => {
      const insufficientData = mockOHLCVData.slice(0, 10);
      
      const result = calculateATR(insufficientData, 14);
      expect(result).toBe(0);
    });

    it('should handle minimum required data', () => {
      const minimalData = mockOHLCVData.slice(0, 15); // 15 bars for period 14
      
      expect(() => {
        calculateATR(minimalData, 14);
      }).not.toThrow();
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA with default close field', () => {
      const ema = calculateEMA(mockOHLCVData, 20);
      
      expect(typeof ema).toBe('number');
      expect(ema).toBeGreaterThan(0);
      expect(isFinite(ema)).toBe(true);
    });

    it('should calculate EMA with different fields', () => {
      const emaClose = calculateEMA(mockOHLCVData, 20, 'close');
      const emaOpen = calculateEMA(mockOHLCVData, 20, 'open');
      const emaHigh = calculateEMA(mockOHLCVData, 20, 'high');
      const emaLow = calculateEMA(mockOHLCVData, 20, 'low');
      
      expect(emaClose).not.toBe(emaOpen);
      expect(emaHigh).toBeGreaterThan(emaLow);
    });

    it('should return 0 for insufficient data', () => {
      const insufficientData = mockOHLCVData.slice(0, 10);
      
      const result = calculateEMA(insufficientData, 20);
      expect(result).toBe(0);
    });

    it('should calculate different EMA periods differently', () => {
      const ema12 = calculateEMA(mockOHLCVData, 12);
      const ema26 = calculateEMA(mockOHLCVData, 26);
      
      // EMAs should be different for different periods
      expect(ema12).not.toBe(ema26);
    });
  });

  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const sma = calculateSMA(mockOHLCVData, 20);
      
      expect(typeof sma).toBe('number');
      expect(sma).toBeGreaterThan(0);
      expect(isFinite(sma)).toBe(true);
    });

    it('should calculate SMA with different fields', () => {
      const smaClose = calculateSMA(mockOHLCVData, 20, 'close');
      const smaVolume = calculateSMA(mockOHLCVData, 20, 'volume');
      
      expect(smaClose).not.toBe(smaVolume);
      expect(typeof smaClose).toBe('number');
      expect(typeof smaVolume).toBe('number');
      expect(smaVolume).toBeGreaterThan(0); // Volume should be positive
    });

    it('should match manual calculation for simple case', () => {
      const simpleData: OHLCV[] = [
        { time: 1, open: 10, high: 12, low: 8, close: 10, volume: 100 },
        { time: 2, open: 11, high: 13, low: 9, close: 12, volume: 100 },
        { time: 3, open: 12, high: 14, low: 10, close: 14, volume: 100 },
      ];

      const sma = calculateSMA(simpleData, 3);
      const expectedSMA = (10 + 12 + 14) / 3;
      
      expect(sma).toBeCloseTo(expectedSMA);
    });
  });

  describe('calculateDailyBarDiffAverage', () => {
    it('should calculate average bar difference', () => {
      const avgDiff = calculateDailyBarDiffAverage(mockOHLCVData, 20);
      
      expect(typeof avgDiff).toBe('number');
      expect(avgDiff).toBeGreaterThanOrEqual(0);
      expect(isFinite(avgDiff)).toBe(true);
    });

    it('should return 0 for insufficient data', () => {
      const result = calculateDailyBarDiffAverage(mockOHLCVData.slice(0, 5), 10);
      expect(result).toBe(0);
    });

    it('should calculate correctly for simple case', () => {
      const simpleData: OHLCV[] = [
        { time: 1, open: 100, high: 105, low: 95, close: 102, volume: 100 },
        { time: 2, open: 102, high: 108, low: 98, close: 105, volume: 100 },
      ];

      const avgDiff = calculateDailyBarDiffAverage(simpleData, 2);
      const expectedAvg = (Math.abs(102 - 100) + Math.abs(105 - 102)) / 2;
      
      expect(avgDiff).toBeCloseTo(expectedAvg);
    });
  });

  describe('calculateVolatileBarRatio', () => {
    it('should calculate volatile bar ratio', () => {
      const ratio = calculateVolatileBarRatio(mockOHLCVData, 20, 0.01); // 1% threshold
      
      expect(typeof ratio).toBe('number');
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('should return 0 for low volatility threshold', () => {
      const simpleData: OHLCV[] = [
        { time: 1, open: 100, high: 100.1, low: 99.9, close: 100.05, volume: 100 },
        { time: 2, open: 100.05, high: 100.15, low: 99.95, close: 100.1, volume: 100 },
      ];

      const ratio = calculateVolatileBarRatio(simpleData, 2, 0.1); // 10% threshold
      expect(ratio).toBe(0); // No bars should exceed 10% change
    });

    it('should return 1 for high volatility data', () => {
      const volatileData: OHLCV[] = [
        { time: 1, open: 100, high: 120, low: 80, close: 110, volume: 100 }, // 10% change
        { time: 2, open: 110, high: 135, low: 85, close: 125, volume: 100 }, // ~13.6% change
      ];

      const ratio = calculateVolatileBarRatio(volatileData, 2, 0.05); // 5% threshold
      expect(ratio).toBe(1); // All bars exceed 5% change
    });
  });

  describe('isPriceWithinEmaThreshold', () => {
    it('should return true for price within threshold', () => {
      const price = 100;
      const ema = 102;
      const threshold = 0.05; // 5%
      
      const isWithin = isPriceWithinEmaThreshold(price, ema, threshold);
      expect(isWithin).toBe(true);
    });

    it('should return false for price outside threshold', () => {
      const price = 100;
      const ema = 110;
      const threshold = 0.05; // 5%
      
      const isWithin = isPriceWithinEmaThreshold(price, ema, threshold);
      expect(isWithin).toBe(false);
    });

    it('should throw error for invalid inputs', () => {
      expect(() => {
        isPriceWithinEmaThreshold(-100, 100, 0.05);
      }).toThrow(/Price and EMA must be positive numbers/);

      expect(() => {
        isPriceWithinEmaThreshold(100, 100, 1.5);
      }).toThrow(/Threshold must be between 0 and 1/);
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate Bollinger Bands', () => {
      const bands = calculateBollingerBands(mockOHLCVData);
      
      expect(typeof bands.upper).toBe('number');
      expect(typeof bands.middle).toBe('number');
      expect(typeof bands.lower).toBe('number');
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.middle).toBeGreaterThan(bands.lower);
    });

    it('should calculate with custom parameters', () => {
      const bands = calculateBollingerBands(mockOHLCVData, 10, 1.5);
      
      expect(bands.upper).toBeGreaterThan(bands.lower);
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI', () => {
      const rsi = calculateRSI(mockOHLCVData);
      
      expect(typeof rsi).toBe('number');
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should return 100 for all positive changes', () => {
      const risingData: OHLCV[] = [];
      const baseTime = Date.now();
      
      for (let i = 0; i < 20; i++) {
        risingData.push({
          time: baseTime + i * 1000,
          open: 100 + i,
          high: 102 + i,
          low: 98 + i,
          close: 101 + i, // Always increasing
          volume: 1000,
        });
      }

      const rsi = calculateRSI(risingData, 14);
      expect(rsi).toBe(100);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate volatility', () => {
      const volatility = calculateVolatility(mockOHLCVData, 20);
      
      expect(typeof volatility).toBe('number');
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(isFinite(volatility)).toBe(true);
    });

    it('should return 0 for constant prices', () => {
      const constantData: OHLCV[] = [];
      const baseTime = Date.now();
      const constantPrice = 100;
      
      for (let i = 0; i < 20; i++) {
        constantData.push({
          time: baseTime + i * 1000,
          open: constantPrice,
          high: constantPrice,
          low: constantPrice,
          close: constantPrice,
          volume: 1000,
        });
      }

      const volatility = calculateVolatility(constantData, 10);
      expect(volatility).toBeCloseTo(0);
    });
  });

  describe('Helper Functions', () => {
    it('should create mock OHLCV from prices', () => {
      const prices = [100, 101, 102, 103, 104];
      const mockData = createMockOHLCVFromPrices(prices);
      
      expect(mockData).toHaveLength(5);
      expect(mockData[0]?.close).toBe(100);
      expect(mockData[4]?.close).toBe(104);
      
      // Verify OHLC relationships
      mockData.forEach(bar => {
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
        expect(bar.high).toBeGreaterThanOrEqual(bar.open);
        expect(bar.high).toBeGreaterThanOrEqual(bar.close);
      });
    });

    it('should convert CandlestickData to OHLCV', () => {
      const ohlcvData = convertToOHLCV(mockCandlestickData);
      
      expect(ohlcvData).toHaveLength(mockCandlestickData.length);
      expect(ohlcvData[0]?.time).toBe(mockCandlestickData[0]?.timestamp);
      expect(ohlcvData[0]?.close).toBe(mockCandlestickData[0]?.close);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very small datasets appropriately', () => {
      const smallData = mockOHLCVData.slice(0, 3);
      
      // Should work for small periods
      expect(() => calculateSMA(smallData, 2)).not.toThrow();
      
      // Should return 0 for large periods
      expect(calculateATR(smallData, 14)).toBe(0);
    });

    it('should handle extreme price values', () => {
      const extremeData: OHLCV[] = [
        { time: 1, open: 0.01, high: 0.02, low: 0.005, close: 0.015, volume: 100 },
        { time: 2, open: 1000000, high: 1100000, low: 900000, close: 1050000, volume: 100 },
      ];

      expect(() => calculateSMA(extremeData, 2)).not.toThrow();
      const firstItem = extremeData[1];
      const secondItem = extremeData[0];
      if (firstItem && secondItem) {
        expect(() => calculateTR(firstItem, secondItem)).not.toThrow();
      }
    });

    it('should maintain precision for financial calculations', () => {
      const precisionData: OHLCV[] = [
        { time: 1, open: 123.456789, high: 123.456790, low: 123.456788, close: 123.456789, volume: 100 },
        { time: 2, open: 123.456790, high: 123.456791, low: 123.456789, close: 123.456790, volume: 100 },
      ];

      const sma = calculateSMA(precisionData, 2);
      expect(sma).toBeCloseTo(123.4567895, 6);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      // Create large dataset
      const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + Math.sin(i * 0.01) * 10);
      const largeData = createMockOHLCVFromPrices(largePrices);

      const startTime = performance.now();
      calculateATR(largeData, 14);
      calculateEMA(largeData, 20);
      calculateSMA(largeData, 50);
      const endTime = performance.now();

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(1000); // 1 second
    });
  });
});
