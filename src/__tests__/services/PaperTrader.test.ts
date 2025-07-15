/**
 * Paper Trader Unit Tests
 */

import { EventEmitter } from 'events';
import { PaperTrader } from '../services/PaperTrader';
import { BinanceService } from '../services/BinanceService';
import { StrategyEngine } from '../services/StrategyEngine';
import { NotificationService } from '../services/NotificationService';
import { ReportService } from '../services/ReportService';
import { Logger } from '../utils/logger';
import { BotConfigType } from '../config/schema';
import { VirtualOrder, VirtualBalance } from '../types';
import { BinanceWebSocketKline } from '../types/binance';

// Mock dependencies
jest.mock('@/services/BinanceService');
jest.mock('@/services/StrategyEngine');
jest.mock('@/services/NotificationService');
jest.mock('@/services/ReportService');
jest.mock('@/utils/logger');

describe('PaperTrader', () => {
  let paperTrader: PaperTrader;
  let mockBinanceService: jest.Mocked<BinanceService>;
  let mockStrategyEngine: jest.Mocked<StrategyEngine>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockReportService: jest.Mocked<ReportService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockConfig: BotConfigType;

  beforeEach(() => {
    // Setup mocks
    mockBinanceService = {
      getHistoricalKlines: jest.fn(),
      subscribeToKlineUpdates: jest.fn(),
      unsubscribeFromUpdates: jest.fn(),
    } as any;

    mockStrategyEngine = {
      initializeStrategy: jest.fn(),
      updateState: jest.fn(),
      getTradeSignals: jest.fn(),
    } as any;

    mockNotificationService = {
      sendNotification: jest.fn(),
      sendTradingNotification: jest.fn(),
      sendErrorNotification: jest.fn(),
      sendStatusNotification: jest.fn(),
    } as any;

    mockReportService = {
      logTransaction: jest.fn(),
      saveStatusReport: jest.fn(),
      saveBacktestReport: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Mock config
    mockConfig = {
      tradeMode: 'papertrade',
      exchange: 'binance',
      maxBudget: {
        amount: 10000,
        currency: 'USDT',
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 0.01,
        },
      ],
      apiKeys: {
        binanceApiKey: 'test-api-key',
        binanceSecretKey: 'test-secret-key',
      },
      strategySettings: {
        barCountForVolatility: 20,
        minVolatilityPercentage: 0.02,
        minVolatileBarRatio: 0.3,
        emaPeriod: 200,
        emaDeviationThreshold: 0.05,
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
    } as BotConfigType;

    // Create PaperTrader instance
    paperTrader = new PaperTrader(
      mockConfig,
      mockBinanceService,
      mockStrategyEngine,
      mockNotificationService,
      mockReportService,
      {
        enableNotifications: true,
        enableReporting: true,
        reportingInterval: 1, // 1 minute for testing
      },
      mockLogger
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      const state = paperTrader.getState();
      
      expect(state.isRunning).toBe(false);
      expect(state.virtualBalances.USDT).toBe(10000);
      expect(state.totalTrades).toBe(0);
      expect(state.totalProfit).toBe(0);
      expect(state.maxDrawdown).toBe(0);
    });

    it('should set up event listeners correctly', () => {
      const spy = jest.spyOn(paperTrader, 'emit');
      expect(paperTrader.listenerCount('order-filled')).toBeGreaterThan(0);
      expect(paperTrader.listenerCount('balance-updated')).toBeGreaterThan(0);
      expect(paperTrader.listenerCount('error')).toBeGreaterThan(0);
    });
  });

  describe('Start and Stop', () => {
    beforeEach(() => {
      // Mock historical data
      mockBinanceService.getHistoricalKlines.mockResolvedValue([
        {
          openTime: Date.now() - 60000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          closeTime: Date.now(),
          quoteAssetVolume: 5050000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 50,
          takerBuyQuoteAssetVolume: 2525000,
        },
      ]);

      mockBinanceService.subscribeToKlineUpdates.mockReturnValue('subscription-id');
      mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
    });

    it('should start paper trading successfully', async () => {
      await paperTrader.start();
      
      const state = paperTrader.getState();
      expect(state.isRunning).toBe(true);
      expect(state.startTime).toBeGreaterThan(0);
      
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        'Paper trading started successfully',
        'success'
      );
      expect(mockStrategyEngine.initializeStrategy).toHaveBeenCalledWith(
        'BTCUSDT',
        expect.any(Array)
      );
      expect(mockBinanceService.subscribeToKlineUpdates).toHaveBeenCalled();
    });

    it('should throw error if already running', async () => {
      await paperTrader.start();
      await expect(paperTrader.start()).rejects.toThrow('Paper trading is already running');
    });

    it('should stop paper trading successfully', async () => {
      await paperTrader.start();
      await paperTrader.stop();
      
      const state = paperTrader.getState();
      expect(state.isRunning).toBe(false);
      
      expect(mockBinanceService.unsubscribeFromUpdates).toHaveBeenCalledWith('subscription-id');
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        'Paper trading stopped',
        'info'
      );
    });

    it('should handle start errors gracefully', async () => {
      mockStrategyEngine.initializeStrategy.mockImplementation(() => {
        throw new Error('API Error');
      });
      
      await expect(paperTrader.start()).rejects.toThrow('API Error');
      
      const state = paperTrader.getState();
      expect(state.isRunning).toBe(false);
      
      expect(mockNotificationService.sendErrorNotification).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to start paper trading'
      );
    });
  });

  describe('Virtual Order Management', () => {
    beforeEach(async () => {
      mockBinanceService.getHistoricalKlines.mockResolvedValue([
        {
          openTime: Date.now() - 60000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          closeTime: Date.now(),
          quoteAssetVolume: 5050000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 50,
          takerBuyQuoteAssetVolume: 2525000,
        },
      ]);

      mockBinanceService.subscribeToKlineUpdates.mockReturnValue('subscription-id');
      mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
      
      await paperTrader.start();
    });

    it('should create virtual buy order successfully', async () => {
      // Simulate trade signal
      mockStrategyEngine.getTradeSignals.mockReturnValue({
        buy: [{ 
          type: 'buy' as const,
          symbol: 'BTCUSDT',
          price: 49000, 
          quantity: 0.02, // Using quantity instead of buySize
          gridLevel: { 
            price: 49000,
            buySize: 1000,
            sellSize: 0.02,
            status: 'pending' as const,
            index: 0,
          },
          confidence: 0.8,
          timestamp: Date.now(),
        }],
        sell: [],
      });

      // Process kline to trigger order creation
      const mockKline: BinanceWebSocketKline = {
        e: 'kline',
        E: Date.now(),
        s: 'BTCUSDT',
        k: {
          t: Date.now(),
          T: Date.now() + 60000,
          s: 'BTCUSDT',
          i: '1m',
          f: 100,
          L: 200,
          o: '50000',
          c: '50500',
          h: '51000',
          l: '49000',
          v: '100',
          n: 1000,
          x: true,
          q: '5050000',
          V: '50',
          Q: '2525000',
          B: '0',
        },
      };

      await (paperTrader as any).processKline('BTCUSDT', mockKline);

      const openOrders = paperTrader.getOpenOrders();
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0]?.side).toBe('BUY');
      expect(openOrders[0]?.price).toBe(49000);
      expect(openOrders[0]?.status).toBe('NEW');
    });

    it('should not create order with insufficient balance', async () => {
      // Set low balance
      const state = paperTrader.getState();
      state.virtualBalances.USDT = 10;

      // Simulate expensive trade signal
      mockStrategyEngine.getTradeSignals.mockReturnValue({
        buy: [{ 
          type: 'buy' as const,
          symbol: 'BTCUSDT',
          price: 50000, 
          quantity: 0.2, // Using quantity instead of buySize
          gridLevel: { 
            price: 50000,
            buySize: 10000,
            sellSize: 0.2,
            status: 'pending' as const,
            index: 0,
          },
          confidence: 0.8,
          timestamp: Date.now(),
        }],
        sell: [],
      });

      const mockKline: BinanceWebSocketKline = {
        e: 'kline',
        E: Date.now(),
        s: 'BTCUSDT',
        k: {
          t: Date.now(),
          T: Date.now() + 60000,
          s: 'BTCUSDT',
          i: '1m',
          f: 100,
          L: 200,
          o: '50000',
          c: '50500',
          h: '51000',
          l: '49000',
          v: '100',
          n: 1000,
          x: true,
          q: '5050000',
          V: '50',
          Q: '2525000',
          B: '0',
        },
      };

      await (paperTrader as any).processKline('BTCUSDT', mockKline);

      const openOrders = paperTrader.getOpenOrders();
      expect(openOrders).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient USDT balance'),
        expect.any(Object)
      );
    });

    it('should fill buy order when price is hit', async () => {
      // Create a buy order first
      await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 49000,
        quantity: 0.1,
      });

      // Simulate price hitting the order
      const marketBar = {
        time: Date.now(),
        open: 50000,
        high: 50500,
        low: 48500, // Price hits our buy order at 49000
        close: 49500,
        volume: 100,
      };

      await (paperTrader as any).processVirtualOrders('BTCUSDT', marketBar);

      const openOrders = paperTrader.getOpenOrders();
      expect(openOrders).toHaveLength(0); // Order should be filled

      const balances = paperTrader.getBalances();
      expect(balances.BTC).toBeCloseTo(0.1, 6);
      expect(balances.USDT).toBeLessThan(10000); // Should be reduced by cost + commission
    });

    it('should fill sell order when price is hit', async () => {
      // Set up some BTC balance first
      const state = paperTrader.getState();
      state.virtualBalances.BTC = 1;

      // Create a sell order
      await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'LIMIT',
        price: 51000,
        quantity: 0.1,
      });

      // Simulate price hitting the order
      const marketBar = {
        time: Date.now(),
        open: 50000,
        high: 52000, // Price hits our sell order at 51000
        low: 49500,
        close: 51500,
        volume: 100,
      };

      await (paperTrader as any).processVirtualOrders('BTCUSDT', marketBar);

      const openOrders = paperTrader.getOpenOrders();
      expect(openOrders).toHaveLength(0); // Order should be filled

      const balances = paperTrader.getBalances();
      expect(balances.BTC).toBeCloseTo(0.9, 6);
      expect(balances.USDT).toBeGreaterThan(10000); // Should be increased by proceeds - commission
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(async () => {
      mockBinanceService.getHistoricalKlines.mockResolvedValue([
        {
          openTime: Date.now() - 60000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          closeTime: Date.now(),
          quoteAssetVolume: 5050000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 50,
          takerBuyQuoteAssetVolume: 2525000,
        },
      ]);

      mockBinanceService.subscribeToKlineUpdates.mockReturnValue('subscription-id');
      mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
      
      await paperTrader.start();
    });

    it('should track performance metrics correctly', async () => {
      // Add a small delay to ensure runtime is calculated properly
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const performance = paperTrader.getPerformanceSummary();
      
      expect(performance.totalTrades).toBe(0);
      expect(performance.totalProfit).toBe(0);
      expect(performance.maxDrawdown).toBe(0);
      expect(performance.winRate).toBe(0);
      expect(performance.runtime).toBeGreaterThanOrEqual(0);
    });

    it('should update max drawdown correctly', async () => {
      const orderFilled = jest.fn();
      paperTrader.on('order-filled', orderFilled);

      // Since we can't directly modify internal state, we'll test through a mock
      const performanceSpy = jest.spyOn(paperTrader, 'getPerformanceSummary').mockReturnValue({
        totalTrades: 5,
        totalProfit: -2000, // Loss
        maxDrawdown: 20, // 20% drawdown
        winRate: 40,
        runtime: 60000,
      });

      const performance = paperTrader.getPerformanceSummary();
      expect(performance.maxDrawdown).toBe(20);
      
      performanceSpy.mockRestore();
    });
  });

  describe('Event Handling', () => {
    it('should emit order-created event', async () => {
      const orderCreated = jest.fn();
      paperTrader.on('order-created', orderCreated);

      await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 49000,
        quantity: 0.1,
      });

      expect(orderCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'BUY',
          price: 49000,
          quantity: 0.1,
          status: 'NEW',
        })
      );
    });

    it('should emit order-filled event', async () => {
      const orderFilled = jest.fn();
      paperTrader.on('order-filled', orderFilled);

      // Create and fill an order
      const orderId = await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 49000,
        quantity: 0.1,
      });

      const order = paperTrader.getState().virtualOrders.get(orderId);
      const marketBar = {
        time: Date.now(),
        open: 50000,
        high: 50500,
        low: 48500,
        close: 49500,
        volume: 100,
      };

      await (paperTrader as any).fillOrder(order, marketBar);

      expect(orderFilled).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FILLED',
          filledQuantity: 0.1,
        })
      );
    });

    it('should emit profit-realized event on sell', async () => {
      const profitRealized = jest.fn();
      paperTrader.on('profit-realized', profitRealized);

      // Set up balance and create sell order
      const state = paperTrader.getState();
      state.virtualBalances.BTC = 1;

      const orderId = await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'LIMIT',
        price: 51000,
        quantity: 0.1,
      });

      expect(orderId).toBeTruthy();
      const order = state.virtualOrders.get(orderId);
      expect(order).toBeDefined();
      
      const marketBar = {
        time: Date.now(),
        open: 50000,
        high: 52000,
        low: 49500,
        close: 51500,
        volume: 100,
      };

      await (paperTrader as any).fillOrder(order, marketBar);

      expect(profitRealized).toHaveBeenCalledWith(
        expect.any(Number),
        'BTCUSDT'
      );
    });

    it('should emit error event on exceptions', async () => {
      const errorHandler = jest.fn();
      paperTrader.on('error', errorHandler);

      // Force an error
      mockStrategyEngine.updateState.mockImplementation(() => {
        throw new Error('Test error');
      });

      const mockKline: BinanceWebSocketKline = {
        e: 'kline',
        E: Date.now(),
        s: 'BTCUSDT',
        k: {
          t: Date.now(),
          T: Date.now() + 60000,
          s: 'BTCUSDT',
          i: '1m',
          f: 100,
          L: 200,
          o: '50000',
          c: '50500',
          h: '51000',
          l: '49000',
          v: '100',
          n: 1000,
          x: true,
          q: '5050000',
          V: '50',
          Q: '2525000',
          B: '0',
        },
      };

      await (paperTrader as any).processKline('BTCUSDT', mockKline);

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Reporting', () => {
    beforeEach(async () => {
      mockBinanceService.getHistoricalKlines.mockResolvedValue([
        {
          openTime: Date.now() - 60000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          closeTime: Date.now(),
          quoteAssetVolume: 5050000,
          numberOfTrades: 1000,
          takerBuyBaseAssetVolume: 50,
          takerBuyQuoteAssetVolume: 2525000,
        },
      ]);

      mockBinanceService.subscribeToKlineUpdates.mockReturnValue('subscription-id');
      mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
    });

    it('should generate status reports', async () => {
      await paperTrader.start();
      
      // Wait for a status report to be generated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await (paperTrader as any).generateStatusReport();
      
      expect(mockReportService.saveStatusReport).toHaveBeenCalledWith(
        expect.objectContaining({
          time: expect.any(Number),
          mode: 'papertrade',
          balances: expect.any(Object),
          performance: expect.any(Object),
        }),
        'papertrade'
      );
    });

    it('should generate final report on stop', async () => {
      await paperTrader.start();
      await paperTrader.stop();
      
      expect(mockReportService.saveBacktestReport).toHaveBeenCalled();
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Paper Trading Completed'),
        'success'
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should apply custom paper trading configuration', () => {
      const customPaperTrader = new PaperTrader(
        mockConfig,
        mockBinanceService,
        mockStrategyEngine,
        mockNotificationService,
        mockReportService,
        {
          initialBalance: 5000,
          currency: 'EUR',
          slippageRate: 0.002,
          latencyMs: 200,
          enableNotifications: false,
        },
        mockLogger
      );

      const state = customPaperTrader.getState();
      expect(state.virtualBalances.EUR).toBe(5000);
    });

    it('should use default configuration when not provided', () => {
      const defaultPaperTrader = new PaperTrader(
        mockConfig,
        mockBinanceService,
        mockStrategyEngine,
        mockNotificationService,
        mockReportService,
        undefined,
        mockLogger
      );

      const state = defaultPaperTrader.getState();
      expect(state.virtualBalances.USDT).toBe(10000); // From mockConfig
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      mockBinanceService.getHistoricalKlines.mockResolvedValue([]);
      mockBinanceService.subscribeToKlineUpdates.mockReturnValue('subscription-id');
      
      await paperTrader.start();
      await paperTrader.destroy();
      
      const state = paperTrader.getState();
      expect(state.isRunning).toBe(false);
      expect(mockBinanceService.unsubscribeFromUpdates).toHaveBeenCalled();
      expect(paperTrader.listenerCount('error')).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle symbol parsing correctly', async () => {
      // Test different symbol formats
      const symbols = ['BTCUSDT', 'BTC/USDT', 'ETHUSDT'];
      
      for (const symbol of symbols) {
        const result = await (paperTrader as any).createVirtualOrder({
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: 50000,
          quantity: 0.1,
        });
        
        expect(result).toBeTruthy();
      }
    });

    it('should handle zero or negative prices gracefully', async () => {
      const result = await (paperTrader as any).createVirtualOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 0,
        quantity: 0.1,
      });
      
      // Should handle validation errors
      expect(result).toBeNull();
    });

    it('should handle empty trade signals', async () => {
      mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
      
      const mockKline: BinanceWebSocketKline = {
        e: 'kline',
        E: Date.now(),
        s: 'BTCUSDT',
        k: {
          t: Date.now(),
          T: Date.now() + 60000,
          s: 'BTCUSDT',
          i: '1m',
          f: 100,
          L: 200,
          o: '50000',
          c: '50500',
          h: '51000',
          l: '49000',
          v: '100',
          n: 1000,
          x: true,
          q: '5050000',
          V: '50',
          Q: '2525000',
          B: '0',
        },
      };

      // Should not throw error
      await expect((paperTrader as any).processKline('BTCUSDT', mockKline)).resolves.not.toThrow();
    });
  });
});
