/**
 * Notification Service Implementation
 * Handles sending notifications via console, Telegram, and file logging
 */

import TelegramBot from 'node-telegram-bot-api';
import { z } from 'zod';
import { Logger } from '@/utils/logger';
import { BotConfigType } from '@/config/schema';
import { NotificationMessage } from '@/types';

/**
 * Notification service configuration schema
 */
const NotificationConfigSchema = z.object({
  enableConsole: z.boolean().default(true),
  enableTelegram: z.boolean().default(false),
  enableFileLogging: z.boolean().default(true),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  maxRetries: z.number().int().positive().default(3),
  retryDelay: z.number().int().positive().default(1000), // ms
});

type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

/**
 * Service for sending notifications through multiple channels
 */
export class NotificationService {
  private config: NotificationConfig;
  private logger: Logger;
  private telegramBot?: TelegramBot;
  private isInitialized = false;

  constructor(botConfig: BotConfigType, logger?: Logger) {
    this.logger = logger || Logger.getInstance();
    
    // Extract notification config from bot config
    this.config = NotificationConfigSchema.parse({
      enableConsole: botConfig.logging.enableConsoleOutput,
      enableTelegram: botConfig.logging.enableTelegramOutput,
      enableFileLogging: true,
      telegramBotToken: botConfig.apiKeys.telegramBotToken,
      telegramChatId: botConfig.apiKeys.telegramChatId,
    });

    this.initialize();
  }

  /**
   * Initialize the notification service
   */
  private async initialize(): Promise<void> {
    try {
      // Initialize Telegram bot if enabled and configured
      if (this.config.enableTelegram && this.config.telegramBotToken) {
        this.telegramBot = new TelegramBot(this.config.telegramBotToken, { 
          polling: false 
        });
        
        // Test Telegram connection
        try {
          await this.telegramBot.getMe();
          this.logger.info('Telegram bot initialized successfully');
        } catch (error) {
          this.logger.warn('Failed to initialize Telegram bot:', error);
          this.config.enableTelegram = false;
        }
      }

      this.isInitialized = true;
      this.logger.info('NotificationService initialized', {
        enableConsole: this.config.enableConsole,
        enableTelegram: this.config.enableTelegram,
        enableFileLogging: this.config.enableFileLogging,
      });
    } catch (error) {
      this.logger.error('Failed to initialize NotificationService:', error);
      throw error;
    }
  }

  /**
   * Send a notification message
   */
  async sendNotification(
    message: string, 
    type: NotificationMessage['type'] = 'info',
    metadata?: Record<string, any>
  ): Promise<void> {
    const notification: NotificationMessage = {
      type,
      title: this.getTitleForType(type),
      message,
      timestamp: Date.now(),
      ...(metadata && { metadata }),
    };

    await this.processNotification(notification);
  }

  /**
   * Send a structured notification
   */
  async sendStructuredNotification(notification: NotificationMessage): Promise<void> {
    await this.processNotification(notification);
  }

  /**
   * Send trading notification with specific formatting
   */
  async sendTradingNotification(
    action: string,
    symbol: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL',
    mode: 'paper' | 'live' = 'paper'
  ): Promise<void> {
    const emoji = side === 'BUY' ? '🟢' : '🔴';
    const modeText = mode === 'paper' ? 'Paper Trade' : 'Live Trade';
    
    const message = `${emoji} ${modeText}: ${action}\n` +
                   `Symbol: ${symbol}\n` +
                   `Side: ${side}\n` +
                   `Price: ${price.toFixed(8)}\n` +
                   `Quantity: ${quantity.toFixed(8)}\n` +
                   `Value: ${(price * quantity).toFixed(2)} USDT`;

    await this.sendNotification(message, 'info', {
      action,
      symbol,
      price,
      quantity,
      side,
      mode,
    });
  }

  /**
   * Send error notification with enhanced formatting
   */
  async sendErrorNotification(
    error: Error | string,
    context?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const contextText = context ? `Context: ${context}\n` : '';
    
    const message = `🚨 Error Alert\n${contextText}Error: ${errorMessage}`;

    await this.sendNotification(message, 'error', {
      error: errorMessage,
      context,
      stack: error instanceof Error ? error.stack : undefined,
      ...metadata,
    });
  }

  /**
   * Send status update notification
   */
  async sendStatusNotification(
    status: string,
    details?: Record<string, any>
  ): Promise<void> {
    let message = `📊 Status Update: ${status}`;
    
    if (details) {
      message += '\n\nDetails:\n';
      Object.entries(details).forEach(([key, value]) => {
        message += `${key}: ${this.formatValue(value)}\n`;
      });
    }

    await this.sendNotification(message, 'info', details);
  }

  /**
   * Process a notification through all enabled channels
   */
  private async processNotification(notification: NotificationMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    // Console notification
    if (this.config.enableConsole) {
      promises.push(this.sendConsoleNotification(notification));
    }

    // File logging
    if (this.config.enableFileLogging) {
      promises.push(this.sendFileNotification(notification));
    }

    // Telegram notification
    if (this.config.enableTelegram && this.telegramBot && this.config.telegramChatId) {
      promises.push(this.sendTelegramNotification(notification));
    }

    // Execute all notifications concurrently
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error('Failed to send notifications:', error);
    }
  }

  /**
   * Send console notification
   */
  private async sendConsoleNotification(notification: NotificationMessage): Promise<void> {
    const timestamp = new Date(notification.timestamp).toISOString();
    const logMethod = this.getLogMethodForType(notification.type);
    const message = `[${notification.title}] ${notification.message}`;
    const metadata = {
      timestamp,
      metadata: notification.metadata,
    };
    
    // Use type assertion to handle dynamic method access
    (this.logger[logMethod] as (message: string, meta?: unknown) => void)(message, metadata);
  }

  /**
   * Send file notification
   */
  private async sendFileNotification(notification: NotificationMessage): Promise<void> {
    // File logging is handled by the logger itself
    this.logger.info(`NOTIFICATION: ${notification.message}`, {
      type: notification.type,
      title: notification.title,
      timestamp: notification.timestamp,
      metadata: notification.metadata,
    });
  }

  /**
   * Send Telegram notification with retry logic
   */
  private async sendTelegramNotification(notification: NotificationMessage): Promise<void> {
    if (!this.telegramBot || !this.config.telegramChatId) {
      return;
    }

    const message = this.formatTelegramMessage(notification);
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.telegramBot.sendMessage(this.config.telegramChatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
        return; // Success
      } catch (error) {
        this.logger.warn(`Telegram notification attempt ${attempt} failed:`, error);
        
        if (attempt === this.config.maxRetries) {
          this.logger.error('All Telegram notification attempts failed');
          return;
        }
        
        // Wait before retry
        await this.delay(this.config.retryDelay * attempt);
      }
    }
  }

  /**
   * Format message for Telegram
   */
  private formatTelegramMessage(notification: NotificationMessage): string {
    const timestamp = new Date(notification.timestamp).toLocaleString();
    const icon = this.getIconForType(notification.type);
    
    let message = `${icon} *${notification.title}*\n\n${notification.message}`;
    
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      message += '\n\n_Metadata:_\n';
      Object.entries(notification.metadata).forEach(([key, value]) => {
        message += `• ${key}: \`${this.formatValue(value)}\`\n`;
      });
    }
    
    message += `\n_${timestamp}_`;
    
    return message;
  }

  /**
   * Get title for notification type
   */
  private getTitleForType(type: NotificationMessage['type']): string {
    const titles = {
      info: 'Information',
      warning: 'Warning',
      error: 'Error',
      success: 'Success',
    };
    return titles[type];
  }

  /**
   * Get icon for notification type
   */
  private getIconForType(type: NotificationMessage['type']): string {
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      success: '✅',
    };
    return icons[type];
  }

  /**
   * Get log method for notification type
   */
  private getLogMethodForType(type: NotificationMessage['type']): keyof Logger {
    const methods = {
      info: 'info' as const,
      warning: 'warn' as const,
      error: 'error' as const,
      success: 'info' as const,
    };
    return methods[type];
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
    if (typeof value === 'number') {
      return value.toFixed(8).replace(/\.?0+$/, '');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.telegramBot) {
      try {
        await this.telegramBot.close();
      } catch (error) {
        this.logger.warn('Error closing Telegram bot:', error);
      }
    }
    
    this.logger.info('NotificationService destroyed');
  }
}
