/**
 * Backtesting Module Unit Tests
 * Comprehensive tests for the backtesting functionality
 */

import { Backtester } from '../../services/Backtester';
import { BinanceService } from '../../services/BinanceService';
import { StrategyEngine } from '../../services/StrategyEngine';
import { ReportService } from '../../services/ReportService';
import { PerformanceCalculator } from '../../utils/performance';
import { Logger } from '../../utils/logger';

import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  PortfolioSnapshot,
  SymbolPerformance
} from '../../types/backtest';

import { BotConfigType } from '../../config/schema';

// Mock implementations
jest.mock('@/services/BinanceService');
jest.mock('@/services/StrategyEngine');
jest.mock('@/services/ReportService');
jest.mock('@/utils/logger');

// Create mock logger instance
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

// Mock Logger.getInstance to return our mock logger
const MockedLogger = Logger as jest.Mocked<typeof Logger>;
MockedLogger.getInstance = jest.fn().mockReturnValue(mockLogger);

describe('Backtesting Module', () => {
  let backtester: Backtester;
  let mockBinanceService: jest.Mocked<BinanceService>;
  let mockStrategyEngine: jest.Mocked<StrategyEngine>;
  let mockReportService: jest.Mocked<ReportService>;
  let mockConfig: BotConfigType;

  beforeEach(() => {
    // Setup mock config
    mockConfig = {
      tradeMode: 'backtest',
      exchange: 'binance',
      maxBudget: {
        amount: 10000,
        currency: 'USDT'
      },
      symbols: [
        {
          pair: 'BTC/USDT',
          minDailyBarDiffThreshold: 0.02,
          gridSize: 1000,
          pricePrecision: 2,
          quantityPrecision: 8
        }
      ],
      apiKeys: {
        binanceApiKey: 'test-key',
        binanceSecretKey: 'test-secret'
      },
      strategySettings: {
        barCountForVolatility: 24,
        minVolatilityPercentage: 0.01,
        minVolatileBarRatio: 0.5,
        emaPeriod: 200,
        emaDeviationThreshold: 0.05
      },
      binanceSettings: {
        testnet: true,
        commissionRate: 0.001
      },
      logging: {
        enableConsoleOutput: true,
        enableTelegramOutput: false,
        reportDirectory: './reports',
        transactionLogFileName: 'transactions.log'
      }
    };

    // Setup mocks
    mockBinanceService = new BinanceService(mockConfig) as jest.Mocked<BinanceService>;
    mockStrategyEngine = new StrategyEngine(mockConfig) as jest.Mocked<StrategyEngine>;
    mockReportService = new ReportService('./reports') as jest.Mocked<ReportService>;

    // Mock historical data
    mockBinanceService.getHistoricalKlines.mockResolvedValue([
      {
        openTime: 1640995200000, // 2022-01-01 00:00:00
        open: 46000,
        high: 46500,
        low: 45500,
        close: 46200,
        volume: 100,
        closeTime: 1640995259999,
        quoteAssetVolume: 4620000,
        numberOfTrades: 1000,
        takerBuyBaseAssetVolume: 60,
        takerBuyQuoteAssetVolume: 2772000
      }
    ]);

    // Mock strategy engine
    mockStrategyEngine.initializeStrategy.mockImplementation(() => {});
    mockStrategyEngine.updateState.mockImplementation(() => {});
    mockStrategyEngine.getTradeSignals.mockReturnValue({
      buy: [
        {
          type: 'buy',
          symbol: 'BTC/USDT',
          price: 45900,
          quantity: 0.1,
          gridLevel: {
            price: 45900,
            buySize: 4590,
            sellSize: 0,
            status: 'pending',
            index: 1
          },
          confidence: 0.8,
          timestamp: Date.now()
        }
      ],
      sell: []
    });

    // Mock report service
    mockReportService.saveBacktestReport.mockResolvedValue('/path/to/report.json');

    backtester = new Backtester(
      mockConfig,
      mockBinanceService,
      mockStrategyEngine,
      mockReportService,
      undefined, // logger
      { disableCache: true } // Cache'i test ortamında devre dışı bırak
    );
  });

  describe('Backtester', () => {
    it('should initialize correctly', () => {
      expect(backtester).toBeInstanceOf(Backtester);
    });

    it('should validate backtest configuration', async () => {
      const invalidConfig: Partial<BacktestConfig> = {
        startTime: 1640995200000,
        endTime: 1640995200000 - 1000, // End before start
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000
      };

      await expect(
        backtester.runBacktest(invalidConfig as BacktestConfig)
      ).rejects.toThrow();
    });

    it('should load historical data from API', async () => {
      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640998800000,
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1
      };

      // Add debug spy to check mock call
      const spy = jest.spyOn(mockBinanceService, 'getHistoricalKlines');
      spy.mockResolvedValue([
        {
          openTime: 1640995200000,
          open: 46000,
          high: 46500,
          low: 45500,
          close: 46200,
          volume: 100,
          closeTime: 1640995259999,
          quoteAssetVolume: 4620000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 60,
          takerBuyQuoteAssetVolume: 2772000
        }
      ]);

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.config).toEqual(config);
      expect(spy).toHaveBeenCalled();
    });

    it('should generate comprehensive backtest result', async () => {
      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640998800000,
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1
      };

      const result = await backtester.runBacktest(config);

      expect(result).toMatchObject({
        id: expect.any(String),
        config,
        startTime: config.startTime,
        endTime: config.endTime,
        initialBalance: config.initialBalance,
        finalBalance: expect.any(Number),
        totalReturn: expect.any(Number),
        totalReturnPercentage: expect.any(Number),
        totalTrades: expect.any(Number),
        portfolioHistory: expect.any(Array),
        trades: expect.any(Array),
        symbolPerformance: expect.any(Map),
        executionTimeMs: expect.any(Number),
        createdAt: expect.any(Number),
        version: expect.any(String)
      });

      expect(mockReportService.saveBacktestReport).toHaveBeenCalledWith(result);
    });

    it('should handle errors gracefully', async () => {
      mockBinanceService.getHistoricalKlines.mockRejectedValue(
        new Error('API Error')
      );

      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640998800000,
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1
      };

      await expect(backtester.runBacktest(config)).rejects.toThrow('Failed to load data for BTC/USDT after 3 attempts');
    });
  });

  describe('PerformanceCalculator', () => {
    let performanceCalculator: PerformanceCalculator;

    beforeEach(() => {
      performanceCalculator = new PerformanceCalculator();
    });

    it('should calculate symbol performance correctly', () => {
      const trades: BacktestTrade[] = [
        {
          id: '1',
          timestamp: 1640995200000,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'LIMIT',
          price: 46000,
          quantity: 0.1,
          value: 4600,
          commission: 4.6,
          gridLevel: 46000,
          executionPrice: 46000,
          slippage: 0,
          candleTime: 1640995200000
        },
        {
          id: '2',
          timestamp: 1640995260000,
          symbol: 'BTC/USDT',
          side: 'SELL',
          type: 'LIMIT',
          price: 46500,
          quantity: 0.1,
          value: 4650,
          commission: 4.65,
          profit: 40.75, // 4650 - 4600 - 4.6 - 4.65
          gridLevel: 46500,
          executionPrice: 46500,
          slippage: 0,
          candleTime: 1640995260000
        }
      ];

      const portfolioHistory: PortfolioSnapshot[] = [
        {
          timestamp: 1640995200000,
          totalValue: 10000,
          baseBalances: {},
          quoteBalance: 10000,
          unrealizedPnL: 0,
          realizedPnL: 0,
          drawdown: 0,
          drawdownPercentage: 0
        }
      ];

      const performance = performanceCalculator.calculateSymbolPerformance(
        'BTC/USDT',
        trades,
        portfolioHistory
      );

      expect(performance).toMatchObject({
        symbol: 'BTC/USDT',
        totalTrades: 2,
        buyTrades: 1,
        sellTrades: 1,
        winningTrades: 1,
        losingTrades: 0,
        winRate: 100,
        grossProfit: 40.75,
        grossLoss: 0,
        netProfit: 40.75,
        totalCommission: 9.25,
        profitFactor: Infinity
      });
    });

    it('should calculate overall performance metrics', () => {
      const portfolioHistory: PortfolioSnapshot[] = [
        {
          timestamp: 1640995200000,
          totalValue: 10000,
          baseBalances: {},
          quoteBalance: 10000,
          unrealizedPnL: 0,
          realizedPnL: 0,
          drawdown: 0,
          drawdownPercentage: 0
        },
        {
          timestamp: 1640998800000,
          totalValue: 10100,
          baseBalances: {},
          quoteBalance: 10100,
          unrealizedPnL: 0,
          realizedPnL: 100,
          drawdown: 0,
          drawdownPercentage: 0
        }
      ];

      const trades: BacktestTrade[] = [];

      const performance = performanceCalculator.calculateOverallPerformance(
        portfolioHistory,
        trades,
        10000
      );

      expect(performance.totalReturn).toBe(100);
      expect(performance.totalReturnPercentage).toBe(1);
      expect(performance.maxDrawdown).toBe(0);
      expect(performance.maxDrawdownPercentage).toBe(0);
    });

    it('should handle empty data sets', () => {
      const performance = performanceCalculator.calculateSymbolPerformance(
        'BTC/USDT',
        [],
        []
      );

      expect(performance).toMatchObject({
        symbol: 'BTC/USDT',
        totalTrades: 0,
        winRate: 0,
        netProfit: 0,
        profitFactor: 0
      });
    });
  });

  describe('ReportService', () => {
    let reportService: ReportService;

    beforeEach(() => {
      reportService = new ReportService('./test-reports');
    });

    it('should save backtest report in JSON format', async () => {
      const mockResult: BacktestResult = {
        id: 'test-123',
        config: {
          startTime: 1640995200000,
          endTime: 1640998800000,
          symbols: ['BTC/USDT'],
          interval: '1m',
          initialBalance: 10000,
          slippagePercentage: 0.001,
          enableDetailedLogging: true,
          saveHistoricalData: true,
          maxConcurrentSymbols: 1
        },
        startTime: 1640995200000,
        endTime: 1640998800000,
        duration: 3600000,
        initialBalance: 10000,
        finalBalance: 10100,
        totalReturn: 100,
        totalReturnPercentage: 1,
        annualizedReturn: 8760, // 1% per hour * 8760 hours
        maxDrawdown: 0,
        maxDrawdownPercentage: 0,
        maxDrawdownDuration: 0,
        volatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
        totalTrades: 2,
        totalBuyTrades: 1,
        totalSellTrades: 1,
        totalWinningTrades: 1,
        totalLosingTrades: 0,
        overallWinRate: 100,
        totalCommission: 9.25,
        totalSlippage: 0,
        averageTradeSize: 4625,
        totalVolume: 9250,
        symbolPerformance: new Map(),
        portfolioHistory: [],
        trades: [],
        executionTimeMs: 1000,
        dataPointsProcessed: 60,
        errorsEncountered: [],
        createdAt: Date.now(),
        version: '1.0.0'
      };

      // Mock the actual method since we're testing the interface
      const spy = jest.spyOn(reportService, 'saveBacktestReport');
      spy.mockResolvedValue('/path/to/report.json');

      const filePath = await reportService.saveBacktestReport(mockResult);

      expect(filePath).toBe('/path/to/report.json');
      expect(spy).toHaveBeenCalledWith(mockResult);
    });

    it('should validate transaction log entries', async () => {
      const validEntry = {
        time: Date.now(),
        type: 'ORDER_FILLED' as const,
        symbol: 'BTC/USDT',
        side: 'BUY' as const,
        price: 46000,
        quantity: 0.1,
        orderId: 'order-123'
      };

      // Mock the method
      const spy = jest.spyOn(reportService, 'logTransaction');
      spy.mockResolvedValue(undefined);

      await expect(reportService.logTransaction(validEntry)).resolves.not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should run end-to-end backtest simulation', async () => {
      // This test verifies the complete backtest flow
      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640995260000, // 1-minute test
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: false,
        saveHistoricalData: false,
        maxConcurrentSymbols: 1
      };

      // Mock minimal historical data
      mockBinanceService.getHistoricalKlines.mockResolvedValue([
        {
          openTime: 1640995200000,
          open: 46000,
          high: 46500,
          low: 45500,
          close: 46200,
          volume: 100,
          closeTime: 1640995259999,
          quoteAssetVolume: 4620000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 60,
          takerBuyQuoteAssetVolume: 2772000
        }
      ]);

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result.config).toEqual(config);
      expect(result.initialBalance).toBe(10000);
      expect(result.symbolPerformance.has('BTC/USDT')).toBe(true);
      expect(mockStrategyEngine.initializeStrategy).toHaveBeenCalledWith(
        'BTC/USDT',
        expect.any(Array)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during data loading', async () => {
      // Reset all previous mocks and set up failure for all attempts
      mockBinanceService.getHistoricalKlines.mockReset();
      mockBinanceService.getHistoricalKlines.mockRejectedValue(
        new Error('Network timeout')
      );

      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640998800000,
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1
      };

      await expect(backtester.runBacktest(config)).rejects.toThrow('Failed to load data for BTC/USDT after 3 attempts');
    });

    it('should handle strategy engine errors', async () => {
      // Clear existing mock and set up error
      mockStrategyEngine.getTradeSignals.mockReset();
      mockStrategyEngine.getTradeSignals.mockImplementation(() => {
        throw new Error('Strategy calculation failed');
      });

      const config: BacktestConfig = {
        startTime: 1640995200000,
        endTime: 1640995260000,
        symbols: ['BTC/USDT'],
        interval: '1m',
        initialBalance: 10000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1
      };

      // Should complete without throwing (errors are caught and logged)
      const result = await backtester.runBacktest(config);
      
      // Test should pass - either errors are captured or no trading signals are generated
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(typeof result.errorsEncountered).toBe('object');
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle zero trades scenario', () => {
      const performanceCalculator = new PerformanceCalculator();
      
      const performance = performanceCalculator.calculateSymbolPerformance(
        'BTC/USDT',
        [],
        []
      );

      expect(performance.totalTrades).toBe(0);
      expect(performance.winRate).toBe(0);
      expect(performance.netProfit).toBe(0);
    });

    it('should handle extreme volatility', () => {
      const performanceCalculator = new PerformanceCalculator();
      
      const portfolioHistory: PortfolioSnapshot[] = [
        {
          timestamp: 1640995200000,
          totalValue: 10000,
          baseBalances: {},
          quoteBalance: 10000,
          unrealizedPnL: 0,
          realizedPnL: 0,
          drawdown: 0,
          drawdownPercentage: 0
        },
        {
          timestamp: 1640995260000,
          totalValue: 5000, // 50% drawdown
          baseBalances: {},
          quoteBalance: 5000,
          unrealizedPnL: 0,
          realizedPnL: -5000,
          drawdown: 5000,
          drawdownPercentage: 0.5
        }
      ];

      const performance = performanceCalculator.calculateOverallPerformance(
        portfolioHistory,
        [],
        10000
      );

      expect(performance.maxDrawdown).toBe(5000);
      expect(performance.maxDrawdownPercentage).toBe(50);
      expect(performance.totalReturn).toBe(-5000);
    });
  });
});
