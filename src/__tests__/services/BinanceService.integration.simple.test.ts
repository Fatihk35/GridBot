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
        barCountForVolatility: 24,
        minVolatilityPercentage: 0.01,
        minVolatileBarRatio: 0.3,
        emaPeriod: 200,
        emaDeviationThreshold: 0.1
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
