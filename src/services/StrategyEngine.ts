import { BotConfigType } from '../config/schema';
import { calculateATR, calculateEMA, CandlestickData, convertToOHLCV } from '../utils/indicators';
import { Logger } from '../utils/logger';
import { z } from 'zod';

/**
 * Grid level interface
 */
export interface GridLevel {
  /** Price level for this grid */
  price: number;
  /** Buy order size in quote currency (USDT) */
  buySize: number;
  /** Sell order size in base currency */
  sellSize: number;
  /** Current status of this grid level */
  status: 'pending' | 'filled' | 'canceled';
  /** Binance order ID if order is placed */
  orderId?: number | undefined;
  /** Grid level index for tracking */
  index: number;
  /** Entry price if position is filled */
  entryPrice?: number | undefined;
  /** Profit target price */
  profitTarget?: number | undefined;
}

/**
 * Trading signal interface
 */
export interface TradingSignal {
  /** Signal type */
  type: 'buy' | 'sell';
  /** Symbol to trade */
  symbol: string;
  /** Price to execute at */
  price: number;
  /** Quantity to trade */
  quantity: number;
  /** Grid level this signal belongs to */
  gridLevel: GridLevel;
  /** Signal confidence (0-1) */
  confidence: number;
  /** Signal timestamp */
  timestamp: number;
}

/**
 * Strategy state for a trading symbol
 */
export interface StrategyState {
  /** Trading symbol */
  symbol: string;
  /** Current grid levels */
  gridLevels: GridLevel[];
  /** Current market price */
  currentPrice: number;
  /** 200-period EMA value */
  ema200: number;
  /** ATR value for volatility */
  atr: number;
  /** Last time grid levels were recalculated */
  lastGridRecalculationTime: number;
  /** Total profit/loss for this symbol */
  totalProfit: number;
  /** Open positions map (grid index -> position details) */
  openPositions: Map<
    number,
    {
      entryPrice: number;
      quantity: number;
      orderId: number;
      timestamp: number;
    }
  >;
  /** Grid interval size */
  gridInterval: number;
  /** Base grid size in USDT - Sabit işlem tutarı (varsayılan 1000 USDT) */
  baseGridSize: number;
}

/**
 * Strategy performance metrics
 */
export interface StrategyMetrics {
  /** Total trades executed */
  totalTrades: number;
  /** Winning trades count */
  winningTrades: number;
  /** Total profit in USDT */
  totalProfit: number;
  /** Win rate percentage */
  winRate: number;
  /** Average profit per trade */
  avgProfitPerTrade: number;
  /** Maximum drawdown */
  maxDrawdown: number;
  /** Sharpe ratio */
  sharpeRatio: number;
  /** Symbol eligibility status */
  isEligibleForTrading: boolean;
  /** Volatility analysis result */
  volatilityAnalysis?: {
    volatileBarRatio: number;
    requiredRatio: number;
    volatileBars: number;
    totalBars: number;
    reason?: string;
  };
}

/**
 * Strategy configuration schema
 */
const StrategyConfigSchema = z.object({
  gridLevelsCount: z.number().min(5).max(50).default(20),
  gridIntervalMethod: z.enum(['ATR', 'DailyBarDiff']).default('DailyBarDiff'),
  atrPeriod: z.number().min(5).max(50).default(14),
  emaPeriod: z.number().min(50).max(500).default(200),
  emaDeviationThreshold: z.number().min(0.001).max(0.5).default(0.01), // %1 EMA eşiği
  minVolatilityPercentage: z.number().min(0.001).max(0.1).default(0.003), // %0.30 volatilite eşiği
  minVolatileBarRatio: z.number().min(0.1).max(1).default(0.51), // %51 volatil bar oranı
  barCountForVolatility: z.number().min(10).max(1000).default(500), // 500 bar analizi
  profitTargetMultiplier: z.number().min(1).max(10).default(2), // 2 grid kar hedefi (komisyon dahil 4 grid toplam)
  dcaMultipliers: z
    .object({
      standard: z.number().default(1), // %80 - 1000 TL
      moderate: z.number().default(3), // %10 - 3000 TL  
      aggressive: z.number().default(4), // %10 - 4000 TL
    })
    .default({}),
  gridRecalculationIntervalHours: z.number().min(1).max(168).default(48), // 2 günde bir güncelleme
  // Yeni özellikler
  baseGridSizeUSDT: z.number().min(100).max(10000).default(1000), // Sabit 1000 TL/USDT işlem tutarı
  commissionRate: z.number().min(0).max(0.01).default(0.001), // %0.1 komisyon oranı
});

type StrategyConfig = z.infer<typeof StrategyConfigSchema>;

/**
 * Grid Strategy Engine - Core implementation of grid trading strategy
 */
export class StrategyEngine {
  private readonly config: BotConfigType;
  private readonly strategyConfig: StrategyConfig;
  private readonly strategyStates: Map<string, StrategyState> = new Map();
  private readonly logger: Logger;
  private readonly metrics: Map<string, StrategyMetrics> = new Map();

  /**
   * Check if sufficient data is available for calculation method
   * @param historicalData Historical candlestick data
   * @param method Calculation method to check
   * @returns Object with availability status and required amount
   */
  private checkDataSufficiency(
    historicalData: CandlestickData[],
    method: 'ATR' | 'DailyBarDiff'
  ): { sufficient: boolean; available: number; required: number; method: string } {
    const available = historicalData.length;
    
    if (method === 'ATR') {
      const required = this.strategyConfig.atrPeriod + 1;
      return { 
        sufficient: available >= required, 
        available, 
        required,
        method: 'ATR'
      };
    } else {
      const required = this.strategyConfig.barCountForVolatility;
      return { 
        sufficient: available >= required, 
        available, 
        required,
        method: 'DailyBarDiff'
      };
    }
  }

  constructor(config: BotConfigType, strategyConfig?: Partial<StrategyConfig>) {
    this.config = config;
    this.logger = Logger.getInstance();

    // Config'den strategy settings'i al ve strategyConfig ile birleştir
    const configStrategySettings = this.config.strategySettings || {};
    const mergedStrategyConfig = {
      ...configStrategySettings,
      ...strategyConfig, // strategyConfig parametresi öncelikli
    };

    // Validate and set strategy configuration
    this.strategyConfig = StrategyConfigSchema.parse(mergedStrategyConfig);

    this.logger.info('StrategyEngine initialized', {
      strategyConfig: this.strategyConfig,
      symbols: this.config.symbols.map(s => s.pair),
      configSource: 'merged from config.json and constructor params',
    });
  }

  /**
   * Initialize strategy for a trading symbol
   */
  public initializeStrategy(symbol: string, historicalData: CandlestickData[]): void {
    try {
      // Validate data sufficiency before initialization
      const dataValidation = this.validateHistoricalDataSufficiency(historicalData);
      
      this.logger.info(`Initializing strategy for ${symbol}`, {
        dataPoints: historicalData.length,
        requiredPeriods: Math.max(this.strategyConfig.atrPeriod, this.strategyConfig.emaPeriod) + 1,
        dataSufficiency: dataValidation
      });

      if (!dataValidation.sufficient) {
        this.logger.warn(`Limited data available for ${symbol} - some calculations may use fallback methods`, {
          available: dataValidation.available,
          requirements: dataValidation.requirements,
          missingFor: dataValidation.missingFor
        });
      }

      // Calculate initial indicators - they will return 0 if insufficient data
      const atr = this.calculateGridInterval(
        historicalData,
        this.strategyConfig.gridIntervalMethod
      );
      const ema200 = calculateEMA(convertToOHLCV(historicalData), this.strategyConfig.emaPeriod);
      const currentPrice = historicalData[historicalData.length - 1]?.close || 0;

      this.logger.info(`Strategy indicators calculated for ${symbol}`, {
        atr,
        ema200,
        currentPrice,
        hasData: historicalData.length > 0
      });

      // Find symbol configuration
      const symbolConfig = this.config.symbols.find(s => s.pair === symbol);
      if (!symbolConfig) {
        throw new Error(`Symbol configuration not found for ${symbol}`);
      }

      // Initialize strategy state
      const strategyState: StrategyState = {
        symbol,
        gridLevels: [],
        currentPrice,
        ema200,
        atr,
        lastGridRecalculationTime: Date.now(),
        totalProfit: 0,
        openPositions: new Map(),
        gridInterval: atr,
        baseGridSize: this.strategyConfig.baseGridSizeUSDT, // Strateji konfigürasyonundan sabit tutar
      };

      this.strategyStates.set(symbol, strategyState);

      // Initialize metrics  
      this.metrics.set(symbol, {
        totalTrades: 0,
        winningTrades: 0,
        totalProfit: 0,
        winRate: 0,
        avgProfitPerTrade: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        isEligibleForTrading: true, // Başlangıçta true, sonra kontrol edilecek
      });

      // Calculate initial grid levels
      this.recalculateGridLevels(symbol);

      // Volatilite kontrolü yap ve metrics'i güncelle
      const isEligible = this.isSymbolSuitableForTrading(symbol, historicalData);
      const metrics = this.metrics.get(symbol);
      if (metrics) {
        metrics.isEligibleForTrading = isEligible;
      }

      this.logger.info(`Strategy initialized for ${symbol}`, {
        currentPrice,
        ema200,
        atr,
        gridInterval: atr,
        gridLevelsCount: strategyState.gridLevels.length,
        isEligibleForTrading: isEligible,
      });
    } catch (error) {
      this.logger.error(`Failed to initialize strategy for ${symbol}`, { error });
      throw error;
    }
  }

  /**
   * Calculate grid interval based on selected method
   */
  public calculateGridInterval(
    historicalData: CandlestickData[],
    method: 'ATR' | 'DailyBarDiff'
  ): number {
    try {
      // Check data sufficiency for requested method
      const methodCheck = this.checkDataSufficiency(historicalData, method);
      
      if (method === 'ATR') {
        if (!methodCheck.sufficient) {
          this.logger.debug('Insufficient data for ATR calculation', methodCheck);
          return 0;
        }
        return calculateATR(convertToOHLCV(historicalData), this.strategyConfig.atrPeriod);
      } else {
        // Daily Bar Difference method - İyileştirilmiş %51 kriteri
        if (!methodCheck.sufficient) {
          this.logger.debug('Insufficient data for Daily Bar Difference calculation, attempting ATR fallback', {
            available: methodCheck.available,
            required: methodCheck.required,
            method: 'DailyBarDiff'
          });
          
          // Check if we can fallback to ATR
          const atrCheck = this.checkDataSufficiency(historicalData, 'ATR');
          if (atrCheck.sufficient) {
            const atrValue = calculateATR(convertToOHLCV(historicalData), this.strategyConfig.atrPeriod);
            this.logger.debug('Grid interval calculated using ATR fallback', { 
              atrValue,
              originalMethod: 'DailyBarDiff',
              fallbackMethod: 'ATR',
              availableData: methodCheck.available,
              requiredForDailyBarDiff: methodCheck.required
            });
            return atrValue;
          } else {
            this.logger.warn('Insufficient data for both calculation methods', {
              dailyBarDiff: methodCheck,
              atr: atrCheck,
              minimumRequiredData: Math.max(methodCheck.required, atrCheck.required)
            });
            return 0;
          }
        }

        const barCount = this.strategyConfig.barCountForVolatility;
        const bars = historicalData.slice(-barCount);

        // Önce volatil barları belirle
        const volatileBars: CandlestickData[] = [];
        let totalDiff = 0;

        bars.forEach(bar => {
          const diff = Math.abs(bar.close - bar.open);
          const volatilityPercent = diff / bar.open;
          
          totalDiff += diff;

          // %0.30'dan fazla değişim gösteren barları volatil olarak işaretle
          if (volatilityPercent > this.strategyConfig.minVolatilityPercentage) {
            volatileBars.push(bar);
          }
        });

        const volatileBarRatio = volatileBars.length / bars.length;

        // %51 volatil bar kriteri kontrolü
        if (volatileBarRatio < this.strategyConfig.minVolatileBarRatio) {
          this.logger.warn('Insufficient volatility detected - %51 kriteri karşılanmadı', {
            volatileBarRatio: (volatileBarRatio * 100).toFixed(2) + '%',
            required: (this.strategyConfig.minVolatileBarRatio * 100).toFixed(2) + '%',
            volatileBars: volatileBars.length,
            totalBars: bars.length
          });

          // Bu durumu metrics'e kaydet
          this.updateVolatilityAnalysisInMetrics(historicalData, volatileBarRatio, volatileBars.length, bars.length, false);

          return 0; // İşlem yapma
        }

        // Başarılı volatilite analizini metrics'e kaydet
        this.updateVolatilityAnalysisInMetrics(historicalData, volatileBarRatio, volatileBars.length, bars.length, true);

        // Sadece volatil barların ortalamasını al
        const avgVolatileDiff = volatileBars.reduce((sum, bar) => {
          return sum + Math.abs(bar.close - bar.open);
        }, 0) / volatileBars.length;

        this.logger.info('Volatilite analizi başarılı', {
          volatileBarRatio: (volatileBarRatio * 100).toFixed(2) + '%',
          avgVolatileDiff,
          gridInterval: avgVolatileDiff / 4
        });

        return avgVolatileDiff / 4; // Grid aralığı volatil barların ortalamasının 1/4'ü
      }
    } catch (error) {
      this.logger.error('Failed to calculate grid interval', { method, error });
      throw error;
    }
  }

  /**
   * Recalculate grid levels for a symbol
   */
  public recalculateGridLevels(symbol: string): void {
    const state = this.strategyStates.get(symbol);
    if (!state) {
      this.logger.warn(`Strategy state not found for ${symbol}`);
      return;
    }

    try {
      const { currentPrice, atr } = state;
      const symbolConfig = this.config.symbols.find(s => s.pair === symbol);

      if (!symbolConfig) {
        this.logger.error(`Symbol configuration not found for ${symbol}`);
        return;
      }

      // Check minimum volatility threshold
      const minThreshold = symbolConfig.minDailyBarDiffThreshold || 0;
      if (atr < minThreshold) {
        this.logger.info(`Skipping ${symbol} due to insufficient volatility`, {
          atr,
          minThreshold,
        });
        return;
      }

      // Calculate grid levels around current price
      const gridLevels: GridLevel[] = [];
      const gridCount = Math.floor(this.strategyConfig.gridLevelsCount / 2);

      this.logger.info(`Calculating grid levels for ${symbol}`, {
        currentPrice,
        atr,
        gridCount,
        gridLevelsCount: this.strategyConfig.gridLevelsCount
      });

      for (let i = -gridCount; i <= gridCount; i++) {
        const price = currentPrice + i * atr;

        // Skip grid levels that are too close to current price
        const priceDistance = Math.abs(price - currentPrice);
        const threshold = atr * 0.1;
        
        if (priceDistance < threshold) {
          this.logger.debug(`Skipping grid level too close to current price`, {
            i,
            price,
            currentPrice,
            priceDistance,
            threshold
          });
          continue;
        }

        // Determine position size with DCA logic - %80-%10-%10 dağılımı
        let buySize = state.baseGridSize;
        const totalGrids = this.strategyConfig.gridLevelsCount;
        const currentGridPosition = (i + gridCount) / (gridCount * 2); // 0-1 arası normalize pozisyon

        // DCA dağılımı: Aşağıdaki seviyeler için daha büyük tutarlar
        if (i <= -Math.floor(gridCount * 0.8)) {
          // Alt %10 - en agresif alım (4000 TL)
          buySize = state.baseGridSize * this.strategyConfig.dcaMultipliers.aggressive;
        } else if (i <= -Math.floor(gridCount * 0.5)) {
          // Orta %10 - orta agresif alım (3000 TL)
          buySize = state.baseGridSize * this.strategyConfig.dcaMultipliers.moderate;
        }
        // Diğer %80 - standart alım (1000 TL)

        const gridLevel: GridLevel = {
          price: Number(price.toFixed(symbolConfig.pricePrecision || 8)),
          buySize,
          sellSize: 0, // Will be set when buy orders are filled
          status: 'pending',
          index: i + gridCount, // Convert to positive index
          profitTarget: this.calculateProfitTarget(price, atr),
        };

        gridLevels.push(gridLevel);
      }

      state.gridLevels = gridLevels;
      state.lastGridRecalculationTime = Date.now();
      state.gridInterval = atr;

      this.logger.info(`Grid levels recalculated for ${symbol}`, {
        gridLevelsCount: gridLevels.length,
        currentPrice,
        gridInterval: atr,
      });
    } catch (error) {
      this.logger.error(`Failed to recalculate grid levels for ${symbol}`, { error });
    }
  }

  /**
   * Check if trading should proceed based on EMA filter
   */
  public shouldTradeBasedOnEMA(symbol: string): boolean {
    const state = this.strategyStates.get(symbol);
    if (!state) return false;

    const { currentPrice, ema200 } = state;
    
    // If EMA is 0 (insufficient data), skip EMA filter and allow trading
    if (ema200 === 0) {
      this.logger.debug(`EMA filter skipped for ${symbol} (insufficient data for EMA calculation)`, {
        currentPrice,
        ema200
      });
      return true;
    }

    const deviation = Math.abs(currentPrice - ema200) / ema200;
    const shouldTrade = deviation <= this.strategyConfig.emaDeviationThreshold;

    if (!shouldTrade) {
      this.logger.debug(`Trading filtered out by EMA for ${symbol}`, {
        currentPrice,
        ema200,
        deviation,
        threshold: this.strategyConfig.emaDeviationThreshold,
      });
    }

    return shouldTrade;
  }

  /**
   * Update strategy state with new market data
   */
  public updateState(
    symbol: string,
    latestCandle: CandlestickData,
    historicalData: CandlestickData[]
  ): void {
    const state = this.strategyStates.get(symbol);
    if (!state) {
      this.logger.warn(`Strategy state not found for ${symbol}`);
      return;
    }

    try {
      // Update current price
      state.currentPrice = latestCandle.close;

      // Update indicators
      state.ema200 = calculateEMA(convertToOHLCV(historicalData), this.strategyConfig.emaPeriod);
      state.atr = this.calculateGridInterval(
        historicalData,
        this.strategyConfig.gridIntervalMethod
      );

      // Check if we need to recalculate grid levels
      const recalculationIntervalMs =
        this.strategyConfig.gridRecalculationIntervalHours * 60 * 60 * 1000;
      if (Date.now() - state.lastGridRecalculationTime > recalculationIntervalMs) {
        this.logger.info(`Recalculating grid levels for ${symbol} due to time interval`);
        this.recalculateGridLevels(symbol);
      }

      this.logger.debug(`State updated for ${symbol}`, {
        currentPrice: state.currentPrice,
        ema200: state.ema200,
        atr: state.atr,
      });
    } catch (error) {
      this.logger.error(`Failed to update state for ${symbol}`, { error });
    }
  }

  /**
   * Get trading signals based on current market conditions
   */
  public getTradeSignals(symbol: string): { buy: TradingSignal[]; sell: TradingSignal[] } {
    const state = this.strategyStates.get(symbol);
    if (!state) {
      return { buy: [], sell: [] };
    }

    // %51 volatilite kriterini kontrol et
    const metrics = this.metrics.get(symbol);
    if (metrics && !metrics.isEligibleForTrading) {
      this.logger.debug(`Trading signals skipped for ${symbol} - does not meet %51 volatility criteria`, {
        volatilityAnalysis: metrics.volatilityAnalysis
      });
      return { buy: [], sell: [] };
    }

    // Skip trading if outside EMA threshold
    if (!this.shouldTradeBasedOnEMA(symbol)) {
      return { buy: [], sell: [] };
    }

    const buySignals: TradingSignal[] = [];
    const sellSignals: TradingSignal[] = [];
    const currentTime = Date.now();

    // Find grid levels to trade
    state.gridLevels.forEach(level => {
      if (level.status === 'pending') {
        // Buy signal: current price has reached or gone below the buy level
        if (state.currentPrice <= level.price && level.price < state.currentPrice + state.gridInterval) {
          const confidence = this.calculateSignalConfidence(symbol, 'buy', level);

          buySignals.push({
            type: 'buy',
            symbol,
            price: state.currentPrice, // Execute at current market price for immediate fill
            quantity: level.buySize / state.currentPrice, // Convert USDT to base currency at current price
            gridLevel: level,
            confidence,
            timestamp: currentTime,
          });
        }
      } else if (level.status === 'filled') {
        // Sell signal: we have a position and current price is above profit target
        if (level.sellSize > 0 && level.profitTarget && state.currentPrice >= level.profitTarget) {
          const confidence = this.calculateSignalConfidence(symbol, 'sell', level);

          sellSignals.push({
            type: 'sell',
            symbol,
            price: state.currentPrice, // Execute at current market price
            quantity: level.sellSize,
            gridLevel: level,
            confidence,
            timestamp: currentTime,
          });
        }
      }
    });

    this.logger.info(`Generated trade signals for ${symbol}`, {
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      currentPrice: state.currentPrice,
      gridLevelsCount: state.gridLevels.length,
      ema200: state.ema200,
      shouldTradeBasedOnEMA: this.shouldTradeBasedOnEMA(symbol),
      gridLevelsPrices: state.gridLevels.map(l => ({ price: l.price, status: l.status })).slice(0, 5) // First 5 levels
    });

    return { buy: buySignals, sell: sellSignals };
  }

  /**
   * Calculate signal confidence based on market conditions
   */
  private calculateSignalConfidence(
    symbol: string,
    signalType: 'buy' | 'sell',
    gridLevel: GridLevel
  ): number {
    const state = this.strategyStates.get(symbol);
    if (!state) return 0.5;

    let confidence = 0.7; // Base confidence

    // Adjust confidence based on EMA proximity
    const emaDeviation = Math.abs(state.currentPrice - state.ema200) / state.ema200;
    confidence += (this.strategyConfig.emaDeviationThreshold - emaDeviation) * 0.5;

    // Adjust confidence based on volatility
    if (state.atr > state.currentPrice * 0.02) {
      // High volatility
      confidence += 0.1;
    }

    // Adjust confidence based on grid level position
    if (signalType === 'buy' && gridLevel.price < state.currentPrice * 0.95) {
      confidence += 0.1; // Better confidence for lower buy levels
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate profit target for a given entry price
   */
  public calculateProfitTarget(entryPrice: number, gridInterval: number): number {
    // Komisyon dahil kar hedefi: 2 grid kar + 2 grid komisyon = toplam 4 grid
    // Ancak kar hedefi olarak sadece 2 grid set ediyoruz (komisyon hesabı ayrıca yapılacak)
    const commissionGrids = 2; // Komisyon için 2 grid
    const profitGrids = this.strategyConfig.profitTargetMultiplier; // Kar için 2 grid (config'den)
    
    // Toplam hedef: entry price + (kar + komisyon) * grid interval
    return entryPrice + (profitGrids + commissionGrids) * gridInterval;
  }

  /**
   * Mark a grid level as filled and update position tracking
   */
  public markGridLevelFilled(
    symbol: string,
    gridIndex: number,
    fillPrice: number,
    fillQuantity: number,
    orderId: number
  ): void {
    const state = this.strategyStates.get(symbol);
    if (!state) return;

    const gridLevel = state.gridLevels.find(g => g.index === gridIndex);
    if (!gridLevel) {
      this.logger.warn(`Grid level ${gridIndex} not found for ${symbol}`);
      return;
    }

    gridLevel.status = 'filled';
    gridLevel.entryPrice = fillPrice;
    gridLevel.sellSize = fillQuantity;
    gridLevel.orderId = orderId;

    // Track open position
    state.openPositions.set(gridIndex, {
      entryPrice: fillPrice,
      quantity: fillQuantity,
      orderId,
      timestamp: Date.now(),
    });

    this.logger.info(`Grid level filled for ${symbol}`, {
      gridIndex,
      fillPrice,
      fillQuantity,
      orderId,
    });
  }

  /**
   * Process a completed trade and update metrics
   */
  public processCompletedTrade(
    symbol: string,
    gridIndex: number,
    sellPrice: number,
    sellQuantity: number
  ): void {
    const state = this.strategyStates.get(symbol);
    const metrics = this.metrics.get(symbol);

    if (!state || !metrics) return;

    const position = state.openPositions.get(gridIndex);
    if (!position) {
      this.logger.warn(`Position not found for grid ${gridIndex} on ${symbol}`);
      return;
    }

    // Komisyon hesaplama
    const buyCommission = position.entryPrice * position.quantity * this.strategyConfig.commissionRate;
    const sellCommission = sellPrice * sellQuantity * this.strategyConfig.commissionRate;
    const totalCommission = buyCommission + sellCommission;

    // Net kar/zarar hesaplama (komisyon dahil)
    const grossProfit = (sellPrice - position.entryPrice) * sellQuantity;
    const netProfit = grossProfit - totalCommission;

    // Update metrics
    metrics.totalTrades++;
    metrics.totalProfit += netProfit;

    if (netProfit > 0) {
      metrics.winningTrades++;
    }

    metrics.winRate = (metrics.winningTrades / metrics.totalTrades) * 100;
    metrics.avgProfitPerTrade = metrics.totalProfit / metrics.totalTrades;

    // Update strategy state
    state.totalProfit += netProfit;
    state.openPositions.delete(gridIndex);

    // Reset grid level
    const gridLevel = state.gridLevels.find(g => g.index === gridIndex);
    if (gridLevel) {
      gridLevel.status = 'pending';
      gridLevel.sellSize = 0;
      delete gridLevel.entryPrice;
      delete gridLevel.orderId;
    }

    this.logger.info(`Trade completed for ${symbol}`, {
      gridIndex,
      grossProfit,
      totalCommission,
      netProfit,
      sellPrice,
      sellQuantity,
      totalProfit: state.totalProfit,
    });
  }

  /**
   * Get strategy state for a symbol
   */
  public getStrategyState(symbol: string): StrategyState | undefined {
    return this.strategyStates.get(symbol);
  }

  /**
   * Get performance metrics for a symbol
   */
  public getMetrics(symbol: string): StrategyMetrics | undefined {
    return this.metrics.get(symbol);
  }

  /**
   * Get all active symbols
   */
  public getActiveSymbols(): string[] {
    return Array.from(this.strategyStates.keys());
  }

  /**
   * Reset strategy state for a symbol
   */
  public resetStrategy(symbol: string): void {
    this.strategyStates.delete(symbol);
    this.metrics.delete(symbol);
    this.logger.info(`Strategy reset for ${symbol}`);
  }

  /**
   * Update grid level after a buy order is filled
   */
  public updateGridLevelBuyFilled(symbol: string, gridPrice: number, quantity: number, fillPrice: number): void {
    const state = this.strategyStates.get(symbol);
    if (!state) return;

    const gridLevel = state.gridLevels.find(level => Math.abs(level.price - gridPrice) < 0.01);
    if (gridLevel) {
      gridLevel.status = 'filled';
      gridLevel.sellSize = quantity;
      gridLevel.entryPrice = fillPrice;

      this.logger.info(`Grid level buy filled for ${symbol}`, {
        gridPrice,
        quantity,
        fillPrice,
        profitTarget: gridLevel.profitTarget
      });
    }
  }

  /**
   * Update grid level after a sell order is filled
   */
  public updateGridLevelSellFilled(symbol: string, gridPrice: number): void {
    const state = this.strategyStates.get(symbol);
    if (!state) return;

    const gridLevel = state.gridLevels.find(level => Math.abs(level.price - gridPrice) < 0.01);
    if (gridLevel) {
      gridLevel.status = 'pending';
      gridLevel.sellSize = 0;
      delete gridLevel.entryPrice;

      this.logger.info(`Grid level sell filled for ${symbol}`, {
        gridPrice
      });
    }
  }

  /**
   * Get strategy configuration
   */
  public getStrategyConfig(): StrategyConfig {
    return { ...this.strategyConfig };
  }

  /**
   * Hisse seçimi için tarama kriteri - %51 volatilite kontrolü
   * @param symbol - Analiz edilecek hisse sembolü
   * @param historicalData - Son 500 adet 1 dakikalık bar verisi
   * @returns boolean - Hisse işlem için uygun mu?
   */
  public isSymbolSuitableForTrading(symbol: string, historicalData: CandlestickData[]): boolean {
    try {
      const barCount = this.strategyConfig.barCountForVolatility;
      const bars = historicalData.slice(-barCount);

      if (bars.length < barCount) {
        this.logger.warn(`Insufficient data for symbol screening: ${symbol}`, {
          available: bars.length,
          required: barCount
        });
        return false;
      }

      let volatileBarCount = 0;

      bars.forEach(bar => {
        const diff = Math.abs(bar.close - bar.open);
        const volatilityPercent = diff / bar.open;
        
        // %0.30'dan fazla değişim gösteren barları say
        if (volatilityPercent > this.strategyConfig.minVolatilityPercentage) {
          volatileBarCount++;
        }
      });

      const volatileBarRatio = volatileBarCount / bars.length;
      const isEligible = volatileBarRatio >= this.strategyConfig.minVolatileBarRatio;

      this.logger.info(`Symbol screening result for ${symbol}`, {
        volatileBarRatio: (volatileBarRatio * 100).toFixed(2) + '%',
        required: (this.strategyConfig.minVolatileBarRatio * 100).toFixed(2) + '%',
        volatileBars: volatileBarCount,
        totalBars: bars.length,
        isEligible
      });

      return isEligible;

    } catch (error) {
      this.logger.error(`Failed to screen symbol ${symbol}`, { error });
      return false;
    }
  }

  /**
   * Komisyon hesaplama yardımcı fonksiyonu
   * @param price - İşlem fiyatı
   * @param quantity - İşlem miktarı
   * @returns Komisyon tutarı
   */
  public calculateCommission(price: number, quantity: number): number {
    return price * quantity * this.strategyConfig.commissionRate;
  }

  /**
   * Net kar hesaplama (komisyon dahil)
   * @param entryPrice - Giriş fiyatı
   * @param exitPrice - Çıkış fiyatı
   * @param quantity - Miktar
   * @returns Net kar/zarar
   */
  public calculateNetProfit(entryPrice: number, exitPrice: number, quantity: number): number {
    const grossProfit = (exitPrice - entryPrice) * quantity;
    const buyCommission = this.calculateCommission(entryPrice, quantity);
    const sellCommission = this.calculateCommission(exitPrice, quantity);
    return grossProfit - buyCommission - sellCommission;
  }

  /**
   * Volatilite analizi sonucunu metrics'e kaydet
   * @param historicalData - Kullanılan historical data (symbol çıkarımı için)
   * @param volatileBarRatio - Volatil bar oranı
   * @param volatileBars - Volatil bar sayısı
   * @param totalBars - Toplam bar sayısı
   * @param isEligible - %51 kriterini karşılıyor mu?
   */
  private updateVolatilityAnalysisInMetrics(
    historicalData: CandlestickData[],
    volatileBarRatio: number,
    volatileBars: number,
    totalBars: number,
    isEligible: boolean
  ): void {
    // Son işlenen symbol'ü bulmak için strategyStates'i kontrol et
    // Bu fonksiyon calculateGridInterval içinden çağrıldığı için aktif symbol'ü bulmamız gerek
    for (const [symbol, metrics] of this.metrics.entries()) {
      // Son güncellenen symbol olması muhtemel
      metrics.isEligibleForTrading = isEligible;
      metrics.volatilityAnalysis = {
        volatileBarRatio,
        requiredRatio: this.strategyConfig.minVolatileBarRatio,
        volatileBars,
        totalBars,
        reason: isEligible 
          ? 'Symbol meets %51 volatility criteria and is eligible for trading'
          : `Symbol does not meet %51 volatility criteria (${(volatileBarRatio * 100).toFixed(2)}% < ${(this.strategyConfig.minVolatileBarRatio * 100).toFixed(2)}%). Trading disabled.`
      };
      break; // Sadece en son işlenen symbol için güncelle
    }
  }

  /**
   * %51 kriteri karşılamayan hisselerin raporunu döndür
   * @returns Kriteri karşılamayan hisselerin listesi ve detayları
   */
  public getIneligibleSymbolsReport(): Array<{
    symbol: string;
    reason: string;
    volatilityAnalysis: {
      volatileBarRatio: number;
      requiredRatio: number;
      volatileBars: number;
      totalBars: number;
    };
  }> {
    const ineligibleSymbols: Array<{
      symbol: string;
      reason: string;
      volatilityAnalysis: {
        volatileBarRatio: number;
        requiredRatio: number;
        volatileBars: number;
        totalBars: number;
      };
    }> = [];

    for (const [symbol, metrics] of this.metrics.entries()) {
      if (!metrics.isEligibleForTrading && metrics.volatilityAnalysis) {
        ineligibleSymbols.push({
          symbol,
          reason: metrics.volatilityAnalysis.reason || 'Unknown reason',
          volatilityAnalysis: {
            volatileBarRatio: metrics.volatilityAnalysis.volatileBarRatio,
            requiredRatio: metrics.volatilityAnalysis.requiredRatio,
            volatileBars: metrics.volatilityAnalysis.volatileBars,
            totalBars: metrics.volatilityAnalysis.totalBars,
          }
        });
      }
    }

    return ineligibleSymbols;
  }

  /**
   * Sembol için backtest eligibility kontrolü
   * @param symbol - Kontrol edilecek sembol
   * @returns Backtest yapılabilir mi?
   */
  public canRunBacktest(symbol: string): boolean {
    const metrics = this.metrics.get(symbol);
    if (!metrics) {
      this.logger.warn(`Metrics not found for symbol ${symbol}. Cannot run backtest.`);
      return false;
    }

    if (!metrics.isEligibleForTrading) {
      this.logger.warn(`Symbol ${symbol} does not meet %51 volatility criteria. Backtest skipped.`, {
        volatilityAnalysis: metrics.volatilityAnalysis
      });
      return false;
    }

    return true;
  }

  /**
   * Get minimum data requirements for the strategy
   * @returns Object with minimum data requirements for different calculations
   */
  public getMinimumDataRequirements(): {
    atr: number;
    dailyBarDiff: number;
    ema: number;
    recommended: number;
  } {
    return {
      atr: this.strategyConfig.atrPeriod + 1,
      dailyBarDiff: this.strategyConfig.barCountForVolatility,
      ema: this.strategyConfig.emaPeriod,
      recommended: Math.max(
        this.strategyConfig.barCountForVolatility,
        this.strategyConfig.emaPeriod,
        this.strategyConfig.atrPeriod + 1
      )
    };
  }

  /**
   * Validate if historical data meets minimum requirements for strategy initialization
   * @param historicalData Historical candlestick data
   * @returns Validation result with details
   */
  public validateHistoricalDataSufficiency(historicalData: CandlestickData[]): {
    sufficient: boolean;
    available: number;
    requirements: {
      atr: number;
      dailyBarDiff: number;
      ema: number;
      recommended: number;
    };
    missingFor: string[];
  } {
    const requirements = this.getMinimumDataRequirements();
    const available = historicalData.length;
    const missingFor: string[] = [];

    if (available < requirements.atr) {
      missingFor.push(`ATR calculation (need ${requirements.atr}, have ${available})`);
    }
    if (available < requirements.dailyBarDiff) {
      missingFor.push(`Daily Bar Difference calculation (need ${requirements.dailyBarDiff}, have ${available})`);
    }
    if (available < requirements.ema) {
      missingFor.push(`EMA calculation (need ${requirements.ema}, have ${available})`);
    }

    return {
      sufficient: available >= requirements.recommended,
      available,
      requirements,
      missingFor
    };
  }
}
