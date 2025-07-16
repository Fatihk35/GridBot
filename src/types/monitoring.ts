/**
 * Monitoring and Status Tracking Types
 * 
 * Bu dosya real-time monitoring, kar/zarar takibi ve
 * strateji durumu için gerekli interface'leri içerir.
 */

/**
 * Real-time P&L tracking interface
 */
export interface ProfitLossData {
  /** Toplam realize olmuş kar/zarar (USDT) */
  realizedPnL: number;
  /** Toplam unrealized kar/zarar (açık pozisyonlar) */
  unrealizedPnL: number;
  /** Net toplam kar/zarar */
  totalPnL: number;
  /** İşlem başlangıcından bu yana geçen süre (ms) */
  tradingDuration: number;
  /** Günlük kar/zarar */
  dailyPnL: number;
  /** Son işlem zamanı */
  lastTradeTime: number;
}

/**
 * Symbol bazında detaylı kar/zarar bilgisi
 */
export interface SymbolPnLData {
  symbol: string;
  /** Bu sembol için realize kar/zarar */
  realizedPnL: number;
  /** Bu sembol için unrealized kar/zarar */
  unrealizedPnL: number;
  /** Toplam işlem sayısı */
  totalTrades: number;
  /** Kazanan işlem sayısı */
  winningTrades: number;
  /** Kaybeden işlem sayısı */
  losingTrades: number;
  /** Win rate yüzdesi */
  winRate: number;
  /** Ortalama kar per trade */
  avgProfitPerTrade: number;
  /** En büyük kazanç */
  maxWin: number;
  /** En büyük kayıp */
  maxLoss: number;
  /** Aktif pozisyon sayısı */
  activePositions: number;
  /** Son işlem fiyatı */
  lastTradePrice: number;
  /** Mevcut market fiyatı */
  currentPrice: number;
}

/**
 * Strateji durumu özeti
 */
export interface StrategyStatusSummary {
  /** Aktif grid level sayısı */
  activeGridLevels: number;
  /** Filled grid level sayısı */
  filledGridLevels: number;
  /** Pending grid level sayısı */
  pendingGridLevels: number;
  /** Grid interval değeri */
  gridInterval: number;
  /** EMA200 değeri */
  ema200: number;
  /** Mevcut market fiyatı */
  currentPrice: number;
  /** EMA'dan sapma yüzdesi */
  emaDeviation: number;
  /** Trading için uygun mu? */
  isEligibleForTrading: boolean;
  /** Son grid recalculation zamanı */
  lastGridRecalculation: number;
  /** Volatility analysis sonucu */
  volatilityAnalysis?: {
    volatileBarRatio: number;
    isEligible: boolean;
    reason?: string;
  } | undefined;
}

/**
 * Comprehensive monitoring data
 */
export interface MonitoringData {
  /** Timestamp */
  timestamp: number;
  /** Uygulama durumu */
  appState: string;
  /** Trading mode */
  tradingMode: string;
  /** Uptime (seconds) */
  uptime: number;
  /** Global P&L data */
  globalPnL: ProfitLossData;
  /** Symbol bazında P&L data */
  symbolPnL: SymbolPnLData[];
  /** Symbol bazında strateji durumu */
  strategyStatus: Record<string, StrategyStatusSummary>;
  /** Sistem performans metrikleri */
  systemMetrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: number;
    activeConnections: number;
    lastApiCall: number;
    apiCallCount: number;
  };
  /** Son hata mesajları */
  recentErrors: string[];
}

/**
 * Status display configuration
 */
export interface StatusDisplayConfig {
  /** Display interval in milliseconds */
  displayInterval: number;
  /** Show detailed symbol breakdown */
  showSymbolDetails: boolean;
  /** Show strategy metrics */
  showStrategyMetrics: boolean;
  /** Show system metrics */
  showSystemMetrics: boolean;
  /** Max errors to show */
  maxErrorsToShow: number;
}

/**
 * Trading session başlangıç bilgileri
 */
export interface TradingSessionInfo {
  /** Session başlangıç zamanı */
  startTime: number;
  /** Başlangıç balance'ı */
  initialBalance: number;
  /** Başlangıç market fiyatları */
  initialPrices: Record<string, number>;
  /** Trading mode */
  mode: 'live' | 'paper' | 'backtest';
  /** Aktif semboller */
  activeSymbols: string[];
  /** Session ID */
  sessionId: string;
}

/**
 * Real-time event types
 */
export type MonitoringEventType = 
  | 'trade_executed'
  | 'position_opened'
  | 'position_closed'
  | 'grid_recalculated'
  | 'profit_realized'
  | 'loss_realized'
  | 'error_occurred'
  | 'status_update';

/**
 * Monitoring event interface
 */
export interface MonitoringEvent {
  type: MonitoringEventType;
  timestamp: number;
  symbol?: string;
  data: any;
  message: string;
}
