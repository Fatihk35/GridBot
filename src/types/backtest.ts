/**
 * Backtesting module types and interfaces
 */

import { z } from 'zod';

/**
 * Schema for backtesting configuration
 */
export const BacktestConfigSchema = z
  .object({
    startTime: z.number().int().positive(),
    endTime: z.number().int().positive(),
    symbols: z.array(z.string()).min(1),
    interval: z.enum([
      '1m',
      '3m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '6h',
      '8h',
      '12h',
      '1d',
      '3d',
      '1w',
      '1M',
    ]),
    initialBalance: z.number().positive(),
    slippagePercentage: z.number().min(0).max(1).default(0.001), // 0.1% default slippage
    enableDetailedLogging: z.boolean().default(true),
    saveHistoricalData: z.boolean().default(true),
    maxConcurrentSymbols: z.number().int().positive().default(5),
  })
  .refine(data => data.endTime > data.startTime, {
    message: 'End time must be after start time',
  });

export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

/**
 * Individual trade executed during backtest
 */
export interface BacktestTrade {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price: number;
  quantity: number;
  value: number;
  commission: number;
  profit?: number;
  gridLevel: number;
  executionPrice: number; // Actual execution price (with slippage)
  slippage: number;
  candleTime: number; // Time of the candle when trade was executed
}

/**
 * Portfolio snapshot at a specific point in time
 */
export interface PortfolioSnapshot {
  timestamp: number;
  totalValue: number;
  baseBalances: Record<string, number>; // e.g., { "BTC": 0.5, "ETH": 2.1 }
  quoteBalance: number; // USDT balance
  unrealizedPnL: number;
  realizedPnL: number;
  drawdown: number;
  drawdownPercentage: number;
}

/**
 * Performance metrics for a single symbol
 */
export interface SymbolPerformance {
  symbol: string;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  netProfitPercentage: number;
  totalCommission: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number; // Gross profit / Gross loss
  sharpeRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageTradeSize: number;
  totalVolume: number;
  holdingPeriodReturn: number;
}

/**
 * Overall backtest result
 */
export interface BacktestResult {
  id: string;
  config: BacktestConfig;
  startTime: number;
  endTime: number;
  duration: number; // Duration in milliseconds

  // Portfolio metrics
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercentage: number;
  annualizedReturn: number;

  // Risk metrics
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  maxDrawdownDuration: number; // Duration in milliseconds
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;

  // Trading metrics
  totalTrades: number;
  totalBuyTrades: number;
  totalSellTrades: number;
  totalWinningTrades: number;
  totalLosingTrades: number;
  overallWinRate: number;
  totalCommission: number;
  totalSlippage: number;
  averageTradeSize: number;
  totalVolume: number;

  // Performance by symbol
  symbolPerformance: Map<string, SymbolPerformance>;

  // Time series data
  portfolioHistory: PortfolioSnapshot[];
  trades: BacktestTrade[];

  // Execution metrics
  executionTimeMs: number;
  dataPointsProcessed: number;
  errorsEncountered: string[];

  // Additional metadata
  createdAt: number;
  version: string;
}

/**
 * Backtest progress information
 */
export interface BacktestProgress {
  symbol: string;
  currentTimestamp: number;
  progressPercentage: number;
  tradesExecuted: number;
  currentBalance: number;
  currentDrawdown: number;
  estimatedTimeRemaining: number; // milliseconds
}

/**
 * Historical data point for backtesting
 */
export interface BacktestCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
}

/**
 * Data source configuration for historical data
 */
export interface DataSourceConfig {
  type: 'binance' | 'file';
  cachePath?: string;
  enableCache: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Historical data loading result
 */
export interface HistoricalDataResult {
  symbol: string;
  interval: string;
  data: BacktestCandle[];
  startTime: number;
  endTime: number;
  dataSource: 'cache' | 'api';
  loadTimeMs: number;
}

/**
 * Execution context for a single backtest run
 */
export interface BacktestExecutionContext {
  id: string;
  config: BacktestConfig;
  startTime: number;
  currentProgress: Map<string, BacktestProgress>;
  isRunning: boolean;
  isPaused: boolean;
  canCancel: boolean;
  errorsEncountered: string[];
}

/**
 * Order simulation parameters
 */
export interface OrderSimulationParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  quantity: number;
  price?: number;
  candle: BacktestCandle;
  slippagePercentage: number;
  commissionRate: number;
}

/**
 * Order simulation result
 */
export interface OrderSimulationResult {
  executed: boolean;
  executionPrice: number;
  executedQuantity: number;
  slippage: number;
  commission: number;
  value: number;
  reason?: string; // Reason if not executed
}

/**
 * Report generation options
 */
export interface ReportOptions {
  format: 'json' | 'csv' | 'html' | 'pdf';
  includeCharts: boolean;
  includeTrades: boolean;
  includePortfolioHistory: boolean;
  includeSymbolBreakdown: boolean;
  outputPath?: string;
  template?: string;
}

/**
 * Market data statistics
 */
export interface MarketDataStats {
  symbol: string;
  startPrice: number;
  endPrice: number;
  priceChange: number;
  priceChangePercentage: number;
  high: number;
  low: number;
  averagePrice: number;
  volatility: number;
  volume: number;
  candleCount: number;
}

/**
 * Validation schema for backtest trades
 */
export const BacktestTradeSchema = z.object({
  id: z.string(),
  timestamp: z.number().int().positive(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['LIMIT', 'MARKET']),
  price: z.number().positive(),
  quantity: z.number().positive(),
  value: z.number().positive(),
  commission: z.number().min(0),
  profit: z.number().optional(),
  gridLevel: z.number(),
  executionPrice: z.number().positive(),
  slippage: z.number().min(0),
  candleTime: z.number().int().positive(),
});

/**
 * Validation schema for portfolio snapshots
 */
export const PortfolioSnapshotSchema = z.object({
  timestamp: z.number().int().positive(),
  totalValue: z.number().positive(),
  baseBalances: z.record(z.string(), z.number().min(0)),
  quoteBalance: z.number().min(0),
  unrealizedPnL: z.number(),
  realizedPnL: z.number(),
  drawdown: z.number().min(0),
  drawdownPercentage: z.number().min(0).max(1),
});

/**
 * Performance calculation options
 */
export interface PerformanceCalculationOptions {
  riskFreeRate: number; // Annual risk-free rate for Sharpe ratio calculation
  tradingDaysPerYear: number; // Default 365 for crypto
  minimumTrades: number; // Minimum trades required for valid statistics
  includeUnrealizedPnL: boolean;
}
