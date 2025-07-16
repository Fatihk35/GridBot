/**
 * Status Monitor Service
 * 
 * Real-time monitoring, kar/zarar takibi ve strateji durumu
 * gösterimi için centralized monitoring service.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { StrategyEngine } from './StrategyEngine';
import { BinanceService } from './BinanceService';
import { 
  MonitoringData, 
  ProfitLossData, 
  SymbolPnLData, 
  StrategyStatusSummary,
  TradingSessionInfo,
  StatusDisplayConfig,
  MonitoringEvent,
  MonitoringEventType
} from '../types/monitoring';
import { BotConfigType } from '../config/schema';

/**
 * StatusMonitor - Real-time monitoring ve display service
 */
export class StatusMonitor extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: BotConfigType;
  private strategyEngine?: StrategyEngine;
  private binanceService?: BinanceService;
  
  private sessionInfo?: TradingSessionInfo;
  private displayConfig: StatusDisplayConfig;
  private monitoringInterval?: NodeJS.Timeout | undefined;
  private lastMonitoringData?: MonitoringData;
  private recentEvents: MonitoringEvent[] = [];
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor(
    config: BotConfigType,
    displayConfig?: Partial<StatusDisplayConfig>
  ) {
    super();
    
    this.config = config;
    this.logger = Logger.getInstance();
    
    // Default display configuration
    this.displayConfig = {
      displayInterval: 60000, // 1 minute for real-time monitoring
      showSymbolDetails: true,
      showStrategyMetrics: true,
      showSystemMetrics: true,
      maxErrorsToShow: 5,
      ...displayConfig
    };

    this.logger.info('StatusMonitor initialized', {
      displayInterval: this.displayConfig.displayInterval,
      showDetails: {
        symbols: this.displayConfig.showSymbolDetails,
        strategy: this.displayConfig.showStrategyMetrics,
        system: this.displayConfig.showSystemMetrics
      }
    });
  }

  /**
   * Initialize monitoring with required services
   */
  public initialize(
    strategyEngine: StrategyEngine,
    binanceService: BinanceService
  ): void {
    this.strategyEngine = strategyEngine;
    this.binanceService = binanceService;
    
    this.logger.info('StatusMonitor services initialized');
  }

  /**
   * Start monitoring and periodic display
   */
  public async start(sessionInfo: TradingSessionInfo): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('StatusMonitor already running');
      return;
    }

    if (!this.strategyEngine || !this.binanceService) {
      throw new Error('StatusMonitor not properly initialized. Call initialize() first.');
    }

    this.sessionInfo = sessionInfo;
    this.startTime = Date.now();
    this.isRunning = true;

    // Display initial status
    await this.displayCurrentStatus();

    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.displayCurrentStatus();
      } catch (error) {
        this.logger.error('Error in periodic status display:', error);
        this.addEvent('error_occurred', undefined, { error: error }, `Status display error: ${error}`);
      }
    }, this.displayConfig.displayInterval);

    this.logger.info('StatusMonitor started', {
      sessionId: sessionInfo.sessionId,
      displayInterval: this.displayConfig.displayInterval
    });

    this.emit('started', sessionInfo);
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isRunning = false;
    this.logger.info('StatusMonitor stopped');
    this.emit('stopped');
  }

  /**
   * Add monitoring event
   */
  public addEvent(
    type: MonitoringEventType,
    symbol: string | undefined,
    data: any,
    message: string
  ): void {
    const event: MonitoringEvent = {
      type,
      timestamp: Date.now(),
      ...(symbol && { symbol }),
      data,
      message
    };

    this.recentEvents.unshift(event);
    
    // Keep only recent events
    if (this.recentEvents.length > 100) {
      this.recentEvents = this.recentEvents.slice(0, 100);
    }

    this.emit('event', event);
  }

  /**
   * Display current trading status
   */
  private async displayCurrentStatus(): Promise<void> {
    try {
      const monitoringData = await this.collectMonitoringData();
      this.lastMonitoringData = monitoringData;

      // Clear console and display header
      console.clear();
      this.displayHeader(monitoringData);
      
      // Display global P&L
      this.displayGlobalPnL(monitoringData.globalPnL);
      
      // Display symbol details if enabled
      if (this.displayConfig.showSymbolDetails) {
        this.displaySymbolBreakdown(monitoringData.symbolPnL);
      }
      
      // Display strategy metrics if enabled
      if (this.displayConfig.showStrategyMetrics) {
        this.displayStrategyMetrics(monitoringData.strategyStatus);
      }
      
      // Display system metrics if enabled
      if (this.displayConfig.showSystemMetrics) {
        this.displaySystemMetrics(monitoringData.systemMetrics);
      }
      
      // Display recent errors
      this.displayRecentErrors(monitoringData.recentErrors);

      this.emit('statusDisplayed', monitoringData);
      
    } catch (error) {
      this.logger.error('Failed to display status:', error);
      console.error('❌ Status display failed:', error);
    }
  }

  /**
   * Collect comprehensive monitoring data
   */
  private async collectMonitoringData(): Promise<MonitoringData> {
    const timestamp = Date.now();
    const uptime = Math.floor((timestamp - this.startTime) / 1000);

    // Collect global P&L
    const globalPnL = await this.calculateGlobalPnL();
    
    // Collect symbol P&L data
    const symbolPnL = await this.calculateSymbolPnL();
    
    // Collect strategy status
    const strategyStatus = this.collectStrategyStatus();
    
    // Collect system metrics
    const systemMetrics = {
      memoryUsage: process.memoryUsage(),
      activeConnections: 1, // Binance connection
      lastApiCall: Date.now(), // TODO: Get from BinanceService
      apiCallCount: 0 // TODO: Get from BinanceService
    };
    
    // Get recent errors
    const recentErrors = this.recentEvents
      .filter(event => event.type === 'error_occurred')
      .slice(0, this.displayConfig.maxErrorsToShow)
      .map(event => event.message);

    return {
      timestamp,
      appState: 'RUNNING', // TODO: Get from GridBotApp
      tradingMode: this.sessionInfo?.mode || 'unknown',
      uptime,
      globalPnL,
      symbolPnL,
      strategyStatus,
      systemMetrics,
      recentErrors
    };
  }

  /**
   * Calculate global P&L
   */
  private async calculateGlobalPnL(): Promise<ProfitLossData> {
    if (!this.strategyEngine || !this.sessionInfo) {
      return {
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalPnL: 0,
        tradingDuration: 0,
        dailyPnL: 0,
        lastTradeTime: 0
      };
    }

    const activeSymbols = this.strategyEngine.getActiveSymbols();
    let realizedPnL = 0;
    let unrealizedPnL = 0;
    let lastTradeTime = 0;

    for (const symbol of activeSymbols) {
      const metrics = this.strategyEngine.getMetrics(symbol);
      if (metrics) {
        realizedPnL += metrics.totalProfit;
        // TODO: Calculate unrealized P&L from open positions
      }

      const state = this.strategyEngine.getStrategyState(symbol);
      if (state && state.openPositions.size > 0) {
        // Calculate unrealized P&L for open positions
        try {
          const currentPrice = state.currentPrice;
          for (const [gridIndex, position] of state.openPositions) {
            const unrealizedForPosition = (currentPrice - position.entryPrice) * position.quantity;
            unrealizedPnL += unrealizedForPosition;
            lastTradeTime = Math.max(lastTradeTime, position.timestamp);
          }
        } catch (error) {
          this.logger.warn(`Failed to calculate unrealized P&L for ${symbol}:`, error);
        }
      }
    }

    const tradingDuration = Date.now() - this.sessionInfo.startTime;
    const dailyPnL = tradingDuration > 0 ? (realizedPnL * 86400000) / tradingDuration : 0;

    return {
      realizedPnL,
      unrealizedPnL,
      totalPnL: realizedPnL + unrealizedPnL,
      tradingDuration,
      dailyPnL,
      lastTradeTime
    };
  }

  /**
   * Calculate symbol-level P&L
   */
  private async calculateSymbolPnL(): Promise<SymbolPnLData[]> {
    if (!this.strategyEngine) {
      return [];
    }

    const activeSymbols = this.strategyEngine.getActiveSymbols();
    const symbolPnLData: SymbolPnLData[] = [];

    for (const symbol of activeSymbols) {
      const metrics = this.strategyEngine.getMetrics(symbol);
      const state = this.strategyEngine.getStrategyState(symbol);

      if (!metrics || !state) {
        continue;
      }

      // Calculate unrealized P&L for this symbol
      let unrealizedPnL = 0;
      if (state.openPositions.size > 0) {
        for (const [gridIndex, position] of state.openPositions) {
          unrealizedPnL += (state.currentPrice - position.entryPrice) * position.quantity;
        }
      }

      symbolPnLData.push({
        symbol,
        realizedPnL: metrics.totalProfit,
        unrealizedPnL,
        totalTrades: metrics.totalTrades,
        winningTrades: metrics.winningTrades,
        losingTrades: metrics.totalTrades - metrics.winningTrades,
        winRate: metrics.winRate,
        avgProfitPerTrade: metrics.avgProfitPerTrade,
        maxWin: 0, // TODO: Track max win/loss
        maxLoss: 0,
        activePositions: state.openPositions.size,
        lastTradePrice: 0, // TODO: Track last trade price
        currentPrice: state.currentPrice
      });
    }

    return symbolPnLData;
  }

  /**
   * Collect strategy status for all symbols
   */
  private collectStrategyStatus(): Record<string, StrategyStatusSummary> {
    if (!this.strategyEngine) {
      return {};
    }

    const activeSymbols = this.strategyEngine.getActiveSymbols();
    const strategyStatus: Record<string, StrategyStatusSummary> = {};

    for (const symbol of activeSymbols) {
      const state = this.strategyEngine.getStrategyState(symbol);
      const metrics = this.strategyEngine.getMetrics(symbol);

      if (!state || !metrics) {
        continue;
      }

      const activeGridLevels = state.gridLevels.filter(g => g.status === 'pending').length;
      const filledGridLevels = state.gridLevels.filter(g => g.status === 'filled').length;
      const emaDeviation = state.ema200 > 0 ? Math.abs(state.currentPrice - state.ema200) / state.ema200 : 0;

      strategyStatus[symbol] = {
        activeGridLevels,
        filledGridLevels,
        pendingGridLevels: activeGridLevels,
        gridInterval: state.gridInterval,
        ema200: state.ema200,
        currentPrice: state.currentPrice,
        emaDeviation,
        isEligibleForTrading: metrics.isEligibleForTrading,
        lastGridRecalculation: state.lastGridRecalculationTime,
        volatilityAnalysis: metrics.volatilityAnalysis ? {
          volatileBarRatio: metrics.volatilityAnalysis.volatileBarRatio,
          isEligible: metrics.isEligibleForTrading,
          ...(metrics.volatilityAnalysis.reason && { reason: metrics.volatilityAnalysis.reason })
        } : undefined
      };
    }

    return strategyStatus;
  }

  /**
   * Display header information
   */
  private displayHeader(data: MonitoringData): void {
    console.log('🤖 ============== GRIDBOT STATUS MONITOR ==============');
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`⏰ Uptime: ${this.formatDuration(data.uptime)}`);
    console.log(`📊 Mode: ${data.tradingMode.toUpperCase()}`);
    console.log(`🎯 State: ${data.appState}`);
    if (this.sessionInfo) {
      console.log(`🆔 Session: ${this.sessionInfo.sessionId}`);
    }
    console.log('====================================================\n');
  }

  /**
   * Display global P&L information
   */
  private displayGlobalPnL(pnl: ProfitLossData): void {
    console.log('💰 ============== GLOBAL P&L SUMMARY ==============');
    console.log(`💵 Realized P&L: ${this.formatCurrency(pnl.realizedPnL)}`);
    console.log(`📈 Unrealized P&L: ${this.formatCurrency(pnl.unrealizedPnL)}`);
    console.log(`🎯 Total P&L: ${this.formatCurrency(pnl.totalPnL)} ${this.formatPnLEmoji(pnl.totalPnL)}`);
    
    // Calculate session performance
    if (this.sessionInfo) {
      const sessionDuration = Date.now() - this.sessionInfo.startTime;
      const sessionHours = sessionDuration / (1000 * 60 * 60);
      const hourlyRate = sessionHours > 0 ? pnl.totalPnL / sessionHours : 0;
      
      console.log(`⏱️ Session Duration: ${this.formatDuration(Math.floor(sessionDuration / 1000))}`);
      console.log(`📊 Hourly Rate: ${this.formatCurrency(hourlyRate)}/h`);
      
      // Show session progress vs initial portfolio
      const portfolioChange = ((this.sessionInfo.initialBalance + pnl.totalPnL) / this.sessionInfo.initialBalance - 1) * 100;
      console.log(`📈 Portfolio Change: ${portfolioChange >= 0 ? '+' : ''}${portfolioChange.toFixed(3)}%`);
    }
    
    if (pnl.lastTradeTime > 0) {
      const timeSinceLastTrade = Date.now() - pnl.lastTradeTime;
      console.log(`⏰ Last Trade: ${this.formatDuration(Math.floor(timeSinceLastTrade / 1000))} ago`);
    } else {
      console.log(`⏰ No trades executed yet`);
    }
    console.log('==================================================\n');
  }

  /**
   * Display symbol breakdown
   */
  private displaySymbolBreakdown(symbolPnL: SymbolPnLData[]): void {
    if (symbolPnL.length === 0) {
      console.log('📈 ============== SYMBOL BREAKDOWN ================');
      console.log('🚫 No symbols with trading data');
      console.log('==================================================\n');
      return;
    }

    console.log('📈 ============== SYMBOL BREAKDOWN ================');
    console.log('Symbol      | Total P&L  | R/U P&L    | Trades | Win% | Active | Current Price');
    console.log('------------|------------|------------|--------|------|--------|---------------');
    
    for (const data of symbolPnL) {
      const totalPnL = data.realizedPnL + data.unrealizedPnL;
      const realizedFormatted = this.formatCurrency(data.realizedPnL);
      const unrealizedFormatted = this.formatCurrency(data.unrealizedPnL);
      
      console.log(
        `${data.symbol.padEnd(11)} | ` +
        `${this.formatCurrency(totalPnL).padStart(10)} | ` +
        `${realizedFormatted}/${unrealizedFormatted}`.padStart(10) + ' | ' +
        `${data.totalTrades.toString().padStart(6)} | ` +
        `${(data.winRate * 100).toFixed(1).padStart(4)}% | ` +
        `${data.activePositions.toString().padStart(6)} | ` +
        `${data.currentPrice.toFixed(4)}`
      );
    }
    
    // Summary totals
    const totalRealized = symbolPnL.reduce((sum, s) => sum + s.realizedPnL, 0);
    const totalUnrealized = symbolPnL.reduce((sum, s) => sum + s.unrealizedPnL, 0);
    const totalTrades = symbolPnL.reduce((sum, s) => sum + s.totalTrades, 0);
    const totalActive = symbolPnL.reduce((sum, s) => sum + s.activePositions, 0);
    
    console.log('------------|------------|------------|--------|------|--------|---------------');
    console.log(
      `${'TOTAL'.padEnd(11)} | ` +
      `${this.formatCurrency(totalRealized + totalUnrealized).padStart(10)} | ` +
      `${this.formatCurrency(totalRealized)}/${this.formatCurrency(totalUnrealized)}`.padStart(10) + ' | ' +
      `${totalTrades.toString().padStart(6)} | ` +
      `${'---'.padStart(4)}% | ` +
      `${totalActive.toString().padStart(6)} | ` +
      `${'---'.padEnd(4)}`
    );
    console.log('==================================================\n');
  }

  /**
   * Display strategy metrics
   */
  private displayStrategyMetrics(strategyStatus: Record<string, StrategyStatusSummary>): void {
    const symbols = Object.keys(strategyStatus);
    if (symbols.length === 0) {
      console.log('⚙️ ============== STRATEGY METRICS ================');
      console.log('🚫 No strategy data available');
      console.log('==================================================\n');
      return;
    }

    console.log('⚙️ ============== STRATEGY METRICS ================');
    console.log('Symbol      | Price/EMA200  | Grid Fill | Eligible | Volatility');
    console.log('------------|---------------|-----------|----------|------------');
    
    for (const symbol of symbols) {
      const status = strategyStatus[symbol];
      if (!status) continue;
      
      const priceEmaRatio = (status.currentPrice / status.ema200 * 100).toFixed(2);
      const gridFillRatio = `${status.filledGridLevels}/${status.activeGridLevels + status.filledGridLevels}`;
      const eligibleIcon = status.isEligibleForTrading ? '✅ Yes' : '❌ No';
      const volatilityText = status.volatilityAnalysis ? 
        `${(status.volatilityAnalysis.volatileBarRatio * 100).toFixed(1)}%` : 
        'N/A';
      
      console.log(
        `${symbol.padEnd(11)} | ` +
        `${priceEmaRatio}%`.padStart(13) + ' | ' +
        `${gridFillRatio.padStart(9)} | ` +
        `${eligibleIcon.padEnd(8)} | ` +
        `${volatilityText}`
      );
    }
    console.log('==================================================\n');
  }

  /**
   * Display system metrics
   */
  private displaySystemMetrics(metrics: any): void {
    console.log('🖥️ ============== SYSTEM METRICS ==================');
    console.log(`💾 Memory: ${this.formatBytes(metrics.memoryUsage.used)} / ${this.formatBytes(metrics.memoryUsage.heapTotal)}`);
    console.log(`🔌 Connections: ${metrics.activeConnections}`);
    console.log(`📡 API Calls: ${metrics.apiCallCount}`);
    console.log('==================================================\n');
  }

  /**
   * Display recent errors
   */
  private displayRecentErrors(errors: string[]): void {
    if (errors.length === 0) {
      return;
    }

    console.log('⚠️ ============== RECENT ERRORS ===================');
    for (const error of errors) {
      console.log(`❌ ${error}`);
    }
    console.log('==================================================\n');
  }

  /**
   * Utility methods
   */
  private formatCurrency(amount: number): string {
    return amount >= 0 ? `+$${amount.toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`;
  }

  private formatPnLEmoji(amount: number): string {
    if (amount > 0) return '🟢';
    if (amount < 0) return '🔴';
    return '⚪';
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Get current monitoring data
   */
  public getLastMonitoringData(): MonitoringData | undefined {
    return this.lastMonitoringData;
  }

  /**
   * Get recent events
   */
  public getRecentEvents(limit: number = 50): MonitoringEvent[] {
    return this.recentEvents.slice(0, limit);
  }
}

export default StatusMonitor;
