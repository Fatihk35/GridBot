import { BinanceService } from '../../services/BinanceService';
import { BotConfigType } from '../../config/schema';

describe('BinanceService Integration Tests', () => {
  let testConfig: BotConfigType;

  beforeAll(() => {
    testConfig = {
      tradeMode: 'papertrade' as const,
      exchange: 'binance' as const,
      maxBudget: {
        amount: 100,
        currency: 'USDT'
      },
      apiKeys: {
        binanceApiKey: process.env.BINANCE_API_KEY || 'test-key',
        binanceSecretKey: process.env.BINANCE_SECRET_KEY || 'test-secret'
      },
      binanceSettings: {
        testnet: true,
        commissionRate: 0.001
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 100,
          gridSize: 1000,
          pricePrecision: 2,
          quantityPrecision: 6
        }
      ],
      strategySettings: {
        gridLevelsCount: 10,
        gridIntervalMethod: 'ATR' as const,
        atrPeriod: 14,
        profitTargetMultiplier: 1.5,
        dcaMultipliers: {
          standard: 1,
          moderate: 1.2,
          aggressive: 1.5
        },
        gridRecalculationIntervalHours: 24,
        baseGridSizeUSDT: 100,
        commissionRate: 0.001,
        barCountForVolatility: 24,
        minVolatilityPercentage: 0.01,
        minVolatileBarRatio: 0.3,
        emaPeriod: 200,
        emaDeviationThreshold: 0.1,
        timeframe: '1m'
      },
      logging: {
        enableConsoleOutput: false,
        enableTelegramOutput: false,
        reportDirectory: './reports',
        transactionLogFileName: 'transactions.log'
      }
    };
  });

  describe('Mock Mode Integration', () => {
    it('should handle initialization gracefully without API keys', () => {
      const mockService = new BinanceService({
        ...testConfig,
        apiKeys: {
          binanceApiKey: '',
          binanceSecretKey: ''
        }
      });

      expect(mockService).toBeDefined();
    });

    it('should validate configuration parameters', () => {
      expect(() => {
        new BinanceService({
          ...testConfig,
          maxBudget: {
            amount: -100,
            currency: 'USDT'
          }
        });
      }).toThrow('Budget amount must be positive');
    });
  });
});
