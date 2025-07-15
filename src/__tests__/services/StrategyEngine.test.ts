import { StrategyEngine, GridLevel, StrategyState, TradingSignal } from '../../services/StrategyEngine';
import { BotConfigType } from '../../config/schema';
import { CandlestickData } from '../../utils/indicators';

// Mock Logger
jest.mock('../../utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Mock BinanceService
jest.mock('../../services/BinanceService', () => ({
  BinanceService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    getSymbolInfo: jest.fn(),
    getHistoricalData: jest.fn(),
    placeLimitOrder: jest.fn()
  }))
}));

describe('StrategyEngine', () => {
  let strategyEngine: StrategyEngine;
  let mockConfig: BotConfigType;
  let mockHistoricalData: CandlestickData[];

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      tradeMode: 'backtest',
      exchange: 'binance',
      maxBudget: {
        amount: 10000,
        currency: 'USDT',
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 100,
          gridSize: 1000,
          pricePrecision: 2,
          quantityPrecision: 6,
        },
      ],
      apiKeys: {
        binanceApiKey: 'test-api-key',
        binanceSecretKey: 'test-secret-key',
      },
      strategySettings: {
        barCountForVolatility: 24,
        minVolatilityPercentage: 0.01,
        minVolatileBarRatio: 0.3,
        emaPeriod: 200,
        emaDeviationThreshold: 0.1,
      },
      binanceSettings: {
        testnet: true,
        commissionRate: 0.001,
      },
      logging: {
        enableConsoleOutput: true,
        enableTelegramOutput: false,
        reportDirectory: './reports',
        transactionLogFileName: 'transactions.log',
      },
    };

    // Create mock historical data
    mockHistoricalData = [];
    const basePrice = 50000;
    const startTime = Date.now() - (300 * 60 * 60 * 1000); // 300 hours ago

    for (let i = 0; i < 300; i++) {
      const price = basePrice + (Math.random() - 0.5) * 2000; // ±1000 volatility
      const open = price + (Math.random() - 0.5) * 100;
      const close = price + (Math.random() - 0.5) * 100;
      
      // Ensure valid OHLCV relationships: high >= max(open, close) and low <= min(open, close)
      const maxOC = Math.max(open, close);
      const minOC = Math.min(open, close);
      const high = maxOC + Math.random() * 200; // high is always >= max(open, close)
      const low = minOC - Math.random() * 200;  // low is always <= min(open, close)
      
      mockHistoricalData.push({
        open,
        high,
        low,
        close,
        volume: 1000000 + Math.random() * 500000,
        timestamp: startTime + (i * 60 * 60 * 1000), // Hourly data
      });
    }

    strategyEngine = new StrategyEngine(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      expect(strategyEngine).toBeInstanceOf(StrategyEngine);
      expect(strategyEngine.getActiveSymbols()).toEqual([]);
    });

    it('should initialize with custom strategy configuration', () => {
      const customStrategyConfig = {
        gridLevelsCount: 30,
        atrPeriod: 21,
        profitTargetMultiplier: 6,
      };

      const customEngine = new StrategyEngine(mockConfig, customStrategyConfig);
      const config = customEngine.getStrategyConfig();

      expect(config.gridLevelsCount).toBe(30);
      expect(config.atrPeriod).toBe(21);
      expect(config.profitTargetMultiplier).toBe(6);
    });
  });

  describe('initializeStrategy', () => {
    it('should initialize strategy for a valid symbol', () => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);

      const activeSymbols = strategyEngine.getActiveSymbols();
      expect(activeSymbols).toContain('BTCUSDT');

      const state = strategyEngine.getStrategyState('BTCUSDT');
      expect(state).toBeDefined();
      expect(state?.symbol).toBe('BTCUSDT');
      expect(state?.gridLevels.length).toBeGreaterThan(0);
      expect(state?.currentPrice).toBeGreaterThan(0);
      expect(state?.ema200).toBeGreaterThan(0);
      expect(state?.atr).toBeGreaterThan(0);
    });

    it('should throw error for insufficient historical data', () => {
      const insufficientData = mockHistoricalData.slice(0, 10);

      expect(() => {
        strategyEngine.initializeStrategy('BTCUSDT', insufficientData);
      }).toThrow(/Insufficient historical data/);
    });

    it('should throw error for unconfigured symbol', () => {
      expect(() => {
        strategyEngine.initializeStrategy('ETHUSDT', mockHistoricalData);
      }).toThrow(/Symbol configuration not found/);
    });

    it('should initialize metrics for the symbol', () => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);

      const metrics = strategyEngine.getMetrics('BTCUSDT');
      expect(metrics).toBeDefined();
      expect(metrics?.totalTrades).toBe(0);
      expect(metrics?.totalProfit).toBe(0);
      expect(metrics?.winRate).toBe(0);
    });
  });

  describe('calculateGridInterval', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should calculate ATR-based grid interval', () => {
      const atrInterval = strategyEngine.calculateGridInterval(mockHistoricalData, 'ATR');
      expect(atrInterval).toBeGreaterThan(0);
      expect(typeof atrInterval).toBe('number');
    });

    it('should calculate Daily Bar Difference interval', () => {
      const dailyBarInterval = strategyEngine.calculateGridInterval(mockHistoricalData, 'DailyBarDiff');
      expect(dailyBarInterval).toBeGreaterThanOrEqual(0);
      expect(typeof dailyBarInterval).toBe('number');
    });

    it('should return 0 for low volatility in Daily Bar Diff method', () => {
      // Create low volatility data
      const lowVolData: CandlestickData[] = [];
      for (let i = 0; i < 50; i++) {
        const price = 50000 + i; // Very small price movement
        lowVolData.push({
          open: price,
          high: price + 1,
          low: price - 1,
          close: price,
          volume: 1000000,
          timestamp: Date.now() + (i * 60 * 60 * 1000),
        });
      }

      const interval = strategyEngine.calculateGridInterval(lowVolData, 'DailyBarDiff');
      expect(interval).toBe(0);
    });
  });

  describe('shouldTradeBasedOnEMA', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should allow trading when price is within EMA threshold', () => {
      const state = strategyEngine.getStrategyState('BTCUSDT');
      if (state) {
        // Set current price close to EMA
        state.currentPrice = state.ema200 * 1.05; // 5% above EMA
        state.ema200 = 50000;
      }

      const shouldTrade = strategyEngine.shouldTradeBasedOnEMA('BTCUSDT');
      expect(shouldTrade).toBe(true);
    });

    it('should block trading when price is outside EMA threshold', () => {
      const state = strategyEngine.getStrategyState('BTCUSDT');
      if (state) {
        // Set current price far from EMA
        state.currentPrice = state.ema200 * 1.2; // 20% above EMA
        state.ema200 = 50000;
      }

      const shouldTrade = strategyEngine.shouldTradeBasedOnEMA('BTCUSDT');
      expect(shouldTrade).toBe(false);
    });

    it('should return false for non-existent symbol', () => {
      const shouldTrade = strategyEngine.shouldTradeBasedOnEMA('NONEXISTENT');
      expect(shouldTrade).toBe(false);
    });
  });

  describe('getTradeSignals', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should generate buy signals when price hits grid levels', () => {
      const state = strategyEngine.getStrategyState('BTCUSDT');
      if (state) {
        // Set current price to trigger buy signals
        state.currentPrice = state.gridLevels[0]?.price || 0;
      }

      const signals = strategyEngine.getTradeSignals('BTCUSDT');
      expect(signals.buy).toBeDefined();
      expect(signals.sell).toBeDefined();
      expect(Array.isArray(signals.buy)).toBe(true);
      expect(Array.isArray(signals.sell)).toBe(true);
    });

    it('should not generate signals when outside EMA threshold', () => {
      const state = strategyEngine.getStrategyState('BTCUSDT');
      if (state) {
        // Set price outside EMA threshold
        state.currentPrice = state.ema200 * 1.5;
      }

      const signals = strategyEngine.getTradeSignals('BTCUSDT');
      expect(signals.buy).toHaveLength(0);
      expect(signals.sell).toHaveLength(0);
    });

    it('should return empty signals for non-existent symbol', () => {
      const signals = strategyEngine.getTradeSignals('NONEXISTENT');
      expect(signals.buy).toHaveLength(0);
      expect(signals.sell).toHaveLength(0);
    });
  });

  describe('markGridLevelFilled', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should mark grid level as filled and track position', () => {
      const gridIndex = 5;
      const fillPrice = 49000;
      const fillQuantity = 0.02;
      const orderId = 12345;

      strategyEngine.markGridLevelFilled('BTCUSDT', gridIndex, fillPrice, fillQuantity, orderId);

      const state = strategyEngine.getStrategyState('BTCUSDT');
      const gridLevel = state?.gridLevels.find(g => g.index === gridIndex);
      const position = state?.openPositions.get(gridIndex);

      expect(gridLevel?.status).toBe('filled');
      expect(gridLevel?.entryPrice).toBe(fillPrice);
      expect(gridLevel?.sellSize).toBe(fillQuantity);
      expect(gridLevel?.orderId).toBe(orderId);

      expect(position).toBeDefined();
      expect(position?.entryPrice).toBe(fillPrice);
      expect(position?.quantity).toBe(fillQuantity);
      expect(position?.orderId).toBe(orderId);
    });

    it('should handle non-existent grid level gracefully', () => {
      expect(() => {
        strategyEngine.markGridLevelFilled('BTCUSDT', 9999, 49000, 0.02, 12345);
      }).not.toThrow();
    });
  });

  describe('processCompletedTrade', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
      // First, mark a grid level as filled
      strategyEngine.markGridLevelFilled('BTCUSDT', 5, 49000, 0.02, 12345);
    });

    it('should calculate profit and update metrics for winning trade', () => {
      const gridIndex = 5;
      const sellPrice = 50000; // Higher than entry price (49000)
      const sellQuantity = 0.02;

      strategyEngine.processCompletedTrade('BTCUSDT', gridIndex, sellPrice, sellQuantity);

      const metrics = strategyEngine.getMetrics('BTCUSDT');
      const state = strategyEngine.getStrategyState('BTCUSDT');

      expect(metrics?.totalTrades).toBe(1);
      expect(metrics?.winningTrades).toBe(1);
      expect(metrics?.totalProfit).toBeGreaterThan(0);
      expect(metrics?.winRate).toBe(100);

      // Position should be removed
      expect(state?.openPositions.has(gridIndex)).toBe(false);

      // Grid level should be reset
      const gridLevel = state?.gridLevels.find(g => g.index === gridIndex);
      expect(gridLevel?.status).toBe('pending');
      expect(gridLevel?.sellSize).toBe(0);
      expect(gridLevel?.entryPrice).toBeUndefined();
    });

    it('should calculate loss and update metrics for losing trade', () => {
      const gridIndex = 5;
      const sellPrice = 48000; // Lower than entry price (49000)
      const sellQuantity = 0.02;

      strategyEngine.processCompletedTrade('BTCUSDT', gridIndex, sellPrice, sellQuantity);

      const metrics = strategyEngine.getMetrics('BTCUSDT');

      expect(metrics?.totalTrades).toBe(1);
      expect(metrics?.winningTrades).toBe(0);
      expect(metrics?.totalProfit).toBeLessThan(0);
      expect(metrics?.winRate).toBe(0);
    });
  });

  describe('calculateProfitTarget', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should calculate profit target correctly', () => {
      const entryPrice = 50000;
      const gridInterval = 500;

      const profitTarget = strategyEngine.calculateProfitTarget(entryPrice, gridInterval);
      const expectedTarget = entryPrice + (4 * gridInterval); // Default multiplier is 4

      expect(profitTarget).toBe(expectedTarget);
    });
  });

  describe('updateState', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should update state with new candle data', () => {
      const newCandle: CandlestickData = {
        open: 51000,
        high: 51500,
        low: 50500,
        close: 51200,
        volume: 1200000,
        timestamp: Date.now(),
      };

      const updatedHistoricalData = [...mockHistoricalData, newCandle];

      strategyEngine.updateState('BTCUSDT', newCandle, updatedHistoricalData);

      const state = strategyEngine.getStrategyState('BTCUSDT');
      expect(state?.currentPrice).toBe(51200);
    });

    it('should recalculate grid levels when time threshold is exceeded', () => {
      const state = strategyEngine.getStrategyState('BTCUSDT');
      if (state) {
        // Force grid recalculation by setting old timestamp
        state.lastGridRecalculationTime = Date.now() - (50 * 60 * 60 * 1000); // 50 hours ago
      }

      const newCandle: CandlestickData = {
        open: 51000,
        high: 51500,
        low: 50500,
        close: 51200,
        volume: 1200000,
        timestamp: Date.now(),
      };

      const updatedHistoricalData = [...mockHistoricalData, newCandle];
      const oldGridCount = state?.gridLevels.length || 0;

      strategyEngine.updateState('BTCUSDT', newCandle, updatedHistoricalData);

      const updatedState = strategyEngine.getStrategyState('BTCUSDT');
      expect(updatedState?.lastGridRecalculationTime).toBeGreaterThan(
        Date.now() - (10 * 60 * 1000) // Within last 10 minutes
      );
    });
  });

  describe('resetStrategy', () => {
    beforeEach(() => {
      strategyEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
    });

    it('should reset strategy state and metrics', () => {
      expect(strategyEngine.getActiveSymbols()).toContain('BTCUSDT');
      expect(strategyEngine.getStrategyState('BTCUSDT')).toBeDefined();
      expect(strategyEngine.getMetrics('BTCUSDT')).toBeDefined();

      strategyEngine.resetStrategy('BTCUSDT');

      expect(strategyEngine.getActiveSymbols()).not.toContain('BTCUSDT');
      expect(strategyEngine.getStrategyState('BTCUSDT')).toBeUndefined();
      expect(strategyEngine.getMetrics('BTCUSDT')).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty historical data gracefully', () => {
      expect(() => {
        strategyEngine.calculateGridInterval([], 'ATR');
      }).toThrow();
    });

    it('should handle invalid candle data', () => {
      const invalidData = [
        {
          open: NaN,
          high: 50000,
          low: 49000,
          close: 49500,
          volume: 1000000,
          timestamp: Date.now(),
        },
      ] as CandlestickData[];

      expect(() => {
        strategyEngine.calculateGridInterval(invalidData, 'ATR');
      }).toThrow();
    });

    it('should handle multiple symbols independently', () => {
      // Add another symbol to config
      mockConfig.symbols.push({
        pair: 'ETHUSDT',
        minDailyBarDiffThreshold: 50,
        gridSize: 500,
        pricePrecision: 2,
        quantityPrecision: 6,
      });

      const newEngine = new StrategyEngine(mockConfig);
      
      // Create different historical data for ETH
      const ethData = mockHistoricalData.map(candle => {
        const scaleFactor = 0.1; // ETH is ~1/10th of BTC price
        const open = candle.open * scaleFactor;
        const close = candle.close * scaleFactor;
        const high = candle.high * scaleFactor;
        const low = candle.low * scaleFactor;
        
        return {
          open,
          high,
          low,
          close,
          volume: candle.volume,
          timestamp: candle.timestamp,
        };
      });

      newEngine.initializeStrategy('BTCUSDT', mockHistoricalData);
      newEngine.initializeStrategy('ETHUSDT', ethData);

      expect(newEngine.getActiveSymbols()).toContain('BTCUSDT');
      expect(newEngine.getActiveSymbols()).toContain('ETHUSDT');

      const btcState = newEngine.getStrategyState('BTCUSDT');
      const ethState = newEngine.getStrategyState('ETHUSDT');

      expect(btcState?.currentPrice).not.toBe(ethState?.currentPrice);
      expect(btcState?.gridLevels.length).toBeGreaterThan(0);
      expect(ethState?.gridLevels.length).toBeGreaterThan(0);
    });
  });
});
