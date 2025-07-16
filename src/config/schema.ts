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
  gridLevelsCount: z.number().int().min(5).max(50).optional().default(20),
  gridIntervalMethod: z.enum(['ATR', 'DailyBarDiff']).optional().default('DailyBarDiff'),
  atrPeriod: z.number().int().min(5).max(50).optional().default(14),
  emaPeriod: z.number().int().positive('EMA period must be a positive integer').optional().default(200),
  emaDeviationThreshold: z.number().min(0.001).max(0.5).optional().default(0.01),
  minVolatilityPercentage: z.number().min(0.001).max(0.1).optional().default(0.003),
  minVolatileBarRatio: z.number().min(0.1).max(1).optional().default(0.51), // %51 kriteri - config'den değiştirilebilir
  barCountForVolatility: z.number().int().min(10).max(1000).optional().default(500),
  profitTargetMultiplier: z.number().min(1).max(10).optional().default(2),
  dcaMultipliers: z
    .object({
      standard: z.number().optional().default(1),
      moderate: z.number().optional().default(3),
      aggressive: z.number().optional().default(4),
    })
    .optional()
    .default({}),
  gridRecalculationIntervalHours: z.number().min(1).max(168).optional().default(48),
  baseGridSizeUSDT: z.number().min(100).max(10000).optional().default(1000),
  commissionRate: z.number().min(0).max(0.01).optional().default(0.001),
  timeframe: z.string().optional().default('1m'), // Add timeframe to strategy settings
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
        gridLevelsCount: 20,
        gridIntervalMethod: 'DailyBarDiff' as const,
        atrPeriod: 14,
        emaPeriod: 200,
        emaDeviationThreshold: 0.01,
        minVolatilityPercentage: 0.003,
        minVolatileBarRatio: 0.51,
        barCountForVolatility: 500,
        profitTargetMultiplier: 2,
        dcaMultipliers: {
          standard: 1,
          moderate: 3,
          aggressive: 4,
        },
        gridRecalculationIntervalHours: 48,
        baseGridSizeUSDT: 1000,
        commissionRate: 0.001,
        timeframe: '1m',
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
