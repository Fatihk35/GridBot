import winston from 'winston';
import { ILogger, LoggingConfig } from '../types';

/**
 * Custom logger implementation using Winston
 * Provides structured logging with multiple transports
 */
export class Logger implements ILogger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor(config?: LoggingConfig) {
    this.logger = this.createLogger(config);
  }

  /**
   * Get singleton instance of logger
   * @param config - Optional logging configuration
   * @returns Logger instance
   */
  public static getInstance(config?: LoggingConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Create Winston logger with configured transports
   * @param config - Logging configuration
   * @returns Winston logger instance
   */
  private createLogger(config?: LoggingConfig): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    if (!config || config.enableConsoleOutput) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          ),
        })
      );
    }

    // File transport
    if (config?.reportDirectory) {
      transports.push(
        new winston.transports.File({
          filename: `${config.reportDirectory}/error.log`,
          level: 'error',
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }),
        new winston.transports.File({
          filename: `${config.reportDirectory}/combined.log`,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        })
      );
    }

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports,
      exceptionHandlers: [
        new winston.transports.File({
          filename: config?.reportDirectory
            ? `${config.reportDirectory}/exceptions.log`
            : 'exceptions.log',
        }),
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: config?.reportDirectory
            ? `${config.reportDirectory}/rejections.log`
            : 'rejections.log',
        }),
      ],
    });
  }

  /**
   * Log error message
   * @param message - Error message
   * @param meta - Additional metadata
   */
  public error(message: string, meta?: unknown): void {
    this.logger.error(message, meta);
  }

  /**
   * Log warning message
   * @param message - Warning message
   * @param meta - Additional metadata
   */
  public warn(message: string, meta?: unknown): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log info message
   * @param message - Info message
   * @param meta - Additional metadata
   */
  public info(message: string, meta?: unknown): void {
    this.logger.info(message, meta);
  }

  /**
   * Log debug message
   * @param message - Debug message
   * @param meta - Additional metadata
   */
  public debug(message: string, meta?: unknown): void {
    this.logger.debug(message, meta);
  }

  /**
   * Update logger configuration
   * @param config - New logging configuration
   */
  public updateConfig(config: LoggingConfig): void {
    this.logger = this.createLogger(config);
  }
}

/**
 * Export default logger instance
 */
export const logger = Logger.getInstance();
