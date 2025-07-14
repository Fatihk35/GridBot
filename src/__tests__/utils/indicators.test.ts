import {
  calculateATR,
  calculateEMA,
  calculateSMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateVolatility,
  CandlestickData,
} from '../../utils/indicators';

describe('Technical Indicators', () => {
  let mockData: CandlestickData[];

  beforeEach(() => {
    // Create mock candlestick data for testing
    mockData = [];
    const basePrice = 50000;
    const startTime = Date.now() - (100 * 60 * 60 * 1000); // 100 hours ago

    for (let i = 0; i < 100; i++) {
      const price = basePrice + Math.sin(i * 0.1) * 1000 + (Math.random() - 0.5) * 500;
      mockData.push({
        open: price + (Math.random() - 0.5) * 100,
        high: price + Math.random() * 200,
        low: price - Math.random() * 200,
        close: price,
        volume: 1000000 + Math.random() * 500000,
        timestamp: startTime + (i * 60 * 60 * 1000),
      });
    }
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly with default period', () => {
      const atr = calculateATR(mockData);
      
      expect(atr).toBeGreaterThan(0);
      expect(typeof atr).toBe('number');
      expect(isFinite(atr)).toBe(true);
    });

    it('should calculate ATR with custom period', () => {
      const atr = calculateATR(mockData, 21);
      
      expect(atr).toBeGreaterThan(0);
      expect(typeof atr).toBe('number');
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 10);
      
      expect(() => {
        calculateATR(insufficientData, 14);
      }).toThrow(/Insufficient data for ATR calculation/);
    });

    it('should handle edge case with minimum required data', () => {
      const minimalData = mockData.slice(0, 15); // 15 periods (14 + 1)
      
      expect(() => {
        calculateATR(minimalData, 14);
      }).not.toThrow();
    });

    it('should throw error for invalid candlestick data', () => {
      const invalidData = [
        ...mockData.slice(0, 5),
        // Add invalid entry
        null as any,
        ...mockData.slice(6, 20),
      ];

      expect(() => {
        calculateATR(invalidData, 14);
      }).toThrow(/Invalid candlestick data encountered/);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const ema = calculateEMA(mockData, 20);
      
      expect(ema).toBeGreaterThan(0);
      expect(typeof ema).toBe('number');
      expect(isFinite(ema)).toBe(true);
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 10);
      
      expect(() => {
        calculateEMA(insufficientData, 20);
      }).toThrow(/Insufficient data for EMA calculation/);
    });

    it('should handle different periods', () => {
      const ema12 = calculateEMA(mockData, 12);
      const ema26 = calculateEMA(mockData, 26);
      
      expect(ema12).toBeGreaterThan(0);
      expect(ema26).toBeGreaterThan(0);
      expect(ema12).not.toBe(ema26);
    });

    it('should be close to recent prices for short periods', () => {
      const recentPrice = mockData[mockData.length - 1]?.close || 0;
      const ema5 = calculateEMA(mockData, 5);
      
      // EMA should be relatively close to recent prices for short periods
      const deviation = Math.abs(ema5 - recentPrice) / recentPrice;
      expect(deviation).toBeLessThan(0.05); // Within 5%
    });
  });

  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const sma = calculateSMA(mockData, 20);
      
      expect(sma).toBeGreaterThan(0);
      expect(typeof sma).toBe('number');
      expect(isFinite(sma)).toBe(true);
    });

    it('should be average of recent closing prices', () => {
      const period = 10;
      const sma = calculateSMA(mockData, period);
      
      // Calculate manual average for verification
      const recentPrices = mockData.slice(-period).map(c => c.close);
      const manualAverage = recentPrices.reduce((sum, price) => sum + price, 0) / period;
      
      expect(Math.abs(sma - manualAverage)).toBeLessThan(0.001);
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 5);
      
      expect(() => {
        calculateSMA(insufficientData, 10);
      }).toThrow(/Insufficient data for SMA calculation/);
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate Bollinger Bands correctly', () => {
      const bands = calculateBollingerBands(mockData);
      
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.middle).toBeGreaterThan(bands.lower);
      expect(bands.upper).toBeGreaterThan(0);
      expect(bands.middle).toBeGreaterThan(0);
      expect(bands.lower).toBeGreaterThan(0);
    });

    it('should use custom parameters', () => {
      const bands = calculateBollingerBands(mockData, 10, 1.5);
      
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.middle).toBeGreaterThan(bands.lower);
    });

    it('should have middle band equal to SMA', () => {
      const period = 20;
      const bands = calculateBollingerBands(mockData, period);
      const sma = calculateSMA(mockData, period);
      
      expect(Math.abs(bands.middle - sma)).toBeLessThan(0.001);
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 10);
      
      expect(() => {
        calculateBollingerBands(insufficientData, 20);
      }).toThrow(/Insufficient data for Bollinger Bands calculation/);
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI correctly', () => {
      const rsi = calculateRSI(mockData);
      
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
      expect(typeof rsi).toBe('number');
      expect(isFinite(rsi)).toBe(true);
    });

    it('should handle trending markets', () => {
      // Create trending up data
      const trendingData: CandlestickData[] = [];
      for (let i = 0; i < 50; i++) {
        const price = 50000 + i * 100; // Strong uptrend
        trendingData.push({
          open: price - 50,
          high: price + 50,
          low: price - 100,
          close: price,
          volume: 1000000,
          timestamp: Date.now() + i * 60000,
        });
      }

      const rsi = calculateRSI(trendingData);
      expect(rsi).toBeGreaterThan(50); // Should indicate overbought in strong uptrend
    });

    it('should return 100 for continuous gains', () => {
      // Create data with only gains
      const gainsOnlyData: CandlestickData[] = [];
      for (let i = 0; i < 20; i++) {
        gainsOnlyData.push({
          open: 50000 + i * 100,
          high: 50100 + i * 100,
          low: 49950 + i * 100,
          close: 50050 + i * 100,
          volume: 1000000,
          timestamp: Date.now() + i * 60000,
        });
      }

      const rsi = calculateRSI(gainsOnlyData);
      expect(rsi).toBe(100);
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 10);
      
      expect(() => {
        calculateRSI(insufficientData, 14);
      }).toThrow(/Insufficient data for RSI calculation/);
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD correctly', () => {
      const macd = calculateMACD(mockData);
      
      expect(typeof macd.macd).toBe('number');
      expect(typeof macd.signal).toBe('number');
      expect(typeof macd.histogram).toBe('number');
      expect(isFinite(macd.macd)).toBe(true);
      expect(isFinite(macd.signal)).toBe(true);
      expect(isFinite(macd.histogram)).toBe(true);
    });

    it('should use custom parameters', () => {
      const macd = calculateMACD(mockData, 8, 21, 5);
      
      expect(typeof macd.macd).toBe('number');
      expect(typeof macd.signal).toBe('number');
      expect(typeof macd.histogram).toBe('number');
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 20);
      
      expect(() => {
        calculateMACD(insufficientData, 12, 26, 9);
      }).toThrow(/Insufficient data for MACD calculation/);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate volatility correctly', () => {
      const volatility = calculateVolatility(mockData, 20);
      
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(typeof volatility).toBe('number');
      expect(isFinite(volatility)).toBe(true);
    });

    it('should return higher volatility for more volatile data', () => {
      // Create high volatility data
      const highVolData: CandlestickData[] = [];
      for (let i = 0; i < 50; i++) {
        const price = 50000 + (Math.random() - 0.5) * 10000; // High volatility
        highVolData.push({
          open: price,
          high: price + 1000,
          low: price - 1000,
          close: price,
          volume: 1000000,
          timestamp: Date.now() + i * 60000,
        });
      }

      // Create low volatility data
      const lowVolData: CandlestickData[] = [];
      for (let i = 0; i < 50; i++) {
        const price = 50000 + (Math.random() - 0.5) * 100; // Low volatility
        lowVolData.push({
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 1000000,
          timestamp: Date.now() + i * 60000,
        });
      }

      const highVol = calculateVolatility(highVolData, 20);
      const lowVol = calculateVolatility(lowVolData, 20);

      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('should throw error for insufficient data', () => {
      const insufficientData = mockData.slice(0, 10);
      
      expect(() => {
        calculateVolatility(insufficientData, 20);
      }).toThrow(/Insufficient data for volatility calculation/);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero prices gracefully', () => {
      const dataWithZero = [...mockData];
      dataWithZero[50] = {
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        timestamp: Date.now(),
      };

      // Should not throw for most indicators, but results may be affected
      expect(() => {
        calculateSMA(dataWithZero, 20);
      }).not.toThrow();
    });

    it('should handle negative prices', () => {
      const dataWithNegative = [...mockData];
      dataWithNegative[50] = {
        open: -100,
        high: -50,
        low: -150,
        close: -75,
        volume: 1000000,
        timestamp: Date.now(),
      };

      expect(() => {
        calculateSMA(dataWithNegative, 20);
      }).not.toThrow();
    });

    it('should handle very large numbers', () => {
      const dataWithLargeNumbers = mockData.map(candle => ({
        ...candle,
        open: candle.open * 1e6,
        high: candle.high * 1e6,
        low: candle.low * 1e6,
        close: candle.close * 1e6,
      }));

      const sma = calculateSMA(dataWithLargeNumbers, 20);
      expect(isFinite(sma)).toBe(true);
      expect(sma).toBeGreaterThan(0);
    });

    it('should handle very small numbers', () => {
      const dataWithSmallNumbers = mockData.map(candle => ({
        ...candle,
        open: candle.open * 1e-6,
        high: candle.high * 1e-6,
        low: candle.low * 1e-6,
        close: candle.close * 1e-6,
      }));

      const sma = calculateSMA(dataWithSmallNumbers, 20);
      expect(isFinite(sma)).toBe(true);
      expect(sma).toBeGreaterThan(0);
    });
  });
});
