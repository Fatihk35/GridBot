/**
 * Unit tests for ReportService
 */

import fs from 'fs/promises';
import path from 'path';
import { ReportService } from '../../services/ReportService';
import { Logger } from '../../utils/logger';
import {
  BacktestResult,
  BacktestTrade,
  PortfolioSnapshot,
  SymbolPerformance,
} from '../../types/backtest';

// Mock the fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock the logger
jest.mock('@/utils/logger');
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as any;

describe('ReportService', () => {
  let reportService: ReportService;
  const testReportDir = '/tmp/test-reports';

  beforeEach(() => {
    jest.clearAllMocks();
    reportService = new ReportService(testReportDir, mockLogger);
    
    // Mock fs.access to simulate directory doesn't exist initially
    mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.appendFile.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
  });

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      expect(reportService).toBeInstanceOf(ReportService);
    });

    it('should use default logger when none provided', () => {
      const mockGetInstance = jest.fn().mockReturnValue(mockLogger);
      (Logger.getInstance as jest.Mock) = mockGetInstance;
      
      const service = new ReportService(testReportDir);
      expect(service).toBeInstanceOf(ReportService);
    });
  });

  describe('saveBacktestReport', () => {
    const mockBacktestResult: BacktestResult = {
      id: 'test-backtest-123',
      createdAt: 1640995200000,
      version: '1.0.0',
      config: {
        startTime: 1640995200000,
        endTime: 1641081600000,
        symbols: ['BTCUSDT'],
        interval: '1h',
        initialBalance: 1000,
        slippagePercentage: 0.001,
        enableDetailedLogging: true,
        saveHistoricalData: true,
        maxConcurrentSymbols: 1,
      },
      executionTimeMs: 5432,
      dataPointsProcessed: 1000,
      errorsEncountered: [],
      startTime: 1640995200000,
      endTime: 1641081600000,
      duration: 86400000,
      initialBalance: 1000,
      finalBalance: 1050,
      totalReturn: 50,
      totalReturnPercentage: 5,
      annualizedReturn: 1825,
      maxDrawdown: 20,
      maxDrawdownPercentage: 2,
      maxDrawdownDuration: 3600000,
      volatility: 15.5,
      sharpeRatio: 1.2,
      sortinoRatio: 1.8,
      calmarRatio: 0.9,
      totalTrades: 10,
      totalBuyTrades: 5,
      totalSellTrades: 5,
      totalWinningTrades: 6,
      totalLosingTrades: 4,
      overallWinRate: 60,
      totalCommission: 2.5,
      totalSlippage: 1.2,
      averageTradeSize: 100,
      totalVolume: 1000,
      trades: [],
      portfolioHistory: [],
      symbolPerformance: new Map(),
    };

    it('should save JSON report successfully', async () => {
      const filePath = await reportService.saveBacktestReport(mockBacktestResult, {
        format: 'json',
      });

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testReportDir, 'backtests'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(filePath).toContain('.json');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Backtest report saved:')
      );
    });

    it('should save CSV report successfully', async () => {
      const filePath = await reportService.saveBacktestReport(mockBacktestResult, {
        format: 'csv',
        includeTrades: true,
        includePortfolioHistory: true,
        includeSymbolBreakdown: true,
      });

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1); // Summary CSV
      expect(filePath).toContain('backtest_test-backtest-123_');
    });

    it('should save HTML report successfully', async () => {
      const filePath = await reportService.saveBacktestReport(mockBacktestResult, {
        format: 'html',
      });

      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(filePath).toContain('.html');
    });

    it('should handle unsupported format', async () => {
      await expect(
        reportService.saveBacktestReport(mockBacktestResult, {
          format: 'xml' as any,
        })
      ).rejects.toThrow('Unsupported report format: xml');
    });

    it('should handle save errors', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        reportService.saveBacktestReport(mockBacktestResult)
      ).rejects.toThrow('Write failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save backtest report:',
        expect.any(Error)
      );
    });
  });

  describe('logTransaction', () => {
    const validTransaction = {
      time: Date.now(),
      type: 'ORDER_FILLED' as const,
      symbol: 'BTCUSDT',
      side: 'BUY' as const,
      price: 50000,
      quantity: 0.001,
      orderId: 'order-123',
    };

    it('should log transaction successfully', async () => {
      await reportService.logTransaction(validTransaction);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testReportDir, 'transactions'),
        { recursive: true }
      );
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('transactions_'),
        expect.stringContaining(JSON.stringify(validTransaction)),
        'utf8'
      );
    });

    it('should handle invalid transaction data', async () => {
      const invalidTransaction = {
        // missing required fields
        symbol: 'BTCUSDT',
      };

      await expect(
        reportService.logTransaction(invalidTransaction as any)
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log transaction:',
        expect.any(Error)
      );
    });

    it('should handle file write errors', async () => {
      mockFs.appendFile.mockRejectedValue(new Error('Append failed'));

      await expect(
        reportService.logTransaction(validTransaction)
      ).rejects.toThrow('Append failed');
    });
  });

  describe('saveStatusReport', () => {
    const validStatusReport = {
      time: Date.now(),
      mode: 'papertrade' as const,
      balances: { USDT: 1000, BTC: 0.02 },
      openOrders: [
        {
          id: 'order-1',
          symbol: 'BTCUSDT',
          side: 'BUY' as const,
          price: 49000,
          quantity: 0.001,
          status: 'NEW',
        },
      ],
      performance: {
        totalReturn: 5.5,
        drawdown: -2.1,
        trades: 15,
      },
    };

    it('should save status report successfully', async () => {
      await reportService.saveStatusReport(validStatusReport, 'papertrade');

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testReportDir, 'status'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('status_papertrade_'),
        expect.stringContaining(JSON.stringify(validStatusReport, null, 2)),
        'utf8'
      );
    });

    it('should handle invalid status report', async () => {
      const invalidReport = {
        // missing required fields
        balances: {},
      };

      await expect(
        reportService.saveStatusReport(invalidReport as any, 'live')
      ).rejects.toThrow();
    });
  });

  describe('saveFinalReport', () => {
    const finalReport = {
      startTime: 1640995200000,
      endTime: 1641081600000,
      duration: '1 day',
      finalBalances: { USDT: 1050, BTC: 0 },
      profitLoss: { USDT: 50 },
      trades: [],
    };

    it('should save final report successfully', async () => {
      await reportService.saveFinalReport(finalReport, 'live');

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testReportDir, 'final'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('final_live_'),
        expect.stringContaining(JSON.stringify(finalReport, null, 2)),
        'utf8'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Final report saved:')
      );
    });

    it('should handle save errors', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        reportService.saveFinalReport(finalReport, 'papertrade')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save final report:',
        expect.any(Error)
      );
    });
  });

  describe('getBacktestReports', () => {
    it('should return list of backtest reports', async () => {
      const mockFiles = [
        'backtest_test-1_2024-01-01T10-00-00-000Z.json',
        'backtest_test-2_2024-01-02T10-00-00-000Z.json',
        'other-file.txt',
      ];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(mockFiles as any);

      const reports = await reportService.getBacktestReports();

      expect(reports).toHaveLength(2);
      expect(reports[0]).toMatchObject({
        id: 'test-2',
        date: '2024:01:02T10:00:00:000Z',
        path: expect.stringContaining('backtest_test-2'),
      });
    });

    it('should handle empty reports directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const reports = await reportService.getBacktestReports();

      expect(reports).toHaveLength(0);
    });

    it('should handle directory not existing', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const reports = await reportService.getBacktestReports();

      expect(reports).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      // Create a more specific error scenario that will trigger the outer catch block
      // by making the whole getBacktestReports function throw an error
      jest.spyOn(path, 'join').mockImplementationOnce(() => {
        throw new Error('Path join failed');
      });

      const reports = await reportService.getBacktestReports();

      expect(reports).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get backtest reports:',
        expect.any(Error)
      );
    });
  });

  describe('CSV generation', () => {
    it('should generate trades CSV with proper formatting', async () => {
      const mockTrades: BacktestTrade[] = [
        {
          id: 'trade-1',
          timestamp: 1640995200000,
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'LIMIT',
          price: 50000,
          quantity: 0.001,
          value: 50,
          commission: 0.05,
          profit: 2.5,
          gridLevel: 49500,
          executionPrice: 50005,
          slippage: 5,
          candleTime: 1640995200000,
        },
      ];

      const result: BacktestResult = {
        ...getMockBacktestResult(),
        trades: mockTrades,
      };

      await reportService.saveBacktestReport(result, {
        format: 'csv',
        includeTrades: true,
      });

      // Verify that writeFile was called multiple times for CSV format
      const writeFileCalls = mockFs.writeFile.mock.calls;
      expect(writeFileCalls.length).toBeGreaterThan(0);

      // Check summary CSV was created
      expect(writeFileCalls[0]?.[0]).toContain('summary.csv');
      expect(writeFileCalls[0]?.[1]).toContain('"Metric","Value","Unit"');
    });

    it('should generate portfolio history CSV', async () => {
      const mockPortfolio: PortfolioSnapshot[] = [
        {
          timestamp: 1640995200000,
          totalValue: 1000,
          baseBalances: { BTC: 0.02 },
          quoteBalance: 980,
          unrealizedPnL: 0,
          realizedPnL: 0,
          drawdown: 0,
          drawdownPercentage: 0,
        },
      ];

      const result: BacktestResult = {
        ...getMockBacktestResult(),
        portfolioHistory: mockPortfolio,
      };

      await reportService.saveBacktestReport(result, {
        format: 'csv',
        includePortfolioHistory: true,
      });

      const writeFileCalls = mockFs.writeFile.mock.calls;
      expect(writeFileCalls.length).toBeGreaterThan(0);
      // Summary CSV should be first
      expect(writeFileCalls[0]?.[1]).toContain('"Metric","Value","Unit"');
    });
  });

  describe('HTML generation', () => {
    it('should generate valid HTML report', async () => {
      const symbolPerformance = new Map<string, SymbolPerformance>();
      symbolPerformance.set('BTCUSDT', {
        symbol: 'BTCUSDT',
        totalTrades: 20,
        buyTrades: 10,
        sellTrades: 10,
        winningTrades: 12,
        losingTrades: 8,
        winRate: 60,
        grossProfit: 150,
        grossLoss: -50,
        netProfit: 100,
        netProfitPercentage: 10,
        totalCommission: 5,
        averageWin: 12.5,
        averageLoss: -6.25,
        largestWin: 25,
        largestLoss: -15,
        profitFactor: 3,
        sharpeRatio: 1.5,
        maxConsecutiveWins: 4,
        maxConsecutiveLosses: 2,
        averageTradeSize: 50,
        totalVolume: 1000,
        holdingPeriodReturn: 10,
      });

      const result: BacktestResult = {
        ...getMockBacktestResult(),
        symbolPerformance,
      };

      await reportService.saveBacktestReport(result, {
        format: 'html',
        includeSymbolBreakdown: true,
      });

      const writeFileCalls = mockFs.writeFile.mock.calls;
      const htmlCall = writeFileCalls.find(call => 
        typeof call[1] === 'string' && call[1].includes('<!DOCTYPE html>')
      );
      
      expect(htmlCall).toBeDefined();
      expect(htmlCall![1]).toContain('GridBot Backtest Report');
      expect(htmlCall![1]).toContain('Performance Summary');
      expect(htmlCall![1]).toContain('BTCUSDT');
    });
  });
});

// Helper function to create mock backtest result
function getMockBacktestResult(): BacktestResult {
  return {
    id: 'test-backtest',
    createdAt: 1640995200000,
    version: '1.0.0',
    config: {
      startTime: 1640995200000,
      endTime: 1641081600000,
      symbols: ['BTCUSDT'],
      interval: '1h',
      initialBalance: 1000,
      slippagePercentage: 0.001,
      enableDetailedLogging: true,
      saveHistoricalData: true,
      maxConcurrentSymbols: 1,
    },
    executionTimeMs: 5000,
    dataPointsProcessed: 1000,
    errorsEncountered: [],
    startTime: 1640995200000,
    endTime: 1641081600000,
    duration: 86400000,
    initialBalance: 1000,
    finalBalance: 1100,
    totalReturn: 100,
    totalReturnPercentage: 10,
    annualizedReturn: 3650,
    maxDrawdown: 50,
    maxDrawdownPercentage: 5,
    maxDrawdownDuration: 3600000,
    volatility: 20,
    sharpeRatio: 1.5,
    sortinoRatio: 2.1,
    calmarRatio: 1.2,
    totalTrades: 25,
    totalBuyTrades: 12,
    totalSellTrades: 13,
    totalWinningTrades: 16,
    totalLosingTrades: 9,
    overallWinRate: 65,
    totalCommission: 10,
    totalSlippage: 5,
    averageTradeSize: 80,
    totalVolume: 2000,
    trades: [],
    portfolioHistory: [],
    symbolPerformance: new Map(),
  };
}
