/**
 * Tests for ConfigLoader class
 */

import fs from 'fs';
import path from 'path';
import { ConfigLoader } from '@/config/ConfigLoader';
import { ConfigValidator } from '@/config/schema';
import { ConfigError, ValidateError } from '@/utils/errors';
import { BotConfig } from '@/types';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  let validConfig: BotConfig;

  beforeEach(() => {
    configLoader = ConfigLoader.getInstance();
    
    validConfig = {
      tradeMode: 'backtest',
      exchange: 'binance',
      maxBudget: {
        amount: 1000,
        currency: 'USDT',
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 0.01,
        },
      ],
      apiKeys: {
        binanceApiKey: 'test_api_key',
        binanceSecretKey: 'test_secret_key',
      },
      strategySettings: {
        barCountForVolatility: 30,
        minVolatilityPercentage: 0.02,
        minVolatileBarRatio: 0.6,
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
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ConfigLoader.getInstance();
      const instance2 = ConfigLoader.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadConfig', () => {
    it('should load valid configuration successfully', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFile.mockImplementation((filePath, encoding, callback) => {
        const cb = callback as (err: Error | null, data?: string) => void;
        cb(null, JSON.stringify(validConfig));
      });

      const result = await configLoader.loadConfig('./test-config.json');

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve('./test-config.json'));
    });

    it('should throw ConfigError when file does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      await expect(configLoader.loadConfig('./nonexistent.json')).rejects.toThrow(ConfigError);
    });

    it('should throw ConfigError when file read fails', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFile.mockImplementation((filePath, encoding, callback) => {
        const cb = callback as (err: Error | null, data?: string) => void;
        cb(new Error('File read error'));
      });

      await expect(configLoader.loadConfig('./test-config.json')).rejects.toThrow(ConfigError);
    });

    it('should throw ConfigError when JSON is invalid', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFile.mockImplementation((filePath, encoding, callback) => {
        const cb = callback as (err: Error | null, data?: string) => void;
        cb(null, 'invalid json');
      });

      await expect(configLoader.loadConfig('./test-config.json')).rejects.toThrow(ConfigError);
    });

    it('should apply environment variable overrides', async () => {
      // Set environment variables
      process.env.BINANCE_API_KEY = 'env_api_key';
      process.env.BINANCE_SECRET_KEY = 'env_secret_key';
      process.env.TRADE_MODE = 'live';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFile.mockImplementation((filePath, encoding, callback) => {
        const cb = callback as (err: Error | null, data?: string) => void;
        cb(null, JSON.stringify(validConfig));
      });

      const result = await configLoader.loadConfig('./test-config.json');

      expect(result.apiKeys.binanceApiKey).toBe('env_api_key');
      expect(result.apiKeys.binanceSecretKey).toBe('env_secret_key');
      expect(result.tradeMode).toBe('live');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const result = configLoader.validateConfig(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should throw ValidateError for invalid configuration', () => {
      const invalidConfig = { ...validConfig, tradeMode: 'invalid' };
      
      expect(() => configLoader.validateConfig(invalidConfig)).toThrow(ValidateError);
    });

    it('should throw ValidateError for missing required fields', () => {
      const invalidConfig = { ...validConfig };
      delete (invalidConfig as any).apiKeys;
      
      expect(() => configLoader.validateConfig(invalidConfig)).toThrow(ValidateError);
    });
  });

  describe('saveConfig', () => {
    it('should save valid configuration to file', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFile.mockImplementation((filePath, content, encoding, callback) => {
        const cb = callback as (err: Error | null) => void;
        cb(null);
      });

      await configLoader.saveConfig(validConfig, './test-config.json');

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        './test-config.json',
        JSON.stringify(validConfig, null, 2),
        'utf8',
        expect.any(Function)
      );
    });

    it('should create directory if it does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => undefined);
      mockedFs.writeFile.mockImplementation((filePath, content, encoding, callback) => {
        const cb = callback as (err: Error | null) => void;
        cb(null);
      });

      await configLoader.saveConfig(validConfig, './new-dir/test-config.json');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('./new-dir', { recursive: true });
    });

    it('should throw ConfigError when write fails', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.writeFile.mockImplementation((filePath, content, encoding, callback) => {
        const cb = callback as (err: Error | null) => void;
        cb(new Error('Write error'));
      });

      await expect(configLoader.saveConfig(validConfig, './test-config.json')).rejects.toThrow(ConfigError);
    });
  });

  describe('loadConfigWithDetails', () => {
    it('should return config with validation summary on success', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFile.mockImplementation((filePath, encoding, callback) => {
        const cb = callback as (err: Error | null, data?: string) => void;
        cb(null, JSON.stringify(validConfig));
      });

      const result = await configLoader.loadConfigWithDetails('./test-config.json');

      expect(result.config).toEqual(validConfig);
      expect(result.validationSummary.isValid).toBe(true);
      expect(result.validationSummary.sections).toBeDefined();
    });

    it('should throw ConfigError with validation details on failure', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      await expect(configLoader.loadConfigWithDetails('./nonexistent.json'))
        .rejects.toThrow(ConfigError);
    });
  });
});

describe('ConfigValidator', () => {
  let validConfig: BotConfig;

  beforeEach(() => {
    validConfig = {
      tradeMode: 'backtest',
      exchange: 'binance',
      maxBudget: {
        amount: 1000,
        currency: 'USDT',
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 0.01,
        },
      ],
      apiKeys: {
        binanceApiKey: 'test_api_key',
        binanceSecretKey: 'test_secret_key',
      },
      strategySettings: {
        barCountForVolatility: 30,
        minVolatilityPercentage: 0.02,
        minVolatileBarRatio: 0.6,
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
    };
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should throw for invalid trade mode', () => {
      const invalidConfig = { ...validConfig, tradeMode: 'invalid' };
      expect(() => ConfigValidator.validateConfig(invalidConfig)).toThrow();
    });

    it('should throw for negative amounts', () => {
      const invalidConfig = { 
        ...validConfig, 
        maxBudget: { ...validConfig.maxBudget, amount: -100 } 
      };
      expect(() => ConfigValidator.validateConfig(invalidConfig)).toThrow();
    });
  });

  describe('safeValidateConfig', () => {
    it('should return success for valid config', () => {
      const result = ConfigValidator.safeValidateConfig(validConfig);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validConfig);
    });

    it('should return errors for invalid config', () => {
      const invalidConfig = { ...validConfig, tradeMode: 'invalid' };
      const result = ConfigValidator.safeValidateConfig(invalidConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default configuration', () => {
      const defaultConfig = ConfigValidator.getDefaultConfig();
      
      expect(defaultConfig.tradeMode).toBe('backtest');
      expect(defaultConfig.exchange).toBe('binance');
      expect(defaultConfig.maxBudget).toBeDefined();
      expect(defaultConfig.symbols).toBeDefined();
      expect(defaultConfig.strategySettings).toBeDefined();
      expect(defaultConfig.binanceSettings).toBeDefined();
      expect(defaultConfig.logging).toBeDefined();
    });
  });
});
