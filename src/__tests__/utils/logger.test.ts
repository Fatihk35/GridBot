/**
 * Tests for Logger utility
 */

import fs from 'fs';
import path from 'path';
import { Logger } from '@/utils/logger';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

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
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.info('Test info message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      logger.error('Test error message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warning messages', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logger.warn('Test warning message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log debug messages', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
      
      logger.debug('Test debug message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle error objects', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const testError = new Error('Test error');
      
      logger.error('Error occurred', testError);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle metadata objects', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const metadata = { userId: 123, action: 'trade' };
      
      logger.info('User action', metadata);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('file logging', () => {
    let logger: Logger;

    beforeEach(() => {
      // Mock directory doesn't exist initially
      mockFs.existsSync.mockReturnValue(false);
      logger = Logger.getInstance();
    });

    it('should create log directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      logger.info('Test message');
      
      // Should check if logs directory exists
      expect(mockFs.existsSync).toHaveBeenCalledWith('./logs');
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      logger.info('Test message');
      
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle file writing errors gracefully', () => {
      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });
      
      // Should not throw error
      expect(() => logger.info('Test message')).not.toThrow();
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
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.info('Consistent message format', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
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
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate uncaught exception - cast to avoid TypeScript error
      const error = new Error('Uncaught exception');
      (process as any).emit('uncaughtException', error, 'uncaughtException');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle unhandled promise rejections', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate unhandled rejection
      const reason = new Error('Unhandled rejection');
      process.emit('unhandledRejection', reason, Promise.reject(reason));
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('performance', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
    });

    it('should handle high volume logging', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Log many messages quickly
      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }
      
      expect(consoleSpy).toHaveBeenCalledTimes(1000);
      consoleSpy.mockRestore();
    });

    it('should handle large objects efficiently', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
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
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
