/**
 * Core types and interfaces for the GridBot trading system
 */

/**
 * Supported trading modes
 */
export type TradeMode = 'backtest' | 'papertrade' | 'live';

/**
 * Supported exchanges
 */
export type Exchange = 'binance';

/**
 * Order side types
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order types
 */
export type OrderType = 'MARKET' | 'LIMIT';

/**
 * Order status
 */
export type OrderStatus = 'pending' | 'filled' | 'canceled' | 'rejected';

/**
 * Grid level status
 */
export type GridLevelStatus = 'pending' | 'filled' | 'canceled';

/**
 * Calculation methods for grid intervals
 */
export type GridCalculationMethod = 'ATR' | 'DailyBarDiff';

/**
 * Log levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Budget configuration
 */
export interface BudgetConfig {
  amount: number;
  currency: string;
}

/**
 * Symbol configuration for trading pairs
 */
export interface SymbolConfig {
  pair: string;
  minDailyBarDiffThreshold: number;
}

/**
 * API keys configuration
 */
export interface ApiKeysConfig {
  binanceApiKey: string;
  binanceSecretKey: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

/**
 * Strategy settings configuration
 */
export interface StrategySettingsConfig {
  barCountForVolatility: number;
  minVolatilityPercentage: number;
  minVolatileBarRatio: number;
  emaPeriod: number;
  emaDeviationThreshold: number;
}

/**
 * Binance-specific settings
 */
export interface BinanceSettingsConfig {
  testnet: boolean;
  commissionRate: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  enableConsoleOutput: boolean;
  enableTelegramOutput: boolean;
  reportDirectory: string;
  transactionLogFileName: string;
}

/**
 * Main bot configuration interface
 */
export interface BotConfig {
  tradeMode: TradeMode;
  exchange: Exchange;
  maxBudget: BudgetConfig;
  symbols: SymbolConfig[];
  apiKeys: ApiKeysConfig;
  strategySettings: StrategySettingsConfig;
  binanceSettings: BinanceSettingsConfig;
  logging: LoggingConfig;
}

/**
 * Grid level interface
 */
export interface GridLevel {
  price: number;
  buySize: number;
  sellSize: number;
  status: GridLevelStatus;
  orderId?: number;
}

/**
 * Strategy state interface
 */
export interface StrategyState {
  symbol: string;
  gridLevels: GridLevel[];
  currentPrice: number;
  ema200: number;
  atr: number;
  lastGridRecalculationTime: number;
  totalProfit: number;
  openPositions: Map<number, unknown>;
}

/**
 * Trade signals interface
 */
export interface TradeSignals {
  buy: GridLevel[];
  sell: GridLevel[];
}

/**
 * Strategy signal interface for individual trade signals
 */
export interface StrategySignal {
  price: number;
  quantity: number;
  side: OrderSide;
  type: OrderType;
  symbol: string;
  gridLevel?: number;
}

/**
 * Historical market data bar
 */
export interface MarketDataBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Order interface
 */
export interface Order {
  id?: number;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  status: OrderStatus;
  timestamp: number;
}

/**
 * Account balance interface
 */
export interface AccountBalance {
  asset: string;
  free: number;
  locked: number;
}

/**
 * Exchange info interface
 */
export interface ExchangeInfo {
  symbols: SymbolInfo[];
}

/**
 * Symbol info interface
 */
export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  filters: SymbolFilter[];
}

/**
 * Symbol filter interface
 */
export interface SymbolFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
}

/**
 * Error types
 */
export interface ConfigurationError extends Error {
  name: 'ConfigurationError';
  details?: unknown;
}

export interface ValidationError extends Error {
  name: 'ValidationError';
  details?: unknown;
}

export interface APIError extends Error {
  name: 'APIError';
  code?: string | number;
  details?: unknown;
}

/**
 * Logger interface
 */
export interface ILogger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

/**
 * Configuration loader interface
 */
export interface IConfigLoader {
  loadConfig(configPath: string): Promise<BotConfig>;
  validateConfig(config: unknown): BotConfig;
}

/**
 * Virtual balance for paper trading
 */
export interface VirtualBalance {
  [currency: string]: number;
}

/**
 * Virtual order for paper trading
 */
export interface VirtualOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED';
  filledQuantity: number;
  createTime: number;
  updateTime: number;
  gridLevelIndex?: number;
}

/**
 * Paper trading state
 */
export interface PaperTradingState {
  isRunning: boolean;
  startTime: number;
  virtualBalances: VirtualBalance;
  virtualOrders: Map<string, VirtualOrder>;
  lastOrderId: number;
  totalTrades: number;
  totalProfit: number;
  maxDrawdown: number;
  highestBalance: number;
}

/**
 * Paper trading result
 */
export interface PaperTradingResult {
  symbol: string;
  startTime: number;
  endTime: number;
  duration: number;
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  totalProfitPercentage: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  trades: VirtualOrder[];
  finalBalances: VirtualBalance;
}

/**
 * Notification message
 */
export interface NotificationMessage {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Paper trading configuration
 */
export interface PaperTradingConfig {
  initialBalance: number;
  currency: string;
  enableReporting: boolean;
  reportingInterval: number; // minutes
  enableNotifications: boolean;
  slippageRate: number;
  latencyMs: number;
}

/**
 * Binance service interface
 */
export interface IBinanceService {
  getHistoricalKlines(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<MarketDataBar[]>;
  getAccountBalance(): Promise<AccountBalance[]>;
  createOrder(order: Omit<Order, 'id' | 'status' | 'timestamp'>): Promise<Order>;
  cancelOrder(symbol: string, orderId: number): Promise<void>;
  getExchangeInfo(): Promise<ExchangeInfo>;
  subscribeToKlineUpdates(
    symbol: string,
    interval: string,
    callback: (kline: any) => void
  ): void;
  unsubscribeFromKlineUpdates(symbol: string, interval: string): void;
}
