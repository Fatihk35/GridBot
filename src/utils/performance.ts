/**
 * Performance calculation utilities for backtesting
 * Provides comprehensive financial metrics calculation for trading strategies
 */

import {
  BacktestTrade,
  PortfolioSnapshot,
  SymbolPerformance,
  BacktestResult,
  PerformanceCalculationOptions,
} from '@/types/backtest';

/**
 * Default performance calculation options
 */
const DEFAULT_PERFORMANCE_OPTIONS: PerformanceCalculationOptions = {
  riskFreeRate: 0.02, // 2% annual risk-free rate
  tradingDaysPerYear: 365, // Crypto markets trade 24/7
  minimumTrades: 10,
  includeUnrealizedPnL: true,
};

/**
 * Performance calculator for backtesting results
 */
export class PerformanceCalculator {
  private options: PerformanceCalculationOptions;

  constructor(options: Partial<PerformanceCalculationOptions> = {}) {
    this.options = { ...DEFAULT_PERFORMANCE_OPTIONS, ...options };
  }

  /**
   * Calculate comprehensive performance metrics for a symbol
   */
  calculateSymbolPerformance(
    symbol: string,
    trades: BacktestTrade[],
    portfolioHistory: PortfolioSnapshot[]
  ): SymbolPerformance {
    const symbolTrades = trades.filter(trade => trade.symbol === symbol);

    if (symbolTrades.length === 0) {
      return this.createEmptySymbolPerformance(symbol);
    }

    const buyTrades = symbolTrades.filter(trade => trade.side === 'BUY');
    const sellTrades = symbolTrades.filter(trade => trade.side === 'SELL');

    const profits = sellTrades
      .filter(trade => trade.profit !== undefined)
      .map(trade => trade.profit!);

    const winningTrades = profits.filter(profit => profit > 0);
    const losingTrades = profits.filter(profit => profit < 0);

    const grossProfit = winningTrades.reduce((sum, profit) => sum + profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, loss) => sum + loss, 0));
    const netProfit = grossProfit - grossLoss;
    const totalCommission = symbolTrades.reduce((sum, trade) => sum + trade.commission, 0);
    const totalVolume = symbolTrades.reduce((sum, trade) => sum + trade.value, 0);

    // Calculate additional metrics
    const averageWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.abs(Math.min(...losingTrades)) : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Calculate consecutive wins/losses
    const { maxConsecutiveWins, maxConsecutiveLosses } =
      this.calculateConsecutiveWinsLosses(profits);

    // Calculate Sharpe ratio for this symbol
    const returns = this.calculateReturns(symbolTrades);
    const sharpeRatio = this.calculateSharpeRatio(returns);

    // Calculate holding period return
    const initialValue = buyTrades.length > 0 ? buyTrades[0]?.value || 0 : 0;
    const holdingPeriodReturn = initialValue > 0 ? (netProfit / initialValue) * 100 : 0;

    return {
      symbol,
      totalTrades: symbolTrades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: profits.length > 0 ? (winningTrades.length / profits.length) * 100 : 0,
      grossProfit,
      grossLoss,
      netProfit,
      netProfitPercentage: initialValue > 0 ? (netProfit / initialValue) * 100 : 0,
      totalCommission,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      profitFactor,
      sharpeRatio,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageTradeSize: symbolTrades.length > 0 ? totalVolume / symbolTrades.length : 0,
      totalVolume,
      holdingPeriodReturn,
    };
  }

  /**
   * Calculate overall portfolio performance metrics
   */
  calculateOverallPerformance(
    portfolioHistory: PortfolioSnapshot[],
    trades: BacktestTrade[],
    initialBalance: number
  ): Pick<
    BacktestResult,
    | 'totalReturn'
    | 'totalReturnPercentage'
    | 'annualizedReturn'
    | 'maxDrawdown'
    | 'maxDrawdownPercentage'
    | 'maxDrawdownDuration'
    | 'volatility'
    | 'sharpeRatio'
    | 'sortinoRatio'
    | 'calmarRatio'
  > {
    if (portfolioHistory.length === 0) {
      return this.createEmptyPerformanceMetrics();
    }

    const finalBalance = portfolioHistory[portfolioHistory.length - 1]?.totalValue || 0;
    const totalReturn = finalBalance - initialBalance;
    const totalReturnPercentage = (totalReturn / initialBalance) * 100;

    // Calculate time-based metrics
    const startTime = portfolioHistory[0]?.timestamp || 0;
    const endTime = portfolioHistory[portfolioHistory.length - 1]?.timestamp || 0;
    const durationYears =
      (endTime - startTime) / (1000 * 60 * 60 * 24 * this.options.tradingDaysPerYear);

    const annualizedReturn =
      durationYears > 0
        ? (Math.pow(finalBalance / initialBalance, 1 / durationYears) - 1) * 100
        : 0;

    // Calculate drawdown metrics
    const drawdownMetrics = this.calculateDrawdownMetrics(portfolioHistory);

    // Calculate volatility and risk metrics
    const returns = this.calculatePortfolioReturns(portfolioHistory);
    const volatility = this.calculateVolatility(returns) * 100;
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    const calmarRatio =
      drawdownMetrics.maxDrawdownPercentage > 0
        ? annualizedReturn / drawdownMetrics.maxDrawdownPercentage
        : 0;

    return {
      totalReturn,
      totalReturnPercentage,
      annualizedReturn,
      maxDrawdown: drawdownMetrics.maxDrawdown,
      maxDrawdownPercentage: drawdownMetrics.maxDrawdownPercentage,
      maxDrawdownDuration: drawdownMetrics.maxDrawdownDuration,
      volatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
    };
  }

  /**
   * Calculate trading-specific metrics
   */
  calculateTradingMetrics(trades: BacktestTrade[]): {
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
  } {
    const buyTrades = trades.filter(trade => trade.side === 'BUY');
    const sellTrades = trades.filter(trade => trade.side === 'SELL');

    const profitableTrades = sellTrades.filter(
      trade => trade.profit !== undefined && trade.profit > 0
    );
    const losingTrades = sellTrades.filter(trade => trade.profit !== undefined && trade.profit < 0);

    const totalCommission = trades.reduce((sum, trade) => sum + trade.commission, 0);
    const totalSlippage = trades.reduce((sum, trade) => sum + trade.slippage, 0);
    const totalVolume = trades.reduce((sum, trade) => sum + trade.value, 0);
    const averageTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;

    const completedTradePairs = Math.min(buyTrades.length, sellTrades.length);
    const overallWinRate =
      completedTradePairs > 0 ? (profitableTrades.length / completedTradePairs) * 100 : 0;

    return {
      totalTrades: trades.length,
      totalBuyTrades: buyTrades.length,
      totalSellTrades: sellTrades.length,
      totalWinningTrades: profitableTrades.length,
      totalLosingTrades: losingTrades.length,
      overallWinRate,
      totalCommission,
      totalSlippage,
      averageTradeSize,
      totalVolume,
    };
  }

  /**
   * Calculate drawdown metrics from portfolio history
   */
  private calculateDrawdownMetrics(portfolioHistory: PortfolioSnapshot[]): {
    maxDrawdown: number;
    maxDrawdownPercentage: number;
    maxDrawdownDuration: number;
  } {
    let maxValue = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercentage = 0;
    let maxDrawdownDuration = 0;
    let drawdownStartTime = 0;
    let currentDrawdownDuration = 0;

    for (const snapshot of portfolioHistory) {
      if (snapshot.totalValue > maxValue) {
        maxValue = snapshot.totalValue;
        if (drawdownStartTime > 0) {
          // End of drawdown period
          maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDuration);
          drawdownStartTime = 0;
          currentDrawdownDuration = 0;
        }
      } else {
        const drawdown = maxValue - snapshot.totalValue;
        const drawdownPercentage = (drawdown / maxValue) * 100;

        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownPercentage = drawdownPercentage;
        }

        if (drawdownStartTime === 0) {
          drawdownStartTime = snapshot.timestamp;
        }
        currentDrawdownDuration = snapshot.timestamp - drawdownStartTime;
      }
    }

    // Handle case where backtest ends in drawdown
    if (drawdownStartTime > 0) {
      maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDuration);
    }

    return {
      maxDrawdown,
      maxDrawdownPercentage,
      maxDrawdownDuration,
    };
  }

  /**
   * Calculate portfolio returns from snapshots
   */
  private calculatePortfolioReturns(portfolioHistory: PortfolioSnapshot[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < portfolioHistory.length; i++) {
      const previousValue = portfolioHistory[i - 1]?.totalValue || 0;
      const currentValue = portfolioHistory[i]?.totalValue || 0;

      if (previousValue > 0) {
        const returnRate = (currentValue - previousValue) / previousValue;
        returns.push(returnRate);
      }
    }

    return returns;
  }

  /**
   * Calculate returns from trades
   */
  private calculateReturns(trades: BacktestTrade[]): number[] {
    const returns: number[] = [];

    for (const trade of trades) {
      if (trade.profit !== undefined && trade.value > 0) {
        const returnRate = trade.profit / trade.value;
        returns.push(returnRate);
      }
    }

    return returns;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance);
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < this.options.minimumTrades) return 0;

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = this.calculateVolatility(returns);

    if (volatility === 0) return 0;

    // Convert annual risk-free rate to period rate
    const periodRiskFreeRate = this.options.riskFreeRate / this.options.tradingDaysPerYear;

    return (meanReturn - periodRiskFreeRate) / volatility;
  }

  /**
   * Calculate Sortino ratio (focuses on downside volatility)
   */
  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length < this.options.minimumTrades) return 0;

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const negativeReturns = returns.filter(ret => ret < 0);

    if (negativeReturns.length === 0) return Infinity;

    const downsideVolatility = this.calculateVolatility(negativeReturns);
    if (downsideVolatility === 0) return 0;

    const periodRiskFreeRate = this.options.riskFreeRate / this.options.tradingDaysPerYear;

    return (meanReturn - periodRiskFreeRate) / downsideVolatility;
  }

  /**
   * Calculate consecutive wins and losses
   */
  private calculateConsecutiveWinsLosses(profits: number[]): {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
  } {
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const profit of profits) {
      if (profit > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else if (profit < 0) {
        currentLosses++;
        currentWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      }
    }

    return { maxConsecutiveWins, maxConsecutiveLosses };
  }

  /**
   * Create empty symbol performance for symbols with no trades
   */
  private createEmptySymbolPerformance(symbol: string): SymbolPerformance {
    return {
      symbol,
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
      netProfitPercentage: 0,
      totalCommission: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      averageTradeSize: 0,
      totalVolume: 0,
      holdingPeriodReturn: 0,
    };
  }

  /**
   * Create empty performance metrics
   */
  private createEmptyPerformanceMetrics(): Pick<
    BacktestResult,
    | 'totalReturn'
    | 'totalReturnPercentage'
    | 'annualizedReturn'
    | 'maxDrawdown'
    | 'maxDrawdownPercentage'
    | 'maxDrawdownDuration'
    | 'volatility'
    | 'sharpeRatio'
    | 'sortinoRatio'
    | 'calmarRatio'
  > {
    return {
      totalReturn: 0,
      totalReturnPercentage: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      maxDrawdownPercentage: 0,
      maxDrawdownDuration: 0,
      volatility: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
    };
  }
}

/**
 * Utility functions for performance calculations
 */
export class PerformanceUtils {
  /**
   * Calculate Value at Risk (VaR) at specified confidence level
   */
  static calculateVaR(returns: number[], confidenceLevel: number = 0.95): number {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);

    return sortedReturns[index] || 0;
  }

  /**
   * Calculate Conditional Value at Risk (CVaR)
   */
  static calculateCVaR(returns: number[], confidenceLevel: number = 0.95): number {
    if (returns.length === 0) return 0;

    const valueAtRisk = PerformanceUtils.calculateVaR(returns, confidenceLevel);
    const tailReturns = returns.filter(ret => ret <= valueAtRisk);

    return tailReturns.length > 0
      ? tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length
      : 0;
  }

  /**
   * Calculate maximum favorable excursion (MFE) and maximum adverse excursion (MAE)
   */
  static calculateExcursions(trades: BacktestTrade[]): {
    averageMFE: number;
    averageMAE: number;
    maxMFE: number;
    maxMAE: number;
  } {
    // This would require tick-by-tick data to calculate properly
    // For now, return simplified metrics based on profit/loss
    const profits = trades.filter(trade => trade.profit !== undefined).map(trade => trade.profit!);

    const positive = profits.filter(p => p > 0);
    const negative = profits.filter(p => p < 0).map(p => Math.abs(p));

    return {
      averageMFE:
        positive.length > 0 ? positive.reduce((sum, p) => sum + p, 0) / positive.length : 0,
      averageMAE:
        negative.length > 0 ? negative.reduce((sum, p) => sum + p, 0) / negative.length : 0,
      maxMFE: positive.length > 0 ? Math.max(...positive) : 0,
      maxMAE: negative.length > 0 ? Math.max(...negative) : 0,
    };
  }

  /**
   * Calculate recovery factor (net profit / max drawdown)
   */
  static calculateRecoveryFactor(netProfit: number, maxDrawdown: number): number {
    return maxDrawdown > 0 ? netProfit / maxDrawdown : netProfit > 0 ? Infinity : 0;
  }

  /**
   * Calculate profit factor by time period
   */
  static calculateProfitFactorByPeriod(
    trades: BacktestTrade[],
    periodMs: number
  ): Array<{ period: string; profitFactor: number; trades: number }> {
    if (trades.length === 0) return [];

    // Group trades by time period
    const periods = new Map<number, BacktestTrade[]>();

    for (const trade of trades) {
      const periodKey = Math.floor(trade.timestamp / periodMs) * periodMs;
      if (!periods.has(periodKey)) {
        periods.set(periodKey, []);
      }
      periods.get(periodKey)!.push(trade);
    }

    // Calculate profit factor for each period
    const results: Array<{ period: string; profitFactor: number; trades: number }> = [];

    for (const [periodKey, periodTrades] of periods) {
      const profits = periodTrades
        .filter(trade => trade.profit !== undefined)
        .map(trade => trade.profit!);

      const grossProfit = profits.filter(p => p > 0).reduce((sum, p) => sum + p, 0);
      const grossLoss = Math.abs(profits.filter(p => p < 0).reduce((sum, p) => sum + p, 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

      results.push({
        period: new Date(periodKey).toISOString(),
        profitFactor,
        trades: periodTrades.length,
      });
    }

    return results.sort((a, b) => a.period.localeCompare(b.period));
  }
}
