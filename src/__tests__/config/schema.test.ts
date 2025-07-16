/**
 * Tests for configuration schema validation
 */

import { BotConfigSchema, ConfigValidator } from '../../config/schema';
import { BotConfig } from '../../types';

describe('BotConfigSchema', () => {
  let validConfig: any;

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

  describe('valid configurations', () => {
    it('should validate complete valid configuration', () => {
      expect(() => BotConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate with optional telegram fields', () => {
      validConfig.apiKeys.telegramBotToken = 'telegram_token';
      validConfig.apiKeys.telegramChatId = 'chat_id';
      
      expect(() => BotConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate different trade modes', () => {
      const tradeModes = ['backtest', 'papertrade', 'live'];
      
      tradeModes.forEach(mode => {
        validConfig.tradeMode = mode;
        expect(() => BotConfigSchema.parse(validConfig)).not.toThrow();
      });
    });

    it('should validate multiple symbols', () => {
      validConfig.symbols = [
        { pair: 'BTCUSDT', minDailyBarDiffThreshold: 0.01 },
        { pair: 'ETHUSDT', minDailyBarDiffThreshold: 0.015 },
        { pair: 'ADAUSDT', minDailyBarDiffThreshold: 0.02 },
      ];
      
      expect(() => BotConfigSchema.parse(validConfig)).not.toThrow();
    });
  });

  describe('invalid configurations', () => {
    it('should reject invalid trade mode', () => {
      validConfig.tradeMode = 'invalid_mode';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject unsupported exchange', () => {
      validConfig.exchange = 'unsupported_exchange';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject negative budget amount', () => {
      validConfig.maxBudget.amount = -100;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject zero budget amount', () => {
      validConfig.maxBudget.amount = 0;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject empty currency', () => {
      validConfig.maxBudget.currency = '';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject empty symbols array', () => {
      validConfig.symbols = [];
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject invalid symbol pair', () => {
      validConfig.symbols[0].pair = '';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject negative threshold', () => {
      validConfig.symbols[0].minDailyBarDiffThreshold = -0.01;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject empty API keys', () => {
      validConfig.apiKeys.binanceApiKey = '';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject missing required fields', () => {
      delete validConfig.apiKeys;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject negative strategy values', () => {
      validConfig.strategySettings.barCountForVolatility = -1;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
      
      validConfig.strategySettings.barCountForVolatility = 30;
      validConfig.strategySettings.minVolatilityPercentage = -0.01;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject non-integer periods', () => {
      validConfig.strategySettings.emaPeriod = 200.5;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject negative commission rate', () => {
      validConfig.binanceSettings.commissionRate = -0.001;
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
    });

    it('should reject empty logging paths', () => {
      validConfig.logging.reportDirectory = '';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
      
      validConfig.logging.reportDirectory = './reports';
      validConfig.logging.transactionLogFileName = '';
      expect(() => BotConfigSchema.parse(validConfig)).toThrow();
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

  describe('validateSections', () => {
    it('should validate all sections for valid config', () => {
      const result = ConfigValidator.validateSections(validConfig);
      
      expect(result.budget).toBe(true);
      expect(result.symbols).toBe(true);
      expect(result.apiKeys).toBe(true);
      expect(result.strategySettings).toBe(true);
      expect(result.binanceSettings).toBe(true);
      expect(result.logging).toBe(true);
    });

    it('should return false for all sections with null input', () => {
      const result = ConfigValidator.validateSections(null);
      
      expect(result.budget).toBe(false);
      expect(result.symbols).toBe(false);
      expect(result.apiKeys).toBe(false);
      expect(result.strategySettings).toBe(false);
      expect(result.binanceSettings).toBe(false);
      expect(result.logging).toBe(false);
    });

    it('should return false for invalid budget section', () => {
      const invalidConfig = { 
        ...validConfig, 
        maxBudget: { amount: -100, currency: 'USDT' } 
      };
      const result = ConfigValidator.validateSections(invalidConfig);
      
      expect(result.budget).toBe(false);
      expect(result.symbols).toBe(true); // Other sections should still be valid
    });

    it('should return false for invalid symbols section', () => {
      const invalidConfig = { 
        ...validConfig, 
        symbols: null // This should make validation fail
      };
      const result = ConfigValidator.validateSections(invalidConfig);
      
      expect(result.budget).toBe(true);
      expect(result.symbols).toBe(false);
    });
  });

  describe('safeValidateConfig edge cases', () => {
    it('should handle deeply nested validation errors', () => {
      const invalidConfig = {
        ...validConfig,
        strategySettings: {
          ...validConfig.strategySettings,
          barCountForVolatility: -5,
          minVolatilityPercentage: -0.1,
        },
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
    });

    it('should provide meaningful error paths', () => {
      const invalidConfig = {
        ...validConfig,
        maxBudget: {
          ...validConfig.maxBudget,
          amount: -100,
        },
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((err: any) => err.path.includes('maxBudget'))).toBe(true);
    });
  });

  describe('getDefaultConfig', () => {
    it('should produce a configuration that passes validation', () => {
      const defaultConfig = ConfigValidator.getDefaultConfig();
      
      // Add required API keys for validation
      const completeConfig = {
        ...defaultConfig,
        apiKeys: {
          binanceApiKey: 'test_key',
          binanceSecretKey: 'test_secret',
        },
      };

      expect(() => ConfigValidator.validateConfig(completeConfig)).not.toThrow();
    });

    it('should have sensible default values', () => {
      const defaultConfig = ConfigValidator.getDefaultConfig();
      
      expect(defaultConfig.tradeMode).toBe('backtest');
      expect(defaultConfig.exchange).toBe('binance');
      expect(defaultConfig.maxBudget?.amount).toBeGreaterThan(0);
      expect(defaultConfig.symbols).toHaveLength(1);
      expect(defaultConfig.binanceSettings?.testnet).toBe(true);
      expect(defaultConfig.logging?.enableConsoleOutput).toBe(true);
    });
  });
});
