#!/usr/bin/env node

/**
 * GridBot - Advanced Grid Trading Bot for Binance
 * 
 * This is the main entry point for the GridBot application.
 * It handles CLI arguments, configuration loading, and bot lifecycle management.
 */

import { createGridBot } from './models/GridBot';
import { Logger } from './utils/logger';
import { ConfigError } from './utils/errors';
import * as path from 'path';
import * as process from 'process';

/**
 * CLI argument interface
 */
interface CliArgs {
  config?: string;
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  testConnection?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (!arg) continue;
    
    switch (arg) {
      case '-c':
      case '--config':
        const configValue = argv[++i];
        if (configValue) {
          args.config = configValue;
        }
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--test-connection':
        args.testConnection = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return args;
}

/**
 * Display help message
 */
function showHelp(): void {
  console.log(`
GridBot - Advanced Grid Trading Bot for Binance

Usage: npm start [options]

Options:
  -c, --config <path>     Path to configuration file (default: ./config/config.json)
  -h, --help             Show this help message
  -v, --version          Show version information
  --verbose              Enable verbose logging
  --test-connection      Test Binance API connection and exit

Examples:
  npm start                              # Use default configuration
  npm start -- --config ./my-config.json  # Use custom configuration file
  npm start -- --verbose                  # Enable verbose logging
  npm start -- --test-connection          # Test API connection

Configuration:
  The bot requires a configuration file with Binance API credentials and trading settings.
  Copy config/config.example.json to config/config.json and update with your settings.

For more information, visit: https://github.com/yourusername/GridBot
`);
}

/**
 * Display version information
 */
function showVersion(): void {
  try {
    const packageJson = require('../package.json');
    console.log(`GridBot v${packageJson.version}`);
    console.log(`Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
  } catch (error) {
    console.log('GridBot v1.0.0');
    console.log(`Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
  }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  
  // Handle help and version flags
  if (args.help) {
    showHelp();
    return;
  }
  
  if (args.version) {
    showVersion();
    return;
  }

  // Initialize logger
  const logger = Logger.getInstance();
  
  if (args.verbose) {
    logger.info('Verbose logging enabled');
  }

  try {
    logger.info('Starting GridBot...');
    
    // Determine configuration file path
    const configPath = args.config || path.join(process.cwd(), 'config');
    logger.info(`Using configuration path: ${configPath}`);
    
    // Create GridBot instance
    const gridBot = await createGridBot(configPath);
    
    // Handle test connection flag
    if (args.testConnection) {
      logger.info('Testing Binance API connection...');
      
      try {
        await gridBot.start();
        const status = gridBot.getStatus();
        
        logger.info('Connection test successful!', {
          activeSymbols: status.activeSymbols.length,
          isRunning: status.isRunning
        });
        
        await gridBot.stop();
        console.log('✅ Binance API connection test passed');
        process.exit(0);
      } catch (error) {
        logger.error('Connection test failed', { error });
        console.error('❌ Binance API connection test failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
    
    // Setup graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await gridBot.stop();
        logger.info('GridBot stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });
    
    // Start the bot
    await gridBot.start();
    
    // Log startup success
    const status = gridBot.getStatus();
    logger.info('GridBot started successfully!', {
      activeSymbols: status.activeSymbols,
      startTime: new Date(status.startTime).toISOString()
    });
    
    // Setup periodic status reporting
    const statusInterval = setInterval(() => {
      const currentStatus = gridBot.getStatus();
      const report = gridBot.getProfitLossReport();
      
      logger.info('GridBot Status Report', {
        uptime: Math.round((Date.now() - currentStatus.startTime) / 1000 / 60), // minutes
        totalTrades: currentStatus.totalTrades,
        totalProfit: report.totalProfit.toFixed(2),
        activeSymbols: currentStatus.activeSymbols.length,
        errors: currentStatus.errors.length
      });
      
      // Log symbol breakdown
      for (const symbolData of report.symbolBreakdown) {
        logger.info(`Symbol: ${symbolData.symbol}`, {
          profit: symbolData.profit.toFixed(2),
          trades: symbolData.trades,
          winRate: symbolData.winRate.toFixed(1) + '%'
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Keep the process running
    process.on('exit', () => {
      clearInterval(statusInterval);
    });
    
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error('Configuration error', { error: error.message });
      console.error('❌ Configuration Error:', error.message);
      console.error('Please check your configuration file and try again.');
    } else {
      logger.error('Failed to start GridBot', { error });
      console.error('❌ Failed to start GridBot:', error instanceof Error ? error.message : String(error));
    }
    
    process.exit(1);
  }
}

// Handle module being run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main, parseArgs, showHelp, showVersion };
export default main;
