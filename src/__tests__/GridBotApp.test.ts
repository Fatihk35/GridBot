/**
 * Unit tests for GridBotApp
 * 
 * Tests the main application class functionality including:
 * - Initialization and configuration loading
 * - Service orchestration
 * - Trading mode m    it('should handle configuration loading errors', async () => {
      const error = new Error('Config file not found');
      mockConfigLoader.loadConfig.mockRejectedValue(error);

      await expect(app.initialize()).rejects.toThrow('Failed to load configuration');
      expect(app.getState()).toBe(AppState.ERROR);
    });nt
 * - Error handling
 * - Lifecycle management
 */

import { GridBotApp, AppOptions, AppState } from '../GridBotApp';
import { BinanceService } from '../services/BinanceService';
import { StrategyEngine } from '../services/StrategyEngine';
import { NotificationService } from '../services/NotificationService';
import { ReportService } from '../services/ReportService';
import { Backtester } from '../services/Backtester';
import { PaperTrader } from '../services/PaperTrader';
import { LiveTrader } from '../services/LiveTrader';
import { ConfigLoader } from '../config/ConfigLoader';
import { TradingError, ConfigError } from '../utils/errors';

// Mock all dependencies
jest.mock('../services/BinanceService');
jest.mock('../services/StrategyEngine');
jest.mock('../services/NotificationService');
jest.mock('../services/ReportService');
jest.mock('../services/Backtester');
jest.mock('../services/PaperTrader');
jest.mock('../services/LiveTrader');
jest.mock('../config/ConfigLoader');
jest.mock('../utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('GridBotApp', () => {
  let app: GridBotApp;
  let mockConfig: any;
  
  // Mock instances
  let mockBinanceService: jest.Mocked<BinanceService>;
  let mockStrategyEngine: jest.Mocked<StrategyEngine>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockReportService: jest.Mocked<ReportService>;
  let mockBacktester: jest.Mocked<Backtester>;
  let mockPaperTrader: jest.Mocked<PaperTrader>;
  let mockLiveTrader: jest.Mocked<LiveTrader>;
  let mockConfigLoader: jest.Mocked<ConfigLoader>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock configuration
    mockConfig = {
      tradeMode: 'papertrade',
      exchange: 'binance',
      maxBudget: {
        amount: 1000,
        currency: 'USDT'
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          gridSize: 10,
          pricePrecision: 2,
          quantityPrecision: 8,
          minDailyBarDiffThreshold: 0.01
        }
      ],
      apiKeys: {
        binanceApiKey: 'test-api-key',
        binanceApiSecret: 'test-api-secret',
        telegramBotToken: 'test-telegram-token',
        telegramChatId: 'test-chat-id'
      },
      strategySettings: {
        gridLevels: 10,
        profitPerGrid: 0.01,
        stopLossPercent: 0.05,
        takeProfitPercent: 0.1
      },
      binanceSettings: {
        testnet: true,
        rateLimitBuffer: 0.8
      },
      logging: {
        level: 'info',
        enableConsoleOutput: true,
        enableFileOutput: true,
        enableTelegramOutput: false
      }
    };

    // Mock ConfigLoader
    mockConfigLoader = new ConfigLoader() as jest.Mocked<ConfigLoader>;
    mockConfigLoader.loadConfig = jest.fn().mockResolvedValue(mockConfig);
    (ConfigLoader as jest.MockedClass<typeof ConfigLoader>).mockImplementation(() => mockConfigLoader);

    // Mock services
    mockBinanceService = new BinanceService(mockConfig) as jest.Mocked<BinanceService>;
    mockStrategyEngine = new StrategyEngine(mockConfig) as jest.Mocked<StrategyEngine>;
    mockNotificationService = new NotificationService(mockConfig) as jest.Mocked<NotificationService>;
    mockReportService = new ReportService('./reports') as jest.Mocked<ReportService>;
    mockBacktester = new Backtester(mockConfig, mockBinanceService, mockStrategyEngine, mockReportService) as jest.Mocked<Backtester>;
    mockPaperTrader = new PaperTrader(mockConfig, mockBinanceService, mockStrategyEngine, mockNotificationService, mockReportService) as jest.Mocked<PaperTrader>;
    mockLiveTrader = new LiveTrader(mockConfig, mockBinanceService, mockStrategyEngine, mockNotificationService, mockReportService) as jest.Mocked<LiveTrader>;

    // Mock constructors - restore default implementation first
    (BinanceService as jest.MockedClass<typeof BinanceService>).mockRestore?.();
    (BinanceService as jest.MockedClass<typeof BinanceService>).mockImplementation(() => mockBinanceService);
    (StrategyEngine as jest.MockedClass<typeof StrategyEngine>).mockImplementation(() => mockStrategyEngine);
    (NotificationService as jest.MockedClass<typeof NotificationService>).mockImplementation(() => mockNotificationService);
    (ReportService as jest.MockedClass<typeof ReportService>).mockImplementation(() => mockReportService);
    (Backtester as jest.MockedClass<typeof Backtester>).mockImplementation(() => mockBacktester);
    (PaperTrader as jest.MockedClass<typeof PaperTrader>).mockImplementation(() => mockPaperTrader);
    (LiveTrader as jest.MockedClass<typeof LiveTrader>).mockImplementation(() => mockLiveTrader);

    // Mock trader methods
    mockBacktester.runBacktest = jest.fn().mockResolvedValue({} as any);
    mockPaperTrader.start = jest.fn().mockResolvedValue(undefined);
    mockPaperTrader.stop = jest.fn().mockResolvedValue(undefined);
    mockLiveTrader.start = jest.fn().mockResolvedValue(undefined);
    mockLiveTrader.stop = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.sendNotification = jest.fn().mockResolvedValue(undefined);

    // Create app instance
    app = new GridBotApp();
  });

  afterEach(() => {
    // Clean up any event listeners if app was created
    if (app && typeof app.removeAllListeners === 'function') {
      app.removeAllListeners();
    }
  });

  describe('Constructor', () => {
    it('should create app with default options', () => {
      const newApp = new GridBotApp();
      expect(newApp.getState()).toBe(AppState.INITIALIZING);
    });

    it('should create app with custom options', () => {
      const options: AppOptions = {
        configPath: './custom-config',
        mode: 'backtest',
        verbose: true,
        dryRun: true
      };
      
      const newApp = new GridBotApp(options);
      expect(newApp.getState()).toBe(AppState.INITIALIZING);
    });

    it('should validate options schema', () => {
      const invalidOptions = {
        mode: 'invalid-mode'
      } as any;

      expect(() => new GridBotApp(invalidOptions)).toThrow();
    });
  });

  describe('initialize()', () => {
    it('should initialize successfully with valid config', async () => {
      const stateChangeSpy = jest.fn();
      app.on('stateChanged', stateChangeSpy);
      app.on('initialized', jest.fn());

      await app.initialize();

      expect(app.getState()).toBe(AppState.READY);
      expect(mockConfigLoader.loadConfig).toHaveBeenCalled();
      expect(BinanceService).toHaveBeenCalledWith(mockConfig);
      expect(StrategyEngine).toHaveBeenCalledWith(mockConfig);
      expect(NotificationService).toHaveBeenCalledWith(mockConfig);
      expect(ReportService).toHaveBeenCalledWith('./reports');
      expect(Backtester).toHaveBeenCalled();
      expect(PaperTrader).toHaveBeenCalled();
      expect(LiveTrader).toHaveBeenCalled();
    });

    it('should handle configuration loading errors', async () => {
      const error = new Error('Config file not found');
      mockConfigLoader.loadConfig.mockRejectedValue(error);

      await expect(app.initialize()).rejects.toThrow('Failed to load configuration');
      expect(app.getState()).toBe(AppState.ERROR);
    });

    it('should handle service initialization errors', async () => {
      // Create a temporary mock that throws error
      const originalMock = (BinanceService as jest.MockedClass<typeof BinanceService>).getMockImplementation();
      
      (BinanceService as jest.MockedClass<typeof BinanceService>).mockImplementationOnce(() => {
        throw new Error('API credentials invalid');
      });

      await expect(app.initialize()).rejects.toThrow('Failed to initialize services');
      expect(app.getState()).toBe(AppState.ERROR);
      
      // Restore original mock
      if (originalMock) {
        (BinanceService as jest.MockedClass<typeof BinanceService>).mockImplementation(originalMock);
      }
    });

    it('should emit initialized event on success', async () => {
      const initializedSpy = jest.fn();
      app.on('initialized', initializedSpy);

      await app.initialize();

      expect(initializedSpy).toHaveBeenCalled();
    });

    it('should emit error event on failure', async () => {
      const errorSpy = jest.fn();
      app.on('error', errorSpy);
      
      mockConfigLoader.loadConfig.mockRejectedValue(new Error('Test error'));

      await expect(app.initialize()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('start()', () => {
    beforeEach(async () => {
      await app.initialize();
    });

    it('should start paper trading mode successfully', async () => {
      mockConfig.tradeMode = 'papertrade';
      
      await app.start();

      expect(app.getState()).toBe(AppState.RUNNING);
      expect(mockPaperTrader.start).toHaveBeenCalled();
    });

    it('should start live trading mode successfully', async () => {
      mockConfig.tradeMode = 'live';
      
      await app.start();

      expect(app.getState()).toBe(AppState.RUNNING);
      expect(mockLiveTrader.start).toHaveBeenCalled();
    });

    it('should run backtest mode successfully', async () => {
      mockConfig.tradeMode = 'backtest';
      
      await app.start();

      expect(app.getState()).toBe(AppState.STOPPED);
      expect(mockBacktester.runBacktest).toHaveBeenCalled();
    });

    it('should use mode override from options', async () => {
      const appWithOverride = new GridBotApp({ mode: 'live' });
      await appWithOverride.initialize();
      
      await appWithOverride.start();

      expect(mockLiveTrader.start).toHaveBeenCalled();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedApp = new GridBotApp();
      
      await expect(uninitializedApp.start()).rejects.toThrow('Cannot start application in state');
    });

    it('should handle trading mode startup errors', async () => {
      mockPaperTrader.start.mockRejectedValue(new Error('Connection failed'));
      
      await expect(app.start()).rejects.toThrow('Paper trader failed');
      expect(app.getState()).toBe(AppState.ERROR);
    });

    it('should send notification on startup failure', async () => {
      mockPaperTrader.start.mockRejectedValue(new Error('Connection failed'));
      
      await expect(app.start()).rejects.toThrow();
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('GridBot startup failed'),
        'error'
      );
    });

    it('should emit started event on success', async () => {
      const startedSpy = jest.fn();
      app.on('started', startedSpy);

      await app.start();

      expect(startedSpy).toHaveBeenCalled();
    });

    it('should throw error for unknown trade mode', async () => {
      mockConfig.tradeMode = 'unknown' as any;
      
      await expect(app.start()).rejects.toThrow('Unknown trade mode');
    });
  });

  describe('stop()', () => {
    beforeEach(async () => {
      await app.initialize();
      await app.start();
    });

    it('should stop paper trading mode successfully', async () => {
      await app.stop();

      expect(app.getState()).toBe(AppState.STOPPED);
      expect(mockPaperTrader.stop).toHaveBeenCalled();
    });

    it('should stop live trading mode successfully', async () => {
      mockConfig.tradeMode = 'live';
      const liveApp = new GridBotApp();
      await liveApp.initialize();
      await liveApp.start();
      
      await liveApp.stop();

      expect(liveApp.getState()).toBe(AppState.STOPPED);
      expect(mockLiveTrader.stop).toHaveBeenCalled();
    });

    it('should handle stop when not running', async () => {
      const stoppedApp = new GridBotApp();
      
      await expect(stoppedApp.stop()).resolves.not.toThrow();
    });

    it('should handle multiple stop calls', async () => {
      await app.stop();
      await expect(app.stop()).resolves.not.toThrow();
    });

    it('should emit stopped event on success', async () => {
      const stoppedSpy = jest.fn();
      app.on('stopped', stoppedSpy);

      await app.stop();

      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should handle trader stop errors', async () => {
      mockPaperTrader.stop.mockRejectedValue(new Error('Stop failed'));
      
      await expect(app.stop()).rejects.toThrow();
      expect(app.getState()).toBe(AppState.ERROR);
    });
  });

  describe('getHealthStatus()', () => {
    it('should return health status before initialization', () => {
      const status = app.getHealthStatus();
      
      expect(status.state).toBe(AppState.INITIALIZING);
      expect(status.config).toBeNull();
      expect(status.services.binance).toBe(false);
    });

    it('should return health status after initialization', async () => {
      await app.initialize();
      
      const status = app.getHealthStatus();
      
      expect(status.state).toBe(AppState.READY);
      expect(status.config).toEqual({
        tradeMode: mockConfig.tradeMode,
        exchange: mockConfig.exchange,
        symbolsCount: mockConfig.symbols.length
      });
      expect(status.services.binance).toBe(true);
      expect(status.services.strategy).toBe(true);
      expect(status.services.notifications).toBe(true);
      expect(status.services.reports).toBe(true);
    });

    it('should include active trader information', async () => {
      await app.initialize();
      await app.start();
      
      const status = app.getHealthStatus();
      
      expect(status.activeTrader).toBe('PaperTrader');
    });
  });

  describe('Event Handling', () => {
    it('should emit state change events', async () => {
      const stateChangeSpy = jest.fn();
      app.on('stateChanged', stateChangeSpy);

      await app.initialize();

      expect(stateChangeSpy).toHaveBeenCalledWith({
        from: AppState.INITIALIZING,
        to: AppState.READY
      });
    });

    it.skip('should handle process signals', () => {
      // This test is skipped because we disable signal handlers in test environment
      // to prevent interference with Jest test runner
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
    });
  });

  describe('Configuration Override', () => {
    it('should use custom config path', async () => {
      const customApp = new GridBotApp({ configPath: './custom-config' });
      
      await customApp.initialize();

      expect(ConfigLoader).toHaveBeenCalledWith('./custom-config');
    });

    it('should override trade mode from options', async () => {
      const overrideApp = new GridBotApp({ mode: 'backtest' });
      await overrideApp.initialize();
      
      await overrideApp.start();

      expect(mockBacktester.runBacktest).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    it.skip('should handle uncaught exceptions', async () => {
      // This test is skipped because uncaught exception handlers are disabled in test environment
      const errorSpy = jest.fn();
      app.on('error', errorSpy);

      // Simulate uncaught exception
      process.emit('uncaughtException', new Error('Test uncaught exception') as any);

      // Give time for async handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Critical error'),
        'error'
      );
    });

    it.skip('should handle unhandled promise rejections', async () => {
      // This test is skipped because unhandled rejection handlers are disabled in test environment
      const errorSpy = jest.fn();
      app.on('error', errorSpy);

      // Simulate unhandled rejection
      process.emit('unhandledRejection', new Error('Test rejection'), Promise.resolve() as any);

      // Give time for async handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled promise rejection'),
        'error'
      );
    });
  });

  describe('Backtest Configuration', () => {
    beforeEach(async () => {
      await app.initialize();
    });

    it('should create proper backtest config with custom dates', async () => {
      const backtestApp = new GridBotApp({
        mode: 'backtest',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });
      
      await backtestApp.initialize();
      await backtestApp.start();

      expect(mockBacktester.runBacktest).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: new Date('2024-01-01').getTime(),
          endTime: new Date('2024-01-31').getTime(),
          symbols: ['BTCUSDT'],
          interval: '1m',
          initialBalance: 1000,
          slippagePercentage: 0.001,
          enableDetailedLogging: true,
          saveHistoricalData: true,
          maxConcurrentSymbols: 5
        })
      );
    });

    it('should use default date range when none provided', async () => {
      const backtestApp = new GridBotApp({ mode: 'backtest' });
      await backtestApp.initialize();
      await backtestApp.start();

      expect(mockBacktester.runBacktest).toHaveBeenCalledWith(
        expect.objectContaining({
          symbols: ['BTCUSDT'],
          interval: '1m',
          initialBalance: 1000
        })
      );
    });
  });

  describe('Dry Run Mode', () => {
    it('should log dry run warning for live trading', async () => {
      const dryRunApp = new GridBotApp({ mode: 'live', dryRun: true });
      await dryRunApp.initialize();
      
      await dryRunApp.start();

      // Should still start live trader but with dry run logging
      expect(mockLiveTrader.start).toHaveBeenCalled();
    });
  });
});
