/**
 * Notification Service Unit Tests
 */

import { NotificationService } from '@/services/NotificationService';
import { Logger } from '@/utils/logger';
import { BotConfigType } from '@/config/schema';
import TelegramBot from 'node-telegram-bot-api';

// Mock dependencies
jest.mock('node-telegram-bot-api');
jest.mock('@/utils/logger');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockLogger: jest.Mocked<Logger>;
  let mockTelegramBot: jest.Mocked<TelegramBot>;
  let mockConfig: BotConfigType;

  beforeEach(() => {
    // Setup mocks
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockTelegramBot = {
      getMe: jest.fn(),
      sendMessage: jest.fn(),
      close: jest.fn(),
    } as any;

    (TelegramBot as jest.MockedClass<typeof TelegramBot>).mockImplementation(() => mockTelegramBot);

    // Mock config
    mockConfig = {
      tradeMode: 'papertrade',
      exchange: 'binance',
      maxBudget: {
        amount: 10000,
        currency: 'USDT',
      },
      symbols: [
        {
          pair: 'BTCUSDT',
          minDailyBarDiffThreshold: 0.01,
        },
      ],
      apiKeys: {
        binanceApiKey: 'test-api-key',
        binanceSecretKey: 'test-secret-key',
        telegramBotToken: 'test-telegram-token',
        telegramChatId: 'test-chat-id',
      },
      strategySettings: {
        barCountForVolatility: 20,
        minVolatilityPercentage: 0.02,
        minVolatileBarRatio: 0.3,
        emaPeriod: 200,
        emaDeviationThreshold: 0.05,
      },
      binanceSettings: {
        testnet: true,
        commissionRate: 0.001,
      },
      logging: {
        enableConsoleOutput: true,
        enableTelegramOutput: true,
        reportDirectory: './reports',
        transactionLogFileName: 'transactions.log',
      },
    } as BotConfigType;

    // Mock successful Telegram bot initialization
    mockTelegramBot.getMe.mockResolvedValue({
      id: 123456789,
      is_bot: true,
      first_name: 'TestBot',
      username: 'testbot',
      language_code: 'en',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully with Telegram enabled', async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(TelegramBot).toHaveBeenCalledWith('test-telegram-token', { polling: false });
      expect(mockTelegramBot.getMe).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Telegram bot initialized successfully');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'NotificationService initialized',
        expect.objectContaining({
          enableConsole: true,
          enableTelegram: true,
          enableFileLogging: true,
        })
      );
    });

    it('should handle Telegram initialization failure gracefully', async () => {
      mockTelegramBot.getMe.mockRejectedValue(new Error('Telegram API Error'));
      
      notificationService = new NotificationService(mockConfig, mockLogger);
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize Telegram bot:',
        expect.any(Error)
      );
    });

    it('should initialize without Telegram when not configured', () => {
      const configWithoutTelegram = {
        ...mockConfig,
        logging: {
          ...mockConfig.logging,
          enableTelegramOutput: false,
        },
        apiKeys: {
          ...mockConfig.apiKeys,
          telegramBotToken: undefined,
        },
      };

      notificationService = new NotificationService(configWithoutTelegram, mockLogger);
      
      expect(TelegramBot).not.toHaveBeenCalled();
    });
  });

  describe('Basic Notifications', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
    });

    it('should send basic notification successfully', async () => {
      await notificationService.sendNotification('Test message', 'info');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Information] Test message',
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'NOTIFICATION: Test message',
        expect.objectContaining({
          type: 'info',
          title: 'Information',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should send notification with metadata', async () => {
      const metadata = { orderId: '123', amount: 100 };
      
      await notificationService.sendNotification(
        'Order created',
        'success',
        metadata
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'NOTIFICATION: Order created',
        expect.objectContaining({
          metadata,
        })
      );
    });

    it('should send structured notification', async () => {
      const notification = {
        type: 'warning' as const,
        title: 'Custom Warning',
        message: 'Custom warning message',
        timestamp: Date.now(),
        metadata: { level: 'medium' },
      };
      
      await notificationService.sendStructuredNotification(notification);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Custom Warning] Custom warning message',
        expect.any(Object)
      );
    });
  });

  describe('Trading Notifications', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
    });

    it('should send trading notification with correct formatting', async () => {
      await notificationService.sendTradingNotification(
        'Order Filled',
        'BTCUSDT',
        50000,
        0.1,
        'BUY',
        'paper'
      );
      
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        expect.stringContaining('🟢 Paper Trade: Order Filled'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        })
      );
      
      const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('Symbol: BTCUSDT');
      expect(sentMessage).toContain('Side: BUY');
      expect(sentMessage).toContain('Price: 50000.00000000');
      expect(sentMessage).toContain('Quantity: 0.10000000');
      expect(sentMessage).toContain('Value: 5000.00 USDT');
    });

    it('should use correct emoji for buy and sell orders', async () => {
      // Test BUY order
      await notificationService.sendTradingNotification(
        'Order Created',
        'BTCUSDT',
        50000,
        0.1,
        'BUY',
        'live'
      );
      
      let sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('🟢 Live Trade: Order Created');
      
      // Test SELL order
      await notificationService.sendTradingNotification(
        'Order Created',
        'BTCUSDT',
        50000,
        0.1,
        'SELL',
        'paper'
      );
      
      sentMessage = mockTelegramBot.sendMessage.mock.calls[1]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('🔴 Paper Trade: Order Created');
    });
  });

  describe('Error Notifications', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
    });

    it('should send error notification with Error object', async () => {
      const error = new Error('Test error message');
      
      await notificationService.sendErrorNotification(error, 'Trading Error');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Error] 🚨 Error Alert\nContext: Trading Error\nError: Test error message',
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Test error message',
            context: 'Trading Error',
            stack: expect.any(String),
          }),
        })
      );
    });

    it('should send error notification with string message', async () => {
      await notificationService.sendErrorNotification('String error message');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Error] 🚨 Error Alert\nError: String error message',
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'String error message',
          }),
        })
      );
    });

    it('should include metadata in error notification', async () => {
      const error = new Error('API Error');
      const metadata = { statusCode: 500, endpoint: '/api/orders' };
      
      await notificationService.sendErrorNotification(error, 'API Error', metadata);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('API Error'),
        expect.objectContaining({
          metadata: expect.objectContaining({
            statusCode: 500,
            endpoint: '/api/orders',
          }),
        })
      );
    });
  });

  describe('Status Notifications', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
    });

    it('should send status notification with details', async () => {
      const details = {
        balance: '1000.00 USDT',
        trades: 5,
        profit: 25.50,
      };
      
      await notificationService.sendStatusNotification('Trading Update', details);
      
      const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('📊 Status Update: Trading Update');
      expect(sentMessage).toContain('balance: 1000.00 USDT');
      expect(sentMessage).toContain('trades: 5');
      expect(sentMessage).toContain('profit: 25.5');
    });

    it('should send status notification without details', async () => {
      await notificationService.sendStatusNotification('Simple status');
      
      const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('📊 Status Update: Simple status');
    });
  });

  describe('Telegram Integration', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
    });

    it('should retry Telegram messages on failure', async () => {
      mockTelegramBot.sendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({} as any);
      
      await notificationService.sendNotification('Test message');
      
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Telegram notification attempt'),
        expect.any(Error)
      );
    });

    it('should give up after max retries', async () => {
      mockTelegramBot.sendMessage.mockRejectedValue(new Error('Persistent error'));
      
      await notificationService.sendNotification('Test message');
      
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith('All Telegram notification attempts failed');
    });

    it('should format messages correctly for Telegram', async () => {
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
      
      await notificationService.sendNotification(
        'Test message with *bold* and _italic_',
        'info',
        { key1: 'value1', key2: 123 }
      );
      
      const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
      expect(sentMessage).toBeDefined();
      expect(sentMessage).toContain('ℹ️ *Information*');
      expect(sentMessage).toContain('Test message with *bold* and _italic_');
      expect(sentMessage).toContain('_Metadata:_');
      expect(sentMessage).toContain('• key1: `value1`');
      expect(sentMessage).toContain('• key2: `123`');
      expect(sentMessage).toMatch(/_\d{1,2}\/\d{1,2}\/\d{4},/); // Timestamp
    });
  });

  describe('Value Formatting', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
    });

    it('should format numbers correctly', () => {
      const formatValue = (notificationService as any).formatValue;
      
      expect(formatValue(123.456789)).toBe('123.456789');
      expect(formatValue(123.000000)).toBe('123');
      expect(formatValue(0.00001234)).toBe('0.00001234');
      expect(formatValue(0)).toBe('0');
    });

    it('should format objects as JSON', () => {
      const formatValue = (notificationService as any).formatValue;
      
      expect(formatValue({ key: 'value' })).toBe('{"key":"value"}');
      expect(formatValue([1, 2, 3])).toBe('[1,2,3]');
    });

    it('should convert other types to string', () => {
      const formatValue = (notificationService as any).formatValue;
      
      expect(formatValue('string')).toBe('string');
      expect(formatValue(true)).toBe('true');
      expect(formatValue(null)).toBe('null');
      expect(formatValue(undefined)).toBe('undefined');
    });
  });

  describe('Configuration Handling', () => {
    it('should handle missing Telegram configuration', () => {
      const configWithoutTelegram = {
        ...mockConfig,
        apiKeys: {
          ...mockConfig.apiKeys,
          telegramBotToken: undefined,
          telegramChatId: undefined,
        },
      };

      notificationService = new NotificationService(configWithoutTelegram, mockLogger);
      
      expect(TelegramBot).not.toHaveBeenCalled();
    });

    it('should disable Telegram when enableTelegramOutput is false', () => {
      const configWithTelegramDisabled = {
        ...mockConfig,
        logging: {
          ...mockConfig.logging,
          enableTelegramOutput: false,
        },
      };

      notificationService = new NotificationService(configWithTelegramDisabled, mockLogger);
      
      expect(TelegramBot).not.toHaveBeenCalled();
    });
  });

  describe('Resource Cleanup', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
    });

    it('should cleanup resources on destroy', async () => {
      await notificationService.destroy();
      
      expect(mockTelegramBot.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('NotificationService destroyed');
    });

    it('should handle cleanup errors gracefully', async () => {
      mockTelegramBot.close.mockRejectedValue(new Error('Cleanup error'));
      
      await notificationService.destroy();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error closing Telegram bot:',
        expect.any(Error)
      );
      expect(mockLogger.info).toHaveBeenCalledWith('NotificationService destroyed');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
    });

    it('should handle empty messages', async () => {
      await notificationService.sendNotification('');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Information] ',
        expect.any(Object)
      );
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(5000);
      
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
      
      await notificationService.sendNotification(longMessage);
      
      expect(mockTelegramBot.sendMessage).toHaveBeenCalled();
    });

    it('should handle special characters in messages', async () => {
      const specialMessage = 'Test with special chars: <>[]{}()&*_~`';
      
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
      
      await notificationService.sendNotification(specialMessage);
      
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(specialMessage),
        expect.any(Object)
      );
    });
  });

  describe('Enhanced Notification Methods', () => {
    beforeEach(async () => {
      notificationService = new NotificationService(mockConfig, mockLogger);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for initialization
      mockTelegramBot.sendMessage.mockResolvedValue({} as any);
    });

    describe('sendTradeNotification', () => {
      it('should send trade notification with correct formatting', async () => {
        const trade = {
          symbol: 'BTCUSDT',
          side: 'BUY' as const,
          price: 50000,
          quantity: 0.1,
          mode: 'live' as const,
        };

        await notificationService.sendTradeNotification(trade);

        expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
          'test-chat-id',
          expect.stringContaining('[LIVE] 🟢🟢🟢 BUY 0.1 BTCUSDT @ 50000'),
          expect.objectContaining({
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          })
        );
      });

      it('should handle paper trading mode correctly', async () => {
        const trade = {
          symbol: 'ETHUSDT',
          side: 'SELL' as const,
          price: 3000,
          quantity: 1,
          mode: 'papertrade' as const,
        };

        await notificationService.sendTradeNotification(trade);

        expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
          'test-chat-id',
          expect.stringContaining('[PAPER] 🔴 SELL 1 ETHUSDT @ 3000'),
          expect.any(Object)
        );
      });

      it('should handle backtest mode correctly', async () => {
        const trade = {
          symbol: 'ADAUSDT',
          side: 'BUY' as const,
          price: 0.5,
          quantity: 1000,
          mode: 'backtest' as const,
        };

        await notificationService.sendTradeNotification(trade);

        expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
          'test-chat-id',
          expect.stringContaining('[BACKTEST] 🟢 BUY 1000 ADAUSDT @ 0.5'),
          expect.any(Object)
        );
      });
    });

    describe('sendStatusNotification with structured data', () => {
      it('should send structured status notification correctly', async () => {
        const status = {
          mode: 'live' as const,
          balances: { 
            USDT: 5000,
            BTC: 0.1 
          },
          profit: 125.50,
          trades: 15,
        };

        await notificationService.sendStatusNotification(status);

        const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
        expect(sentMessage).toBeDefined();
        expect(sentMessage).toContain('[LIVE] Status Update');
        expect(sentMessage).toContain('📈 Profit: 125.50000000');
        expect(sentMessage).toContain('💰 Balances: 5000.00000000 USDT, 0.10000000 BTC');
        expect(sentMessage).toContain('🔄 Trades: 15');
      });

      it('should handle negative profit correctly', async () => {
        const status = {
          mode: 'papertrade' as const,
          balances: { 
            USDT: 4875 
          },
          profit: -125,
          trades: 10,
        };

        await notificationService.sendStatusNotification(status);

        const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
        expect(sentMessage).toBeDefined();
        expect(sentMessage).toContain('📉 Profit: -125.00000000');
      });

      it('should calculate profit percentage correctly', async () => {
        const status = {
          mode: 'backtest' as const,
          balances: { 
            USDT: 10000 
          },
          profit: 500,
          trades: 20,
        };

        await notificationService.sendStatusNotification(status);

        // Check that metadata includes profit percentage
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            metadata: expect.objectContaining({
              profitPercentage: '5.00',
            }),
          })
        );
      });
    });

    describe('log method', () => {
      it('should log messages with correct levels', () => {
        notificationService.log('Debug message', 'DEBUG');
        notificationService.log('Info message', 'INFO');
        notificationService.log('Warning message', 'WARNING');
        notificationService.log('Error message', 'ERROR');

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringMatching(/\[.*\] \[DEBUG\] Debug message/)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringMatching(/\[.*\] \[INFO\] Info message/)
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringMatching(/\[.*\] \[WARNING\] Warning message/)
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringMatching(/\[.*\] \[ERROR\] Error message/)
        );
      });

      it('should default to INFO level', () => {
        notificationService.log('Default level message');

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringMatching(/\[.*\] \[INFO\] Default level message/)
        );
      });

      it('should respect console output setting', () => {
        const configWithoutConsole = {
          ...mockConfig,
          logging: {
            ...mockConfig.logging,
            enableConsoleOutput: false,
          },
        };

        const serviceWithoutConsole = new NotificationService(configWithoutConsole, mockLogger);
        serviceWithoutConsole.log('Should not log');

        // Should not have called logger methods
        expect(mockLogger.info).not.toHaveBeenCalledWith(
          expect.stringContaining('Should not log')
        );
      });
    });

    describe('sendPerformanceNotification', () => {
      it('should send performance notification with good status', async () => {
        const metrics = {
          memoryUsage: {
            rss: 100 * 1024 * 1024, // 100MB
            heapUsed: 50 * 1024 * 1024, // 50MB
            heapTotal: 100 * 1024 * 1024, // 100MB
            external: 0,
            arrayBuffers: 0,
          },
          uptime: 3600, // 1 hour
          activeConnections: 5,
          errorRate: 0.01, // 1%
        };

        await notificationService.sendPerformanceNotification(metrics);

        const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
        expect(sentMessage).toBeDefined();
        expect(sentMessage).toContain('📊 Performance Status: 🟢 Good');
        expect(sentMessage).toContain('⏱️ Uptime: 1.00h');
        expect(sentMessage).toContain('💾 Memory: 100.00MB');
        expect(sentMessage).toContain('🔗 Connections: 5');
        expect(sentMessage).toContain('⚠️ Error Rate: 1.00%');
      });

      it('should send warning status for moderate issues', async () => {
        const metrics = {
          memoryUsage: {
            rss: 200 * 1024 * 1024,
            heapUsed: 75 * 1024 * 1024, // 75% of heap
            heapTotal: 100 * 1024 * 1024,
            external: 0,
            arrayBuffers: 0,
          },
          uptime: 7200,
          activeConnections: 10,
          errorRate: 0.07, // 7%
        };

        await notificationService.sendPerformanceNotification(metrics);

        const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
        expect(sentMessage).toBeDefined();
        expect(sentMessage).toContain('📊 Performance Status: 🟡 Warning');
      });

      it('should send critical status for severe issues', async () => {
        const metrics = {
          memoryUsage: {
            rss: 300 * 1024 * 1024,
            heapUsed: 95 * 1024 * 1024, // 95% of heap
            heapTotal: 100 * 1024 * 1024,
            external: 0,
            arrayBuffers: 0,
          },
          uptime: 10800,
          activeConnections: 20,
          errorRate: 0.15, // 15%
        };

        await notificationService.sendPerformanceNotification(metrics);

        const sentMessage = mockTelegramBot.sendMessage.mock.calls[0]?.[1] as string;
        expect(sentMessage).toBeDefined();
        expect(sentMessage).toContain('📊 Performance Status: 🔴 Critical');
        
        // Should be sent as error type
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });
});
