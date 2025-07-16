import { BinanceService } from '../../services/BinanceService';
import { BotConfigType } from '../../config/schema';

// Mock at the module level
const mockSpotInstance = {
  account: jest.fn(),
  exchangeInfo: jest.fn(),
  klines: jest.fn(),
  ticker24hr: jest.fn(),
  newOrder: jest.fn(),
  cancelOrder: jest.fn(),
  getOrder: jest.fn()
};

jest.mock('@binance/connector', () => ({
  Spot: jest.fn(() => mockSpotInstance)
}));

jest.mock('ws');

describe('BinanceService Basic Tests', () => {
  let mockConfig: BotConfigType;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default successful responses
    mockSpotInstance.account.mockResolvedValue({
      accountType: 'SPOT',
      canTrade: true,
      balances: []
    });

    mockSpotInstance.exchangeInfo.mockResolvedValue({
      data: {
        timezone: 'UTC',
        serverTime: 1609459200000,
        symbols: [{
          symbol: 'BTCUSDT',
          status: 'TRADING',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          isSpotTradingAllowed: true,
          filters: [
            { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
            { filterType: 'LOT_SIZE', minQty: '0.00001', maxQty: '9000', stepSize: '0.00001' }
          ]
        }]
      }
    });

    mockConfig = {
      tradeMode: 'papertrade' as const,
      exchange: 'binance' as const,
      maxBudget: {
        amount: 1000,
        currency: 'USDT'
      },
      apiKeys: {
        binanceApiKey: 'test-api-key',
        binanceSecretKey: 'test-secret-key'
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
        enableConsoleOutput: false, // Disable console output for tests
        enableTelegramOutput: false,
        reportDirectory: './reports',
        transactionLogFileName: 'transactions.log'
      }
    };
  });

  describe('Basic Functionality', () => {
    it('should create BinanceService instance', () => {
      const binanceService = new BinanceService(mockConfig);
      expect(binanceService).toBeDefined();
      expect(binanceService).toBeInstanceOf(BinanceService);
    });

    it('should have required methods', () => {
      const binanceService = new BinanceService(mockConfig);
      
      expect(typeof binanceService.initialize).toBe('function');
      expect(typeof binanceService.destroy).toBe('function');
      expect(typeof binanceService.getRateLimitStatus).toBe('function');
      expect(typeof binanceService.getSymbolInfo).toBe('function');
    });

    it('should initialize without throwing', async () => {
      const binanceService = new BinanceService(mockConfig);
      await expect(binanceService.initialize()).resolves.not.toThrow();
    });

    it('should destroy without throwing', () => {
      const binanceService = new BinanceService(mockConfig);
      expect(() => binanceService.destroy()).not.toThrow();
    });
  });
});