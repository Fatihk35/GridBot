/**
 * Unit tests for CLI interface
 * 
 * Tests the command-line interface functionality including:
 * - Command parsing and validation
 * - Option handling
 * - Err      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: './config',
        mode: undefined      expect(GridBotApp)      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: './config',
        mode: 'backtest',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        verbose: false,
      });BeenCalledWith({
        configPath: './config',
        mode: 'backtest',
        startDate: undefined,
        endDate: undefined,
        verbose: false,
      });   verbose: undefined,
        dryRun: false,
      });dling and user feedback
 * - Integration with GridBotApp
 */

import { runCLI } from '../cli';
import { GridBotApp, AppState } from '../GridBotApp';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../GridBotApp');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));
jest.mock('fs/promises');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Mock process methods
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

describe('CLI Interface', () => {
  let mockApp: jest.Mocked<GridBotApp>;
  let originalArgv: string[];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock GridBotApp
    mockApp = {
      initialize: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn().mockReturnValue(AppState.READY),
      getConfig: jest.fn().mockReturnValue(null),
      getHealthStatus: jest.fn().mockReturnValue({
        state: AppState.READY,
        uptime: 100,
        memoryUsage: { heapUsed: 50 * 1024 * 1024 },
        config: {
          tradeMode: 'papertrade',
          exchange: 'binance',
          symbolsCount: 1
        },
        services: {
          binance: true,
          strategy: true,
          notifications: true,
          reports: true
        },
        activeTrader: 'PaperTrader'
      }),
      on: jest.fn().mockReturnThis(),
      removeAllListeners: jest.fn().mockReturnThis()
    } as any;

    (GridBotApp as jest.MockedClass<typeof GridBotApp>).mockImplementation(() => mockApp);

    // Mock fs.readFile for package.json
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: '1.0.0' }));

    // Store original argv
    originalArgv = process.argv;
  });

  afterEach(() => {
    // Restore original argv
    process.argv = originalArgv;
    
    // Clear console mocks
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('Help Command', () => {
    it('should display help when no arguments provided', async () => {
      process.argv = ['node', 'cli.js'];

      try {
        await runCLI();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GridBot - Advanced Grid Trading Bot'));
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should display help with help command', async () => {
      process.argv = ['node', 'cli.js', 'help'];

      try {
        await runCLI();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('USAGE:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('COMMANDS:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('EXAMPLES:'));
    });

    it('should show error for unknown commands', async () => {
      process.argv = ['node', 'cli.js', 'unknown-command'];

      try {
        await runCLI();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Start Command', () => {
    it('should start with default options', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      // Mock event callbacks
      let onInitialized: Function | undefined;
      let onStarted: Function | undefined;
      
      mockApp.on.mockImplementation((event: string | symbol, callback: (...args: any[]) => void) => {
        if (event === 'initialized') onInitialized = callback;
        if (event === 'started') onStarted = callback;
        return mockApp;
      });

      // Simulate successful start
      mockApp.getState.mockReturnValue(AppState.RUNNING);

      const runPromise = runCLI();
      
      // Simulate events
      if (onInitialized) onInitialized();
      if (onStarted) onStarted();

      await runPromise;

      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: "./config",
        mode: undefined,
        verbose: undefined,
        dryRun: false
      });
      expect(mockApp.initialize).toHaveBeenCalled();
      expect(mockApp.start).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Starting GridBot...\n');
    });

    it('should start with custom options', async () => {
      process.argv = [
        'node', 'cli.js', 'start',
        '--config', './custom-config',
        '--mode', 'live',
        '--verbose',
        '--dry-run'
      ];

      const runPromise = runCLI();
      await runPromise;

      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: './custom-config',
        mode: 'live',
        verbose: true,
        dryRun: true
      });
    });

    it('should handle initialization errors', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      const error = new Error('Configuration error');
      mockApp.initialize.mockRejectedValue(error);

      try {
        await runCLI();
      } catch (err) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Configuration Error'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle API errors', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      const error = new Error('API connection failed');
      mockApp.start.mockRejectedValue(error);

      try {
        await runCLI();
      } catch (err) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should display event messages', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      let onInitialized: Function | undefined;
      let onStarted: Function | undefined;
      let onError: Function | undefined;
      
      mockApp.on.mockImplementation((event: string | symbol, callback: (...args: any[]) => void) => {
        if (event === 'initialized') onInitialized = callback;
        if (event === 'started') onStarted = callback;
        if (event === 'error') onError = callback;
        return mockApp;
      });

      const runPromise = runCLI();
      
      // Wait a bit for event handlers to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate events
      if (onInitialized) onInitialized();
      if (onStarted) onStarted();
      if (onError) onError(new Error('Test error'));

      await runPromise;

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚀 Starting GridBot'));
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ GridBot initialized successfully');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ GridBot started successfully');
      expect(mockConsoleError).toHaveBeenCalledWith('❌ GridBot error:', 'Test error');
    });
  });

  describe('Backtest Command', () => {
    it('should run backtest with default options', async () => {
      process.argv = ['node', 'cli.js', 'backtest'];

      await runCLI();

      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: "./config",
        mode: 'backtest',
        startDate: undefined,
        endDate: undefined,
        verbose: false
      });
      expect(mockConsoleLog).toHaveBeenCalledWith('📊 Running Backtest...\n');
    });

    it('should run backtest with custom date range', async () => {
      process.argv = [
        'node', 'cli.js', 'backtest',
        '--start-date', '2024-01-01',
        '--end-date', '2024-01-31'
      ];

      await runCLI();

      expect(GridBotApp).toHaveBeenCalledWith({
        configPath: "./config",
        mode: 'backtest',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        verbose: false
      });
    });

    it('should handle backtest completion', async () => {
      process.argv = ['node', 'cli.js', 'backtest'];

      let onStopped: Function | undefined;
      
      mockApp.on.mockImplementation((event: string | symbol, callback: (...args: any[]) => void) => {
        if (event === 'stopped') onStopped = callback;
        return mockApp;
      });

      const runPromise = runCLI();
      
      // Wait a bit for event handlers to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate backtest completion
      if (onStopped) onStopped();

      await runPromise;

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📊 Running Backtest'));
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Backtest completed');
      expect(mockConsoleLog).toHaveBeenCalledWith('📊 Check the reports directory for detailed results');
    });
  });

  describe('Status Command', () => {
    it('should display application status', async () => {
      process.argv = ['node', 'cli.js', 'status'];

      await runCLI();

      expect(mockApp.initialize).toHaveBeenCalled();
      expect(mockApp.getHealthStatus).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('📊 GridBot Status:\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('State: READY');
      expect(mockConsoleLog).toHaveBeenCalledWith('Uptime: 100 seconds');
      expect(mockConsoleLog).toHaveBeenCalledWith('Memory Usage: 50 MB');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📝 Configuration:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Trade Mode: papertrade');
      expect(mockConsoleLog).toHaveBeenCalledWith('Exchange: binance');
      expect(mockConsoleLog).toHaveBeenCalledWith('Symbols: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔧 Services:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Binance: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Strategy: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Notifications: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Reports: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🏃 Active Trader: PaperTrader');
    });

    it('should display service status indicators', async () => {
      process.argv = ['node', 'cli.js', 'status'];

      await runCLI();

      expect(mockConsoleLog).toHaveBeenCalledWith('Binance: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Strategy: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Notifications: ✅');
      expect(mockConsoleLog).toHaveBeenCalledWith('Reports: ✅');
    });

    it('should handle status when config is null', async () => {
      process.argv = ['node', 'cli.js', 'status'];

      mockApp.getHealthStatus.mockReturnValue({
        state: AppState.INITIALIZING,
        uptime: 10,
        memoryUsage: { 
          rss: 50 * 1024 * 1024,
          heapTotal: 30 * 1024 * 1024,
          heapUsed: 25 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          arrayBuffers: 1 * 1024 * 1024
        },
        config: null,
        services: {
          binance: false,
          strategy: false,
          notifications: false,
          reports: false
        },
        activeTrader: null
      });

      await runCLI();

      expect(mockConsoleLog).toHaveBeenCalledWith('State: INITIALIZING');
      expect(mockConsoleLog).toHaveBeenCalledWith('Memory Usage: 25 MB');
      expect(mockConsoleLog).toHaveBeenCalledWith('Binance: ❌');
    });
  });

  describe('Version Command', () => {
    it('should display version from package.json', async () => {
      process.argv = ['node', 'cli.js', '--version'];

      try {
        await runCLI();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      // Commander handles version display automatically
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle missing package.json', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      process.argv = ['node', 'cli.js', '--version'];
      
      try {
        await runCLI();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }
      
      // Should have attempted to read package.json 
      expect(fs.readFile).toHaveBeenCalled();
    });
  });

  describe('Global Options', () => {
    it('should handle config option', async () => {
      process.argv = ['node', 'cli.js', '--config', './my-config.json', 'start'];

      await runCLI();

      expect(GridBotApp).toHaveBeenCalledWith(
        expect.objectContaining({
          configPath: './my-config.json'
        })
      );
    });

    it('should handle verbose option', async () => {
      process.argv = ['node', 'cli.js', '--verbose', 'start'];

      await runCLI();

      expect(GridBotApp).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle configuration errors with helpful message', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      const error = new Error('Configuration file not found');
      mockApp.initialize.mockRejectedValue(error);

      try {
        await runCLI();
      } catch (err) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Configuration Error'));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Copy config.example.json'));
    });

    it('should handle API errors with helpful message', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      const error = new Error('API connection timeout');
      mockApp.start.mockRejectedValue(error);

      try {
        await runCLI();
      } catch (err) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('API Error'));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('check your API credentials'));
    });

    it('should handle generic errors', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      const error = new Error('Unknown error');
      mockApp.initialize.mockRejectedValue(error);

      try {
        await runCLI();
      } catch (err) {
        // Expected to throw due to process.exit mock
      }

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Unknown error'));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('gridbot help'));
    });
  });

  describe('Banner and UI', () => {
    it('should display banner for start command', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      await runCLI();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GridBot'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Advanced Grid Trading Bot'));
    });

    it('should display banner for backtest command', async () => {
      process.argv = ['node', 'cli.js', 'backtest'];

      await runCLI();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GridBot'));
    });

    it('should display proper emojis and formatting', async () => {
      process.argv = ['node', 'cli.js', 'start'];

      let onInitialized: Function | undefined;
      
      mockApp.on.mockImplementation((event: string | symbol, callback: (...args: any[]) => void) => {
        if (event === 'initialized') onInitialized = callback;
        return mockApp;
      });

      const runPromise = runCLI();
      
      // Wait a bit for event handlers to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      if (onInitialized) onInitialized();

      await runPromise;

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚀 Starting GridBot'));
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ GridBot initialized successfully');
    });
  });
});
