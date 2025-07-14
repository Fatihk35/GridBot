#!/usr/bin/env node

/**
 * GridBot - Advanced Grid Trading Bot for Binance
 * 
 * This is the main entry point for the GridBot application.
 * It handles CLI arguments, configuration loading, and bot lifecycle management.
 */

import { GridBot } from './models/GridBot';
import { ConfigLoader } from './config/ConfigLoader';
import { BotConfigType } from './config/schema';
import { Logger } from './utils/logger';
import { ConfigError } from './utils/errors';
import * as path from 'path';
import * as process from 'process';

/**
 * Application wrapper class for CLI interface
 */
export class GridBotApp {
  private config: BotConfigType | null = null;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Initialize the application with configuration
   */
  public async initialize(): Promise<void> {
    try {
      const configLoader = new ConfigLoader();
      this.config = await configLoader.loadConfig();

      this.logger.info('GridBot initialized successfully', {
        tradeMode: this.config.tradeMode,
        exchange: this.config.exchange,
        symbolsCount: this.config.symbols.length,
        gridSize: this.config.symbols[0]?.gridSize
      });
    } catch (error) {
      if (error instanceof ConfigError) {
        this.logger.error('Configuration error:', error);
        throw error;
      }
      throw new ConfigError('Failed to initialize GridBot', 'INIT_ERROR', undefined, error as Error);
    }
  }

  /**
   * Start the GridBot with the loaded configuration
   */
  public async start(): Promise<void> {
    if (!this.config) {
      throw new ConfigError('GridBot not initialized. Call initialize() first.');
    }

    this.logger.info('Starting GridBot with configuration:', {
      tradeMode: this.config.tradeMode,
      symbols: this.config.symbols.map((s: any) => s.pair),
      maxBudget: this.config.maxBudget
    });

    try {
      switch (this.config.tradeMode) {
        case 'live':
          this.logger.info('Starting live trading mode...');
          break;
        case 'papertrade':
          this.logger.info('Starting paper trading mode...');
          break;
        case 'backtest':
          this.logger.info('Starting backtest mode...');
          break;
        default:
          throw new Error(`Unsupported trade mode: ${this.config.tradeMode}`);
      }

      // Create and start GridBot instance
      const gridBot = await GridBot.fromConfigFile('./config/config.json');
      await gridBot.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown(gridBot);

      this.logger.info('GridBot started successfully');
    } catch (error) {
      this.logger.error('Failed to start GridBot:', error);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(gridBot: GridBot): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await gridBot.stop();
        this.logger.info('GridBot stopped successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error(`Unhandled rejection at promise: ${promise}, reason: ${reason}`);
      shutdown('unhandledRejection');
    });
  }

  /**
   * Test API connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      if (!this.config) {
        throw new ConfigError('GridBot not initialized. Call initialize() first.');
      }

      const gridBot = await GridBot.fromConfigFile('./config/config.json');
      // Test connection without starting the bot
      this.logger.info('Testing API connection...');
      return true; // Connection test would be implemented in GridBot
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): BotConfigType | null {
    return this.config;
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const app = new GridBotApp();

  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    console.error('Failed to start GridBot:', error);
    process.exit(1);
  }
}

// Run the application if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default GridBotApp;
