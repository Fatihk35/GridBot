import { z } from 'zod';
import { BotConfig } from '../types';

/**
 * Zod schema for budget configuration validation
 */
const BudgetConfigSchema = z.object({
  amount: z.number().positive('Budget amount must be positive'),
  currency: z.string().min(1, 'Currency must not be empty'),
});

/**
 * Zod schema for symbol configuration validation
 */
const SymbolConfigSchema = z.object({
  pair: z.string().min(1, 'Symbol pair must not be empty'),
  minDailyBarDiffThreshold: z
    .number()
    .positive('Minimum daily bar diff threshold must be positive'),
  gridSize: z.number().positive('Grid size must be positive').optional().default(100),
  pricePrecision: z.number().int().min(1).max(8).optional().default(8),
  quantityPrecision: z.number().int().min(1).max(8).optional().default(8),
});

/**
 * Zod schema for API keys configuration validation
 */
const ApiKeysConfigSchema = z.object({
  binanceApiKey: z.string().min(1, 'Binance API key must not be empty'),
  binanceSecretKey: z.string().min(1, 'Binance secret key must not be empty'),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
});

/**
 * Zod schema for strategy settings configuration validation
 */
const StrategySettingsConfigSchema = z.object({
  barCountForVolatility: z
    .number()
    .int()
    .positive('Bar count for volatility must be a positive integer'),
  minVolatilityPercentage: z.number().positive('Minimum volatility percentage must be positive'),
  minVolatileBarRatio: z.number().positive('Minimum volatile bar ratio must be positive'),
  emaPeriod: z.number().int().positive('EMA period must be a positive integer'),
  emaDeviationThreshold: z.number().positive('EMA deviation threshold must be positive'),
});

/**
 * Zod schema for Binance settings configuration validation
 */
const BinanceSettingsConfigSchema = z.object({
  testnet: z.boolean(),
  commissionRate: z.number().positive('Commission rate must be positive'),
});

/**
 * Zod schema for logging configuration validation
 */
const LoggingConfigSchema = z.object({
  enableConsoleOutput: z.boolean(),
  enableTelegramOutput: z.boolean(),
  reportDirectory: z.string().min(1, 'Report directory must not be empty'),
  transactionLogFileName: z.string().min(1, 'Transaction log file name must not be empty'),
});

/**
 * Main bot configuration schema
 */
export const BotConfigSchema = z.object({
  tradeMode: z.enum(['backtest', 'papertrade', 'live'], {
    errorMap: () => ({ message: 'Trade mode must be one of: backtest, papertrade, live' }),
  }),
  exchange: z.literal('binance', {
    errorMap: () => ({ message: 'Currently only Binance exchange is supported' }),
  }),
  maxBudget: BudgetConfigSchema,
  symbols: z.array(SymbolConfigSchema).min(1, 'At least one symbol must be configured'),
  apiKeys: ApiKeysConfigSchema,
  strategySettings: StrategySettingsConfigSchema,
  binanceSettings: BinanceSettingsConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * Infer TypeScript type from Zod schema
 */
export type BotConfigType = z.infer<typeof BotConfigSchema>;

/**
 * Validation helper functions
 */
export class ConfigValidator {
  /**
   * Validate configuration object
   * @param config - Configuration object to validate
   * @returns Validated configuration
   * @throws ZodError if validation fails
   */
  public static validateConfig(config: unknown): BotConfigType {
    return BotConfigSchema.parse(config);
  }

  /**
   * Safe validation with detailed error messages
   * @param config - Configuration object to validate
   * @returns Validation result with success flag and data/errors
   */
  public static safeValidateConfig(config: unknown): {
    success: boolean;
    data?: BotConfigType;
    errors?: Array<{
      path: string;
      message: string;
    }>;
  } {
    const result = BotConfigSchema.safeParse(config);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      errors: result.error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
      })),
    };
  }

  /**
   * Validate individual sections of configuration
   * @param config - Configuration object
   * @returns Object with validation results for each section
   */
  public static validateSections(config: unknown): {
    budget: boolean;
    symbols: boolean;
    apiKeys: boolean;
    strategySettings: boolean;
    binanceSettings: boolean;
    logging: boolean;
  } {
    if (typeof config !== 'object' || config === null) {
      return {
        budget: false,
        symbols: false,
        apiKeys: false,
        strategySettings: false,
        binanceSettings: false,
        logging: false,
      };
    }

    const configObj = config as Record<string, unknown>;

    return {
      budget: BudgetConfigSchema.safeParse(configObj.maxBudget).success,
      symbols: z.array(SymbolConfigSchema).safeParse(configObj.symbols).success,
      apiKeys: ApiKeysConfigSchema.safeParse(configObj.apiKeys).success,
      strategySettings: StrategySettingsConfigSchema.safeParse(configObj.strategySettings).success,
      binanceSettings: BinanceSettingsConfigSchema.safeParse(configObj.binanceSettings).success,
      logging: LoggingConfigSchema.safeParse(configObj.logging).success,
    };
  }

  /**
   * Get default configuration template
   * @returns Default configuration object
   */
  public static getDefaultConfig(): Partial<BotConfigType> {
    return {
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
          gridSize: 100,
          pricePrecision: 2,
          quantityPrecision: 6,
        },
      ],
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
  }
}
