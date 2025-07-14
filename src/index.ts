/**
 * GridBot - TypeScript Grid Trading Bot for Binance
 * 
 * Main entry point for the application
 */

import { ConfigLoader } from '@/config/ConfigLoader';
import { Logger } from '@/utils/logger';
import { BotConfigType } from '@/config/schema';

/**
 * Main application class
 */
export class GridBot {
  private config: BotConfigType | null = null;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Initialize the bot with configuration
   * @param configPath - Path to configuration file
   */
  public async initialize(configPath: string = './config/config.json'): Promise<void> {
    try {
      this.logger.info('Initializing GridBot...');
      
      // Load configuration
      const configLoader = new ConfigLoader();
      this.config = await configLoader.loadConfig();
      
      // Update logger with configuration
      // this.logger.updateConfig(this.config.logging);
      
      this.logger.info('GridBot initialized successfully', {
        tradeMode: this.config.tradeMode,
        exchange: this.config.exchange,
        symbolsCount: this.config.symbols.length,
      });
    } catch (error) {
      this.logger.error('Failed to initialize GridBot', error);
      throw error;
    }
  }

  /**
   * Start the bot
   */
  public async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }

    this.logger.info('Starting GridBot...', {
      tradeMode: this.config.tradeMode,
      symbols: this.config.symbols.map(s => s.pair),
    });

    try {
      switch (this.config.tradeMode) {
        case 'backtest':
          await this.startBacktest();
          break;
        case 'papertrade':
          await this.startPaperTrade();
          break;
        case 'live':
          await this.startLiveTrading();
          break;
        default:
          throw new Error(`Unsupported trade mode: ${this.config.tradeMode}`);
      }
    } catch (error) {
      this.logger.error('Failed to start GridBot', error);
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping GridBot...');
    // Implementation will be added in future tasks
    this.logger.info('GridBot stopped');
  }

  /**
   * Start backtesting mode
   * @private
   */
  private async startBacktest(): Promise<void> {
    this.logger.info('Starting backtest mode...');
    // Implementation will be added in task 4
    throw new Error('Backtest mode not yet implemented');
  }

  /**
   * Start paper trading mode
   * @private
   */
  private async startPaperTrade(): Promise<void> {
    this.logger.info('Starting paper trade mode...');
    // Implementation will be added in task 5
    throw new Error('Paper trade mode not yet implemented');
  }

  /**
   * Start live trading mode
   * @private
   */
  private async startLiveTrading(): Promise<void> {
    this.logger.info('Starting live trading mode...');
    // Implementation will be added in future tasks
    throw new Error('Live trading mode not yet implemented');
  }

  /**
   * Get current configuration
   * @returns Current bot configuration
   */
  public getConfig(): BotConfigType | null {
    return this.config;
  }
}

/**
 * Entry point when running directly
 */
async function main(): Promise<void> {
  const bot = new GridBot();
  
  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('GridBot failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default GridBot;
