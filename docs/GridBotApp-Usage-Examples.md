# GridBot Application Usage Examples

This document provides comprehensive examples of how to use the GridBot application and CLI interface.

## Table of Contents

- [CLI Interface Examples](#cli-interface-examples)
- [Programmatic Usage Examples](#programmatic-usage-examples)
- [Configuration Examples](#configuration-examples)
- [Error Handling Examples](#error-handling-examples)
- [Production Deployment Examples](#production-deployment-examples)

## CLI Interface Examples

### Basic Usage

```bash
# Display help information
./gridbot help

# Start in paper trading mode (default)
./gridbot start

# Start with custom configuration
./gridbot start --config ./my-config.json

# Start in live trading mode with verbose logging
./gridbot start --mode live --verbose

# Start in dry-run mode (simulation)
./gridbot start --mode live --dry-run --verbose
```

### Backtesting

```bash
# Run backtest with default date range (last 30 days)
./gridbot backtest

# Run backtest for specific date range
./gridbot backtest --start-date 2024-01-01 --end-date 2024-01-31

# Run backtest with custom config and verbose output
./gridbot backtest --config ./backtest-config.json --start-date 2024-01-01 --end-date 2024-01-31 --verbose
```

### Status and Monitoring

```bash
# Check application status
./gridbot status

# Check status with custom config
./gridbot status --config ./my-config.json

# Display version information
./gridbot --version
```

## Programmatic Usage Examples

### Basic Application Usage

```typescript
import { GridBotApp, AppOptions, AppState } from './src/GridBotApp';

async function basicUsage() {
  // Create application with options
  const options: AppOptions = {
    configPath: './config',
    mode: 'papertrade',
    verbose: true
  };

  const app = new GridBotApp(options);

  // Setup event listeners
  app.on('initialized', () => {
    console.log('Application initialized successfully');
  });

  app.on('started', () => {
    console.log('Trading started');
  });

  app.on('error', (error) => {
    console.error('Application error:', error);
  });

  app.on('stateChanged', ({ from, to }) => {
    console.log(`State changed: ${from} → ${to}`);
  });

  try {
    // Initialize and start
    await app.initialize();
    await app.start();

    // Check status
    const health = app.getHealthStatus();
    console.log('Application health:', health);

    // Stop gracefully when needed
    // await app.stop();
  } catch (error) {
    console.error('Failed to start application:', error);
  }
}
```

### Custom Event Handling

```typescript
import { GridBotApp, AppState } from './src/GridBotApp';

async function customEventHandling() {
  const app = new GridBotApp({ mode: 'live', verbose: true });

  // Setup comprehensive event handling
  app.on('stateChanged', ({ from, to }) => {
    switch (to) {
      case AppState.INITIALIZING:
        console.log('🔄 Initializing application...');
        break;
      case AppState.READY:
        console.log('✅ Application ready');
        break;
      case AppState.RUNNING:
        console.log('🚀 Trading started');
        break;
      case AppState.STOPPING:
        console.log('⏹️ Stopping application...');
        break;
      case AppState.STOPPED:
        console.log('✅ Application stopped');
        break;
      case AppState.ERROR:
        console.log('❌ Application error state');
        break;
    }
  });

  app.on('error', async (error) => {
    console.error('Application error:', error);
    
    // Custom error handling logic
    if (error.message.includes('API')) {
      console.log('Attempting to reconnect...');
      // Implement reconnection logic
    } else if (error.message.includes('Configuration')) {
      console.log('Please check your configuration file');
      process.exit(1);
    }
  });

  await app.initialize();
  await app.start();
}
```

### Service Access

```typescript
import { 
  BinanceService,
  StrategyEngine,
  NotificationService,
  ReportService,
  BotConfigType 
} from './src';

async function serviceUsage() {
  // Load configuration
  const config: BotConfigType = {
    // ... your configuration
  };

  // Initialize services directly
  const binanceService = new BinanceService(config);
  const strategyEngine = new StrategyEngine(config);
  const notificationService = new NotificationService(config);
  const reportService = new ReportService('./reports');

  // Use services
  const accountInfo = await binanceService.getAccountInfo();
  console.log('Account balance:', accountInfo);

  await notificationService.sendNotification(
    'Trading session started',
    'info'
  );

  // Generate trading signals
  const signals = await strategyEngine.generateSignals('BTCUSDT');
  console.log('Trading signals:', signals);
}
```

## Configuration Examples

### Basic Configuration

```json
{
  "tradeMode": "papertrade",
  "exchange": "binance",
  "maxBudget": {
    "amount": 1000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "gridSize": 10,
      "pricePrecision": 2,
      "quantityPrecision": 8,
      "minDailyBarDiffThreshold": 0.01
    }
  ],
  "apiKeys": {
    "binanceApiKey": "your-api-key",
    "binanceApiSecret": "your-api-secret",
    "telegramBotToken": "your-telegram-token",
    "telegramChatId": "your-chat-id"
  },
  "strategySettings": {
    "gridLevels": 10,
    "profitPerGrid": 0.01,
    "stopLossPercent": 0.05,
    "takeProfitPercent": 0.1
  },
  "binanceSettings": {
    "testnet": false,
    "rateLimitBuffer": 0.8
  },
  "logging": {
    "level": "info",
    "enableConsoleOutput": true,
    "enableFileOutput": true,
    "enableTelegramOutput": true
  }
}
```

### Live Trading Configuration

```json
{
  "tradeMode": "live",
  "exchange": "binance",
  "maxBudget": {
    "amount": 10000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "gridSize": 20,
      "pricePrecision": 2,
      "quantityPrecision": 8,
      "minDailyBarDiffThreshold": 0.005
    },
    {
      "pair": "ETHUSDT",
      "gridSize": 15,
      "pricePrecision": 2,
      "quantityPrecision": 6,
      "minDailyBarDiffThreshold": 0.005
    }
  ],
  "strategySettings": {
    "gridLevels": 20,
    "profitPerGrid": 0.005,
    "stopLossPercent": 0.03,
    "takeProfitPercent": 0.15,
    "maxDrawdown": 0.1,
    "riskManagement": {
      "maxPositionSize": 0.1,
      "maxDailyLoss": 0.05
    }
  },
  "binanceSettings": {
    "testnet": false,
    "rateLimitBuffer": 0.9,
    "reconnectDelay": 5000,
    "maxReconnectAttempts": 10
  },
  "logging": {
    "level": "info",
    "enableConsoleOutput": true,
    "enableFileOutput": true,
    "enableTelegramOutput": true
  }
}
```

### Backtest Configuration

```json
{
  "tradeMode": "backtest",
  "exchange": "binance",
  "maxBudget": {
    "amount": 10000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "gridSize": 50,
      "pricePrecision": 2,
      "quantityPrecision": 8,
      "minDailyBarDiffThreshold": 0.01
    }
  ],
  "strategySettings": {
    "gridLevels": 50,
    "profitPerGrid": 0.002,
    "stopLossPercent": 0.05,
    "takeProfitPercent": 0.1
  },
  "backtestSettings": {
    "startTime": "2024-01-01T00:00:00Z",
    "endTime": "2024-12-31T23:59:59Z",
    "interval": "1h",
    "slippagePercentage": 0.001,
    "commissionRate": 0.001,
    "enableDetailedLogging": true
  }
}
```

## Error Handling Examples

### Graceful Error Handling

```typescript
import { GridBotApp, AppState } from './src/GridBotApp';
import { TradingError, ConfigError, ApiError } from './src/utils/errors';

async function robustErrorHandling() {
  const app = new GridBotApp({ mode: 'live' });

  // Setup error recovery
  app.on('error', async (error) => {
    console.error('Application error:', error);

    if (error instanceof ConfigError) {
      console.error('Configuration error - please check your config file');
      process.exit(1);
    } else if (error instanceof ApiError) {
      console.error('API error - checking connection...');
      
      // Implement retry logic
      setTimeout(async () => {
        try {
          await app.start();
        } catch (retryError) {
          console.error('Retry failed:', retryError);
        }
      }, 5000);
    } else if (error instanceof TradingError) {
      console.error('Trading error - stopping positions...');
      await app.stop();
    }
  });

  // Setup shutdown handlers
  process.on('SIGINT', async () => {
    console.log('Received SIGINT - shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM - shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  // Uncaught exception handler
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await app.stop();
    process.exit(1);
  });

  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}
```

### Retry Logic Example

```typescript
import { GridBotApp } from './src/GridBotApp';

async function withRetryLogic() {
  const app = new GridBotApp({ mode: 'live' });
  const maxRetries = 3;
  let retryCount = 0;

  const startWithRetry = async (): Promise<void> => {
    try {
      await app.initialize();
      await app.start();
      console.log('Application started successfully');
    } catch (error) {
      console.error(`Start attempt ${retryCount + 1} failed:`, error);
      
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying in 5 seconds... (${retryCount}/${maxRetries})`);
        
        setTimeout(() => {
          startWithRetry();
        }, 5000);
      } else {
        console.error('Max retries exceeded. Giving up.');
        process.exit(1);
      }
    }
  };

  await startWithRetry();
}
```

## Production Deployment Examples

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/
COPY config/ ./config/

# Create reports directory
RUN mkdir -p reports

# Set environment variables
ENV NODE_ENV=production
ENV CONFIG_PATH=./config/config.json

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node dist/cli.js status || exit 1

# Start application
CMD ["node", "dist/cli.js", "start"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  gridbot:
    build: .
    container_name: gridbot
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - BINANCE_API_KEY=${BINANCE_API_KEY}
      - BINANCE_API_SECRET=${BINANCE_API_SECRET}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
    volumes:
      - ./config:/app/config:ro
      - ./reports:/app/reports
      - ./logs:/app/logs
    command: ["node", "dist/cli.js", "start", "--mode", "live"]
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### PM2 Deployment

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'gridbot',
    script: 'dist/cli.js',
    args: 'start --mode live --verbose',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      CONFIG_PATH: './config/production.json'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### Systemd Service

```ini
# /etc/systemd/system/gridbot.service
[Unit]
Description=GridBot Trading Application
After=network.target

[Service]
Type=simple
User=gridbot
WorkingDirectory=/opt/gridbot
ExecStart=/usr/bin/node dist/cli.js start --mode live
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=CONFIG_PATH=/opt/gridbot/config/config.json

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gridbot

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/gridbot/reports /opt/gridbot/logs

[Install]
WantedBy=multi-user.target
```

### Monitoring Script

```bash
#!/bin/bash
# monitor.sh - Simple monitoring script

GRIDBOT_PID=$(pgrep -f "gridbot")
LOG_FILE="/var/log/gridbot-monitor.log"

log_message() {
    echo "$(date): $1" >> "$LOG_FILE"
}

check_gridbot() {
    if [ -z "$GRIDBOT_PID" ]; then
        log_message "GridBot is not running. Starting..."
        cd /opt/gridbot
        npm start > /dev/null 2>&1 &
        sleep 5
        GRIDBOT_PID=$(pgrep -f "gridbot")
        if [ -n "$GRIDBOT_PID" ]; then
            log_message "GridBot started successfully (PID: $GRIDBOT_PID)"
        else
            log_message "Failed to start GridBot"
        fi
    else
        log_message "GridBot is running (PID: $GRIDBOT_PID)"
    fi
}

# Run health check
node /opt/gridbot/dist/cli.js status > /dev/null 2>&1
if [ $? -ne 0 ]; then
    log_message "Health check failed. Restarting GridBot..."
    kill "$GRIDBOT_PID"
    sleep 5
    check_gridbot
fi

check_gridbot
```

## Environment Variables

The application supports the following environment variables:

```bash
# Binance API credentials
export BINANCE_API_KEY="your-api-key"
export BINANCE_API_SECRET="your-api-secret"

# Telegram notifications
export TELEGRAM_BOT_TOKEN="your-bot-token"
export TELEGRAM_CHAT_ID="your-chat-id"

# Application settings
export NODE_ENV="production"
export CONFIG_PATH="./config/config.json"
export LOG_LEVEL="info"

# Trading settings
export TRADE_MODE="live"
export MAX_BUDGET="10000"
export TESTNET="false"
```

## Best Practices

1. **Configuration Management**: Keep sensitive data in environment variables
2. **Error Handling**: Always implement proper error handling and recovery
3. **Monitoring**: Set up health checks and monitoring
4. **Logging**: Enable appropriate logging levels for your environment
5. **Security**: Use secure API credentials and never commit them to version control
6. **Testing**: Always test with paper trading before going live
7. **Backup**: Regularly backup your configuration and reports
8. **Updates**: Keep the application updated with latest security patches

## Troubleshooting

### Common Issues

1. **Configuration Errors**: Check config.json syntax and required fields
2. **API Connection Issues**: Verify API credentials and network connectivity
3. **Permission Errors**: Ensure proper file permissions for reports and logs
4. **Memory Issues**: Monitor memory usage and restart if necessary
5. **Rate Limiting**: Adjust rate limit buffer in configuration

### Debug Mode

```bash
# Enable debug logging
./gridbot start --verbose

# Check application status
./gridbot status

# Test configuration
node -e "
const { ConfigLoader } = require('./dist/config/ConfigLoader');
const loader = new ConfigLoader();
loader.loadConfig().then(config => {
  console.log('Configuration valid:', !!config);
}).catch(err => {
  console.error('Configuration error:', err.message);
});
"
```
