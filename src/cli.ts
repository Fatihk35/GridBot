#!/usr/bin/env node

/**
 * GridBot CLI Interface
 * 
 * Command-line interface for the GridBot application.
 * Provides commands for different trading modes and configuration options.
 * 
 * Usage:
 *   gridbot [command] [options]
 * 
 * Commands:
 *   start     Start the GridBot application
 *   backtest  Run a backtest simulation
 *   status    Show application status
 *   version   Show version information
 */

import { Command } from 'commander';
import { GridBotApp, AppOptions, AppState } from './GridBotApp';
import { Logger } from './utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * CLI version and package information
 */
const packageJsonPath = path.join(__dirname, '..', 'package.json');

/**
 * Get package version
 */
async function getVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Display banner
 */
function displayBanner(): void {
  console.log(`
╔═══════════════════════════════════════╗
║              GridBot                  ║
║      Advanced Grid Trading Bot        ║
║           for Binance                 ║
╚═══════════════════════════════════════╝
`);
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
GridBot - Advanced Grid Trading Bot for Binance

USAGE:
  gridbot [command] [options]

COMMANDS:
  start                    Start the GridBot application
  backtest                 Run a backtest simulation
  status                   Show application status
  version                  Show version information
  help                     Show this help message

OPTIONS:
  -c, --config <path>      Path to configuration file (default: ./config/config.json)
  -m, --mode <mode>        Trading mode: backtest, papertrade, live
  -s, --start-date <date>  Start date for backtest (YYYY-MM-DD)
  -e, --end-date <date>    End date for backtest (YYYY-MM-DD)
  -v, --verbose            Enable verbose logging
  -d, --dry-run            Enable dry run mode (simulation only)
  -h, --help               Show help for command

EXAMPLES:
  # Start in paper trading mode
  gridbot start --mode papertrade --verbose

  # Run a backtest for the last 30 days
  gridbot backtest --start-date 2024-01-01 --end-date 2024-01-31

  # Start live trading with custom config
  gridbot start --config ./my-config.json --mode live

  # Check application status
  gridbot status

CONFIGURATION:
  The bot requires a configuration file (default: ./config/config.json).
  Copy config.example.json to config.json and customize your settings.

For more information, visit: https://github.com/Fatihk35/GridBot
`);
}

/**
 * Handle errors and exit gracefully
 */
function handleError(error: Error, exitCode: number = 1): void {
  const logger = Logger.getInstance();
  logger.error('CLI Error:', error);
  
  if (error.message.includes('Configuration')) {
    console.error(`
❌ Configuration Error: ${error.message}

Please check your configuration file and ensure all required fields are set.
Copy config.example.json to config.json and customize your settings.
`);
  } else if (error.message.includes('API')) {
    console.error(`
❌ API Error: ${error.message}

Please check your API credentials and network connection.
`);
  } else {
    console.error(`
❌ Error: ${error.message}

Run 'gridbot help' for usage information.
`);
  }
  
  process.exit(exitCode);
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const logger = Logger.getInstance();
  
  try {
    const version = await getVersion();
    const program = new Command();

    program
      .name('gridbot')
      .description('Advanced Grid Trading Bot for Binance')
      .version(version, '-V, --version', 'Show version information');

    // Global options
    program
      .option('-c, --config <path>', 'Path to configuration file', './config')
      .option('-v, --verbose', 'Enable verbose logging', false);

    // Start command
    program
      .command('start')
      .description('Start the GridBot application')
      .option('-m, --mode <mode>', 'Trading mode: backtest, papertrade, live')
      .option('-d, --dry-run', 'Enable dry run mode', false)
      .action(async (options) => {
        try {
          displayBanner();
          console.log('🚀 Starting GridBot...\n');

          const globalOptions = program.opts();
          const appOptions: AppOptions = {
            configPath: globalOptions.config,
            mode: options.mode,
            verbose: globalOptions.verbose || options.verbose,
            dryRun: options.dryRun,
          };

          const app = new GridBotApp(appOptions);
          
          // Setup event handlers
          app.on('initialized', () => {
            console.log('✅ GridBot initialized successfully');
          });

          app.on('started', () => {
            console.log('✅ GridBot started successfully');
            console.log('Press Ctrl+C to stop gracefully...');
          });

          app.on('stopped', () => {
            console.log('✅ GridBot stopped successfully');
          });

          app.on('error', (error) => {
            console.error('❌ GridBot error:', error.message);
          });

          app.on('stateChanged', ({ from, to }) => {
            logger.info(`State changed: ${from} → ${to}`);
          });

          // Initialize and start the application
          await app.initialize();
          await app.start();

          // Keep the process alive for continuous trading modes
          if (app.getState() === AppState.RUNNING) {
            // The application will handle its own lifecycle
            // Process will remain alive until manually stopped
          }

        } catch (error) {
          handleError(error as Error);
        }
      });

    // Backtest command
    program
      .command('backtest')
      .description('Run a backtest simulation')
      .option('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
      .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
      .action(async (options) => {
        try {
          displayBanner();
          console.log('📊 Running Backtest...\n');

          const globalOptions = program.opts();
          const appOptions: AppOptions = {
            configPath: globalOptions.config,
            mode: 'backtest',
            startDate: options.startDate,
            endDate: options.endDate,
            verbose: globalOptions.verbose,
          };

          const app = new GridBotApp(appOptions);
          
          // Setup event handlers for backtest
          app.on('initialized', () => {
            console.log('✅ Backtest environment initialized');
          });

          app.on('started', () => {
            console.log('✅ Backtest started');
          });

          app.on('stopped', () => {
            console.log('✅ Backtest completed');
            console.log('📊 Check the reports directory for detailed results');
          });

          app.on('error', (error) => {
            console.error('❌ Backtest error:', error.message);
          });

          await app.initialize();
          await app.start();

        } catch (error) {
          handleError(error as Error);
        }
      });

    // Status command
    program
      .command('status')
      .description('Show application status')
      .action(async () => {
        try {
          const globalOptions = program.opts();
          const appOptions: AppOptions = {
            configPath: globalOptions.config,
            verbose: globalOptions.verbose,
          };

          const app = new GridBotApp(appOptions);
          await app.initialize();
          
          const status = app.getHealthStatus();
          
          console.log('📊 GridBot Status:\n');
          console.log(`State: ${status.state}`);
          console.log(`Uptime: ${Math.floor(status.uptime)} seconds`);
          console.log(`Memory Usage: ${Math.round(status.memoryUsage.heapUsed / 1024 / 1024)} MB`);
          
          if (status.config) {
            console.log(`\n📝 Configuration:`);
            console.log(`Trade Mode: ${status.config.tradeMode}`);
            console.log(`Exchange: ${status.config.exchange}`);
            console.log(`Symbols: ${status.config.symbolsCount}`);
          }
          
          console.log(`\n🔧 Services:`);
          console.log(`Binance: ${status.services.binance ? '✅' : '❌'}`);
          console.log(`Strategy: ${status.services.strategy ? '✅' : '❌'}`);
          console.log(`Notifications: ${status.services.notifications ? '✅' : '❌'}`);
          console.log(`Reports: ${status.services.reports ? '✅' : '❌'}`);
          
          if (status.activeTrader) {
            console.log(`\n🏃 Active Trader: ${status.activeTrader}`);
          }

        } catch (error) {
          handleError(error as Error);
        }
      });

    // Help command
    program
      .command('help')
      .description('Show detailed help information')
      .action(() => {
        displayHelp();
      });

    // Handle unknown commands
    program.on('command:*', (unknownCommands) => {
      console.error(`❌ Unknown command: ${unknownCommands.join(' ')}`);
      console.log('Run "gridbot help" for available commands.');
      process.exit(1);
    });

    // Parse command line arguments
    if (process.argv.length <= 2) {
      displayHelp();
      process.exit(0);
    }

    await program.parseAsync(process.argv);

  } catch (error) {
    handleError(error as Error);
  }
}

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    handleError(error);
  });
}

export { main as runCLI };
