import { LiveTrader } from '../../services/LiveTrader';
import { BinanceService } from '../../services/BinanceService';
import { StrategyEngine } from '../../services/StrategyEngine';
import { NotificationService } from '../../services/NotificationService';
import { ReportService } from '../../services/ReportService';
import { Logger } from '../../utils/logger';
import { InsufficientBalanceError } from '../../utils/errors';

jest.setTimeout(30000);

// Mock dependencies
jest.mock('../../services/BinanceService');
jest.mock('../../services/StrategyEngine');
jest.mock('../../services/NotificationService');
jest.mock('../../services/ReportService');
jest.mock('../../utils/logger');

describe('LiveTrader', () => {
  let liveTrader: LiveTrader;
  let mockBinanceService: any;
  let mockStrategyEngine: any;
  let mockNotificationService: any;
  let mockReportService: any;
  let mockLogger: any;

  const mockConfig = {
    symbols: [{ pair: 'BTC/USDT', minPrice: 45000, maxPrice: 55000, gridLevels: 10 }],
    binanceSettings: { apiKey: 'test-key', apiSecret: 'test-secret', testMode: true, commissionRate: 0.001 },
    maxBudget: { amount: 1000, currency: 'USDT' }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockBinanceService = {
      getAccountInfo: jest.fn(),
      getExchangeInfo: jest.fn(),
      createOrder: jest.fn(),
      queryOrder: jest.fn(),
      cancelAllOrders: jest.fn(),
      getOpenOrders: jest.fn(),
      getHistoricalKlines: jest.fn(),
      subscribeToKlineUpdates: jest.fn(),
      unsubscribeFromUpdates: jest.fn()
    };

    mockStrategyEngine = {
      initializeStrategy: jest.fn(),
      updateState: jest.fn(),
      getTradeSignals: jest.fn()
    };

    mockNotificationService = { sendNotification: jest.fn() };
    mockReportService = { logTransaction: jest.fn(), saveStatusReport: jest.fn(), saveFinalReport: jest.fn() };
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    (Logger.getInstance as jest.Mock) = jest.fn().mockReturnValue(mockLogger);

    liveTrader = new LiveTrader(
      mockConfig as any,
      mockBinanceService,
      mockStrategyEngine,
      mockNotificationService,
      mockReportService
    );

    jest.spyOn(liveTrader as any, 'confirmLiveTrading').mockResolvedValue(undefined);

    mockBinanceService.getAccountInfo.mockResolvedValue({
      canTrade: true,
      balances: [
        { asset: 'USDT', free: '1000', locked: '0' },
        { asset: 'BTC', free: '0.1', locked: '0' }
      ]
    });

    mockBinanceService.getExchangeInfo.mockResolvedValue({
      symbols: [{ symbol: 'BTCUSDT', status: 'TRADING' }]
    });

    mockBinanceService.getHistoricalKlines.mockResolvedValue([]);
    mockBinanceService.getOpenOrders.mockResolvedValue([]);
    mockStrategyEngine.getTradeSignals.mockReturnValue({ buy: [], sell: [] });
  });

  it('should initialize correctly', () => {
    expect(liveTrader).toBeInstanceOf(LiveTrader);
    const status = liveTrader.getStatus();
    expect(status.isRunning).toBe(false);
  });

  it('should start live trading successfully', async () => {
    await liveTrader.start();
    const status = liveTrader.getStatus();
    expect(status.isRunning).toBe(true);
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith('⚠️ LIVE trading started ⚠️');
  });

  it('should throw error if already running', async () => {
    await liveTrader.start();
    await expect(liveTrader.start()).rejects.toThrow('Live trading is already running');
  });

  it('should throw error if account cannot trade', async () => {
    mockBinanceService.getAccountInfo.mockResolvedValue({ canTrade: false, balances: [] });
    await expect(liveTrader.start()).rejects.toThrow('Account is not enabled for trading');
  });

  it('should throw error if insufficient balance', async () => {
    mockBinanceService.getAccountInfo.mockResolvedValue({
      canTrade: true,
      balances: [{ asset: 'USDT', free: '10', locked: '0' }]
    });
    await expect(liveTrader.start()).rejects.toThrow(InsufficientBalanceError);
  });

  it('should stop live trading successfully', async () => {
    await liveTrader.start();
    await liveTrader.stop();
    const status = liveTrader.getStatus();
    expect(status.isRunning).toBe(false);
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith('LIVE trading stopped');
  });

  it('should cancel all orders before stopping', async () => {
    await liveTrader.start();
    const mockOrder = { id: 'test_order_1', symbol: 'BTC/USDT', binanceOrderId: '12345' };
    (liveTrader as any).activeOrders.set('test_order_1', mockOrder);
    await liveTrader.stop();
    expect(mockBinanceService.cancelAllOrders).toHaveBeenCalledWith('BTCUSDT');
  });

  it('should execute buy orders successfully', async () => {
    const mockOrderResponse = { orderId: 12345, symbol: 'BTCUSDT', status: 'NEW' };
    mockBinanceService.createOrder.mockResolvedValue(mockOrderResponse);

    await liveTrader.start();
    const signal = { price: 50000, quantity: 0.001, type: 'BUY' as const, timestamp: Date.now() };
    await (liveTrader as any).executeBuyOrder('BTC/USDT', signal);

    expect(mockBinanceService.createOrder).toHaveBeenCalledWith({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.001,
      price: 50000,
      timeInForce: 'GTC'
    });
  });

  it('should handle order creation errors', async () => {
    mockBinanceService.createOrder.mockRejectedValue(new Error('Order failed'));
    await liveTrader.start();
    const signal = { price: 50000, quantity: 0.001, type: 'BUY' as const, timestamp: Date.now() };
    await (liveTrader as any).executeBuyOrder('BTC/USDT', signal);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error executing BUY order'),
      expect.any(Error)
    );
  });

  it('should skip orders when insufficient balance', async () => {
    await liveTrader.start();
    mockBinanceService.getAccountInfo.mockResolvedValue({
      canTrade: true,
      balances: [{ asset: 'USDT', free: '10', locked: '0' }, { asset: 'BTC', free: '0', locked: '0' }]
    });

    const signal = { price: 50000, quantity: 0.001, type: 'BUY' as const, timestamp: Date.now() };
    await (liveTrader as any).executeBuyOrder('BTC/USDT', signal);
    expect(mockBinanceService.createOrder).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Insufficient USDT balance'));
  });
});
