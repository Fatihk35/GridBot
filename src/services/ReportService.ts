/**
 * Report Service for Backtesting Results
 * Handles saving and formatting of backtest reports in various formats
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { Logger } from '@/utils/logger';
import {
  BacktestResult,
  BacktestTrade,
  PortfolioSnapshot,
  ReportOptions,
  SymbolPerformance,
  MarketDataStats,
  BacktestTradeSchema,
  PortfolioSnapshotSchema,
} from '@/types/backtest';

/**
 * Transaction log entry schema for validation
 */
const TransactionLogSchema = z.object({
  time: z.number().int().positive(),
  type: z.enum([
    'ORDER_CREATED',
    'ORDER_FILLED',
    'ORDER_CANCELED',
    'POSITION_OPENED',
    'POSITION_CLOSED',
  ]),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']).optional(),
  price: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  orderId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type TransactionLogEntry = z.infer<typeof TransactionLogSchema>;

/**
 * Status report schema for validation
 */
const StatusReportSchema = z.object({
  time: z.number().int().positive(),
  mode: z.enum(['backtest', 'papertrade', 'live']),
  balances: z.record(z.string(), z.number()),
  openOrders: z
    .array(
      z.object({
        id: z.string(),
        symbol: z.string(),
        side: z.enum(['BUY', 'SELL']),
        price: z.number(),
        quantity: z.number(),
        status: z.string(),
      })
    )
    .optional(),
  performance: z
    .object({
      totalReturn: z.number(),
      drawdown: z.number(),
      trades: z.number(),
    })
    .optional(),
});

type StatusReport = z.infer<typeof StatusReportSchema>;

/**
 * Service for generating and saving trading reports
 */
export class ReportService {
  private logger: Logger;
  private reportDirectory: string;

  constructor(reportDirectory: string, logger?: Logger) {
    this.reportDirectory = reportDirectory;
    this.logger = logger || Logger.getInstance();
  }

  /**
   * Save comprehensive backtest report
   */
  async saveBacktestReport(
    result: BacktestResult,
    options: Partial<ReportOptions> = {}
  ): Promise<string> {
    try {
      const reportOptions: ReportOptions = {
        format: 'json',
        includeCharts: false,
        includeTrades: true,
        includePortfolioHistory: true,
        includeSymbolBreakdown: true,
        ...options,
      };

      // Ensure report directory exists
      await this.ensureDirectoryExists(this.reportDirectory);
      await this.ensureDirectoryExists(path.join(this.reportDirectory, 'backtests'));

      const timestamp = new Date(result.createdAt).toISOString().replace(/[:.]/g, '-');
      const baseFileName = `backtest_${result.id}_${timestamp}`;

      let filePath: string;

      switch (reportOptions.format) {
        case 'json':
          filePath = await this.saveJsonReport(result, baseFileName, reportOptions);
          break;
        case 'csv':
          filePath = await this.saveCsvReport(result, baseFileName, reportOptions);
          break;
        case 'html':
          filePath = await this.saveHtmlReport(result, baseFileName, reportOptions);
          break;
        default:
          throw new Error(`Unsupported report format: ${reportOptions.format}`);
      }

      this.logger.info(`Backtest report saved: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error('Failed to save backtest report:', error);
      throw error;
    }
  }

  /**
   * Save JSON format report
   */
  private async saveJsonReport(
    result: BacktestResult,
    baseFileName: string,
    options: ReportOptions
  ): Promise<string> {
    const filePath = path.join(this.reportDirectory, 'backtests', `${baseFileName}.json`);

    // Create report object based on options
    const reportData = this.createReportData(result, options);

    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf8');
    return filePath;
  }

  /**
   * Save CSV format report
   */
  private async saveCsvReport(
    result: BacktestResult,
    baseFileName: string,
    options: ReportOptions
  ): Promise<string> {
    const csvDir = path.join(this.reportDirectory, 'backtests', baseFileName);
    await this.ensureDirectoryExists(csvDir);

    // Save summary CSV
    const summaryPath = path.join(csvDir, 'summary.csv');
    await this.saveSummaryCsv(result, summaryPath);

    // Save trades CSV if requested
    if (options.includeTrades && result.trades.length > 0) {
      const tradesPath = path.join(csvDir, 'trades.csv');
      await this.saveTradesCsv(result.trades, tradesPath);
    }

    // Save portfolio history CSV if requested
    if (options.includePortfolioHistory && result.portfolioHistory.length > 0) {
      const portfolioPath = path.join(csvDir, 'portfolio_history.csv');
      await this.savePortfolioHistoryCsv(result.portfolioHistory, portfolioPath);
    }

    // Save symbol performance CSV if requested
    if (options.includeSymbolBreakdown && result.symbolPerformance.size > 0) {
      const symbolsPath = path.join(csvDir, 'symbol_performance.csv');
      await this.saveSymbolPerformanceCsv(result.symbolPerformance, symbolsPath);
    }

    return csvDir;
  }

  /**
   * Save HTML format report
   */
  private async saveHtmlReport(
    result: BacktestResult,
    baseFileName: string,
    options: ReportOptions
  ): Promise<string> {
    const filePath = path.join(this.reportDirectory, 'backtests', `${baseFileName}.html`);

    const htmlContent = this.generateHtmlReport(result, options);
    await fs.writeFile(filePath, htmlContent, 'utf8');

    return filePath;
  }

  /**
   * Log transaction to file
   */
  async logTransaction(entry: TransactionLogEntry): Promise<void> {
    try {
      // Validate entry
      TransactionLogSchema.parse(entry);

      const logDir = path.join(this.reportDirectory, 'transactions');
      await this.ensureDirectoryExists(logDir);

      const date = new Date(entry.time).toISOString().split('T')[0];
      const logFile = path.join(logDir, `transactions_${date}.jsonl`);

      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(logFile, logLine, 'utf8');
    } catch (error) {
      this.logger.error('Failed to log transaction:', error);
      throw error;
    }
  }

  /**
   * Save status report
   */
  async saveStatusReport(report: StatusReport, mode: string): Promise<void> {
    try {
      // Validate report
      StatusReportSchema.parse({ ...report, mode });

      const statusDir = path.join(this.reportDirectory, 'status');
      await this.ensureDirectoryExists(statusDir);

      const timestamp = new Date(report.time).toISOString().replace(/[:.]/g, '-');
      const fileName = `status_${mode}_${timestamp}.json`;
      const filePath = path.join(statusDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
    } catch (error) {
      this.logger.error('Failed to save status report:', error);
      throw error;
    }
  }

  /**
   * Save final report for trading session
   */
  async saveFinalReport(report: any, mode: string): Promise<void> {
    try {
      const finalDir = path.join(this.reportDirectory, 'final');
      await this.ensureDirectoryExists(finalDir);

      const timestamp = new Date(report.endTime || Date.now()).toISOString().replace(/[:.]/g, '-');
      const fileName = `final_${mode}_${timestamp}.json`;
      const filePath = path.join(finalDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
      this.logger.info(`Final report saved: ${filePath}`);
    } catch (error) {
      this.logger.error('Failed to save final report:', error);
      throw error;
    }
  }

  /**
   * Create report data object based on options
   */
  private createReportData(result: BacktestResult, options: ReportOptions): any {
    const reportData: any = {
      metadata: {
        id: result.id,
        createdAt: result.createdAt,
        version: result.version,
        config: result.config,
        executionTimeMs: result.executionTimeMs,
        dataPointsProcessed: result.dataPointsProcessed,
        errorsEncountered: result.errorsEncountered,
      },
      summary: {
        startTime: result.startTime,
        endTime: result.endTime,
        duration: result.duration,
        initialBalance: result.initialBalance,
        finalBalance: result.finalBalance,
        totalReturn: result.totalReturn,
        totalReturnPercentage: result.totalReturnPercentage,
        annualizedReturn: result.annualizedReturn,
        maxDrawdown: result.maxDrawdown,
        maxDrawdownPercentage: result.maxDrawdownPercentage,
        maxDrawdownDuration: result.maxDrawdownDuration,
        volatility: result.volatility,
        sharpeRatio: result.sharpeRatio,
        sortinoRatio: result.sortinoRatio,
        calmarRatio: result.calmarRatio,
        totalTrades: result.totalTrades,
        overallWinRate: result.overallWinRate,
        totalCommission: result.totalCommission,
        totalSlippage: result.totalSlippage,
      },
    };

    if (options.includeSymbolBreakdown) {
      reportData.symbolPerformance = Object.fromEntries(result.symbolPerformance);
    }

    if (options.includeTrades) {
      reportData.trades = result.trades;
    }

    if (options.includePortfolioHistory) {
      reportData.portfolioHistory = result.portfolioHistory;
    }

    return reportData;
  }

  /**
   * Save summary information as CSV
   */
  private async saveSummaryCsv(result: BacktestResult, filePath: string): Promise<void> {
    const headers = ['Metric', 'Value', 'Unit'];

    const rows = [
      ['Start Time', new Date(result.startTime).toISOString(), 'timestamp'],
      ['End Time', new Date(result.endTime).toISOString(), 'timestamp'],
      ['Duration', (result.duration / (1000 * 60 * 60 * 24)).toFixed(2), 'days'],
      [
        'Initial Balance',
        result.initialBalance.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
      [
        'Final Balance',
        result.finalBalance.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
      [
        'Total Return',
        result.totalReturn.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
      ['Total Return %', result.totalReturnPercentage.toFixed(2), '%'],
      ['Annualized Return %', result.annualizedReturn.toFixed(2), '%'],
      [
        'Max Drawdown',
        result.maxDrawdown.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
      ['Max Drawdown %', result.maxDrawdownPercentage.toFixed(2), '%'],
      ['Volatility %', result.volatility.toFixed(2), '%'],
      ['Sharpe Ratio', result.sharpeRatio.toFixed(4), 'ratio'],
      ['Sortino Ratio', result.sortinoRatio.toFixed(4), 'ratio'],
      ['Calmar Ratio', result.calmarRatio.toFixed(4), 'ratio'],
      ['Total Trades', result.totalTrades.toString(), 'count'],
      ['Win Rate %', result.overallWinRate.toFixed(2), '%'],
      [
        'Total Commission',
        result.totalCommission.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
      [
        'Total Slippage',
        result.totalSlippage.toFixed(8),
        result.config.symbols[0]?.split('/')[1] || 'USDT',
      ],
    ];

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    await fs.writeFile(filePath, csvContent, 'utf8');
  }

  /**
   * Save trades as CSV
   */
  private async saveTradesCsv(trades: BacktestTrade[], filePath: string): Promise<void> {
    if (trades.length === 0) return;

    const headers = [
      'ID',
      'Timestamp',
      'Date',
      'Symbol',
      'Side',
      'Type',
      'Price',
      'Quantity',
      'Value',
      'Commission',
      'Profit',
      'Grid Level',
      'Execution Price',
      'Slippage',
    ];

    const rows = trades.map(trade => [
      trade.id,
      trade.timestamp.toString(),
      new Date(trade.timestamp).toISOString(),
      trade.symbol,
      trade.side,
      trade.type,
      trade.price.toFixed(8),
      trade.quantity.toFixed(8),
      trade.value.toFixed(8),
      trade.commission.toFixed(8),
      trade.profit?.toFixed(8) || '',
      trade.gridLevel.toFixed(8),
      trade.executionPrice.toFixed(8),
      trade.slippage.toFixed(8),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    await fs.writeFile(filePath, csvContent, 'utf8');
  }

  /**
   * Save portfolio history as CSV
   */
  private async savePortfolioHistoryCsv(
    portfolioHistory: PortfolioSnapshot[],
    filePath: string
  ): Promise<void> {
    if (portfolioHistory.length === 0) return;

    // Get all unique base currencies
    const allBaseCurrencies = new Set<string>();
    portfolioHistory.forEach(snapshot => {
      Object.keys(snapshot.baseBalances).forEach(currency => {
        allBaseCurrencies.add(currency);
      });
    });

    const headers = [
      'Timestamp',
      'Date',
      'Total Value',
      'Quote Balance',
      'Unrealized PnL',
      'Realized PnL',
      'Drawdown',
      'Drawdown %',
      ...Array.from(allBaseCurrencies),
    ];

    const rows = portfolioHistory.map(snapshot => [
      snapshot.timestamp.toString(),
      new Date(snapshot.timestamp).toISOString(),
      snapshot.totalValue.toFixed(8),
      snapshot.quoteBalance.toFixed(8),
      snapshot.unrealizedPnL.toFixed(8),
      snapshot.realizedPnL.toFixed(8),
      snapshot.drawdown.toFixed(8),
      (snapshot.drawdownPercentage * 100).toFixed(2),
      ...Array.from(allBaseCurrencies).map(currency =>
        (snapshot.baseBalances[currency] || 0).toFixed(8)
      ),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    await fs.writeFile(filePath, csvContent, 'utf8');
  }

  /**
   * Save symbol performance as CSV
   */
  private async saveSymbolPerformanceCsv(
    symbolPerformance: Map<string, SymbolPerformance>,
    filePath: string
  ): Promise<void> {
    if (symbolPerformance.size === 0) return;

    const headers = [
      'Symbol',
      'Total Trades',
      'Buy Trades',
      'Sell Trades',
      'Winning Trades',
      'Losing Trades',
      'Win Rate %',
      'Gross Profit',
      'Gross Loss',
      'Net Profit',
      'Net Profit %',
      'Total Commission',
      'Average Win',
      'Average Loss',
      'Largest Win',
      'Largest Loss',
      'Profit Factor',
      'Sharpe Ratio',
      'Max Consecutive Wins',
      'Max Consecutive Losses',
      'Average Trade Size',
      'Total Volume',
      'Holding Period Return %',
    ];

    const rows = Array.from(symbolPerformance.values()).map(perf => [
      perf.symbol,
      perf.totalTrades.toString(),
      perf.buyTrades.toString(),
      perf.sellTrades.toString(),
      perf.winningTrades.toString(),
      perf.losingTrades.toString(),
      perf.winRate.toFixed(2),
      perf.grossProfit.toFixed(8),
      perf.grossLoss.toFixed(8),
      perf.netProfit.toFixed(8),
      perf.netProfitPercentage.toFixed(2),
      perf.totalCommission.toFixed(8),
      perf.averageWin.toFixed(8),
      perf.averageLoss.toFixed(8),
      perf.largestWin.toFixed(8),
      perf.largestLoss.toFixed(8),
      perf.profitFactor === Infinity ? 'Infinity' : perf.profitFactor.toFixed(4),
      perf.sharpeRatio.toFixed(4),
      perf.maxConsecutiveWins.toString(),
      perf.maxConsecutiveLosses.toString(),
      perf.averageTradeSize.toFixed(8),
      perf.totalVolume.toFixed(8),
      perf.holdingPeriodReturn.toFixed(2),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    await fs.writeFile(filePath, csvContent, 'utf8');
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(result: BacktestResult, options: ReportOptions): string {
    const symbolCount = result.symbolPerformance.size;
    const bestSymbol = Array.from(result.symbolPerformance.values()).reduce((best, current) =>
      current.netProfit > best.netProfit ? current : best
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backtest Report - ${result.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background-color: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .metric-label { font-weight: bold; color: #666; font-size: 14px; }
        .metric-value { font-size: 18px; color: #333; margin-top: 5px; }
        .positive { color: #28a745; }
        .negative { color: #dc3545; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .config-item { margin: 5px 0; }
        .config-label { font-weight: bold; display: inline-block; width: 200px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>GridBot Backtest Report</h1>
            <p><strong>Report ID:</strong> ${result.id}</p>
            <p><strong>Generated:</strong> ${new Date(result.createdAt).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${(result.duration / (1000 * 60 * 60 * 24)).toFixed(1)} days</p>
        </div>

        <div class="section">
            <div class="section-title">Performance Summary</div>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Total Return</div>
                    <div class="metric-value ${result.totalReturn >= 0 ? 'positive' : 'negative'}">
                        ${result.totalReturn.toFixed(8)} (${result.totalReturnPercentage.toFixed(2)}%)
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Annualized Return</div>
                    <div class="metric-value ${result.annualizedReturn >= 0 ? 'positive' : 'negative'}">
                        ${result.annualizedReturn.toFixed(2)}%
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Max Drawdown</div>
                    <div class="metric-value negative">
                        ${result.maxDrawdown.toFixed(8)} (${result.maxDrawdownPercentage.toFixed(2)}%)
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Sharpe Ratio</div>
                    <div class="metric-value">
                        ${result.sharpeRatio.toFixed(4)}
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Trades</div>
                    <div class="metric-value">
                        ${result.totalTrades} (${result.overallWinRate.toFixed(1)}% win rate)
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Commission & Slippage</div>
                    <div class="metric-value negative">
                        ${(result.totalCommission + result.totalSlippage).toFixed(8)}
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Configuration</div>
            <div class="config-item">
                <span class="config-label">Symbols:</span>
                ${result.config.symbols.join(', ')}
            </div>
            <div class="config-item">
                <span class="config-label">Initial Balance:</span>
                ${result.config.initialBalance}
            </div>
            <div class="config-item">
                <span class="config-label">Interval:</span>
                ${result.config.interval}
            </div>
            <div class="config-item">
                <span class="config-label">Slippage:</span>
                ${(result.config.slippagePercentage * 100).toFixed(3)}%
            </div>
        </div>

        ${
          options.includeSymbolBreakdown && symbolCount > 0
            ? `
        <div class="section">
            <div class="section-title">Symbol Performance</div>
            <table>
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Net Profit</th>
                        <th>Profit %</th>
                        <th>Max Win</th>
                        <th>Max Loss</th>
                        <th>Profit Factor</th>
                    </tr>
                </thead>
                <tbody>
                    ${Array.from(result.symbolPerformance.values())
                      .map(
                        perf => `
                    <tr>
                        <td><strong>${perf.symbol}</strong></td>
                        <td>${perf.totalTrades}</td>
                        <td>${perf.winRate.toFixed(1)}%</td>
                        <td class="${perf.netProfit >= 0 ? 'positive' : 'negative'}">${perf.netProfit.toFixed(8)}</td>
                        <td class="${perf.netProfitPercentage >= 0 ? 'positive' : 'negative'}">${perf.netProfitPercentage.toFixed(2)}%</td>
                        <td class="positive">${perf.largestWin.toFixed(8)}</td>
                        <td class="negative">${perf.largestLoss.toFixed(8)}</td>
                        <td>${perf.profitFactor === Infinity ? '∞' : perf.profitFactor.toFixed(2)}</td>
                    </tr>
                    `
                      )
                      .join('')}
                </tbody>
            </table>
        </div>
        `
            : ''
        }

        <div class="section">
            <div class="section-title">Execution Details</div>
            <div class="config-item">
                <span class="config-label">Execution Time:</span>
                ${result.executionTimeMs.toLocaleString()}ms
            </div>
            <div class="config-item">
                <span class="config-label">Data Points Processed:</span>
                ${result.dataPointsProcessed.toLocaleString()}
            </div>
            <div class="config-item">
                <span class="config-label">Errors Encountered:</span>
                ${result.errorsEncountered.length}
            </div>
            ${
              result.errorsEncountered.length > 0
                ? `
            <div class="config-item">
                <span class="config-label">Error Details:</span>
                <ul>
                    ${result.errorsEncountered.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
            `
                : ''
            }
        </div>
    </div>
</body>
</html>
    `.trim();
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get list of available backtest reports
   */
  async getBacktestReports(): Promise<Array<{ id: string; date: string; path: string }>> {
    try {
      const backtestDir = path.join(this.reportDirectory, 'backtests');

      try {
        const files = await fs.readdir(backtestDir);
        const reports = files
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const match = file.match(
              /backtest_(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json/
            );
            if (match && match[1] && match[2]) {
              return {
                id: match[1],
                date: match[2].replace(/-/g, ':').replace('T', 'T').replace('Z', 'Z'),
                path: path.join(backtestDir, file),
              };
            }
            return null;
          })
          .filter(report => report !== null)
          .sort((a, b) => b!.date.localeCompare(a!.date));

        return reports as Array<{ id: string; date: string; path: string }>;
      } catch {
        return [];
      }
    } catch (error) {
      this.logger.error('Failed to get backtest reports:', error);
      return [];
    }
  }
}
