/**
 * Tests for Error handling utilities
 */

import { ConfigError, ValidateError, ApiError, ErrorHandler } from '@/utils/errors';

describe('Custom Error Classes', () => {
  describe('ConfigError', () => {
    it('should create ConfigError with message', () => {
      const error = new ConfigError('Configuration error');
      
      expect(error).toBeInstanceOf(ConfigError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ConfigError');
      expect(error.message).toBe('Configuration error');
    });

    it('should create ConfigError with code and details', () => {
      const error = new ConfigError('Invalid config', 'CONFIG_001', { field: 'apiKey' });
      
      expect(error.code).toBe('CONFIG_001');
      expect(error.details).toEqual({ field: 'apiKey' });
    });

    it('should create ConfigError without optional parameters', () => {
      const error = new ConfigError('Simple error');
      
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe('ValidateError', () => {
    it('should create ValidateError with message', () => {
      const error = new ValidateError('Validation failed');
      
      expect(error).toBeInstanceOf(ValidateError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidateError');
      expect(error.message).toBe('Validation failed');
    });

    it('should create ValidateError with field and expected value', () => {
      const error = new ValidateError('Invalid value', 'amount', 'positive number');
      
      expect(error.field).toBe('amount');
      expect(error.expected).toBe('positive number');
    });

    it('should create ValidateError with all parameters', () => {
      const error = new ValidateError('Type mismatch', 'price', 'number', 'string');
      
      expect(error.field).toBe('price');
      expect(error.expected).toBe('number');
      expect(error.received).toBe('string');
    });
  });

  describe('ApiError', () => {
    it('should create ApiError with message', () => {
      const error = new ApiError('API request failed');
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('API request failed');
    });

    it('should create ApiError with status code', () => {
      const error = new ApiError('Not found', 404);
      
      expect(error.statusCode).toBe(404);
    });

    it('should create ApiError with endpoint and response', () => {
      const response = { error: 'Invalid API key' };
      const error = new ApiError('Unauthorized', 401, '/api/account', response);
      
      expect(error.statusCode).toBe(401);
      expect(error.endpoint).toBe('/api/account');
      expect(error.response).toEqual(response);
    });

    it('should create ApiError without optional parameters', () => {
      const error = new ApiError('Network error');
      
      expect(error.statusCode).toBeUndefined();
      expect(error.endpoint).toBeUndefined();
      expect(error.response).toBeUndefined();
    });
  });
});

describe('ErrorHandler', () => {
  describe('isConfigError', () => {
    it('should return true for ConfigError instances', () => {
      const error = new ConfigError('Config error');
      
      expect(ErrorHandler.isConfigError(error)).toBe(true);
    });

    it('should return false for non-ConfigError instances', () => {
      const error = new Error('Generic error');
      
      expect(ErrorHandler.isConfigError(error)).toBe(false);
    });

    it('should return false for other error types', () => {
      const validateError = new ValidateError('Validation error');
      const apiError = new ApiError('API error');
      
      expect(ErrorHandler.isConfigError(validateError)).toBe(false);
      expect(ErrorHandler.isConfigError(apiError)).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(ErrorHandler.isConfigError(null)).toBe(false);
      expect(ErrorHandler.isConfigError(undefined)).toBe(false);
    });
  });

  describe('isValidateError', () => {
    it('should return true for ValidateError instances', () => {
      const error = new ValidateError('Validation error');
      
      expect(ErrorHandler.isValidateError(error)).toBe(true);
    });

    it('should return false for non-ValidateError instances', () => {
      const error = new Error('Generic error');
      
      expect(ErrorHandler.isValidateError(error)).toBe(false);
    });

    it('should return false for other error types', () => {
      const configError = new ConfigError('Config error');
      const apiError = new ApiError('API error');
      
      expect(ErrorHandler.isValidateError(configError)).toBe(false);
      expect(ErrorHandler.isValidateError(apiError)).toBe(false);
    });
  });

  describe('isApiError', () => {
    it('should return true for ApiError instances', () => {
      const error = new ApiError('API error');
      
      expect(ErrorHandler.isApiError(error)).toBe(true);
    });

    it('should return false for non-ApiError instances', () => {
      const error = new Error('Generic error');
      
      expect(ErrorHandler.isApiError(error)).toBe(false);
    });

    it('should return false for other error types', () => {
      const configError = new ConfigError('Config error');
      const validateError = new ValidateError('Validation error');
      
      expect(ErrorHandler.isApiError(configError)).toBe(false);
      expect(ErrorHandler.isApiError(validateError)).toBe(false);
    });
  });

  describe('formatError', () => {
    it('should format ConfigError with code and details', () => {
      const error = new ConfigError('Invalid config', 'CONFIG_001', { field: 'apiKey' });
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ConfigError');
      expect(formatted).toContain('Invalid config');
      expect(formatted).toContain('CONFIG_001');
      expect(formatted).toContain('apiKey');
    });

    it('should format ConfigError without code and details', () => {
      const error = new ConfigError('Simple config error');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ConfigError');
      expect(formatted).toContain('Simple config error');
    });

    it('should format ValidateError with all fields', () => {
      const error = new ValidateError('Type mismatch', 'price', 'number', 'string');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ValidateError');
      expect(formatted).toContain('Type mismatch');
      expect(formatted).toContain('price');
      expect(formatted).toContain('number');
      expect(formatted).toContain('string');
    });

    it('should format ValidateError with minimal fields', () => {
      const error = new ValidateError('Validation failed');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ValidateError');
      expect(formatted).toContain('Validation failed');
    });

    it('should format ApiError with all fields', () => {
      const response = { error: 'Invalid key' };
      const error = new ApiError('Unauthorized', 401, '/api/account', response);
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ApiError');
      expect(formatted).toContain('Unauthorized');
      expect(formatted).toContain('401');
      expect(formatted).toContain('/api/account');
      expect(formatted).toContain('Invalid key');
    });

    it('should format ApiError with minimal fields', () => {
      const error = new ApiError('Network error');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('ApiError');
      expect(formatted).toContain('Network error');
    });

    it('should format generic Error', () => {
      const error = new Error('Generic error message');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Generic error message');
    });

    it('should handle errors with stack traces', () => {
      const error = new Error('Error with stack');
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Error with stack');
      expect(formatted).toContain('Stack:');
    });

    it('should handle errors without message', () => {
      const error = new Error();
      const formatted = ErrorHandler.formatError(error);
      
      expect(formatted).toContain('Error');
    });
  });

  describe('getErrorType', () => {
    it('should return correct type for ConfigError', () => {
      const error = new ConfigError('Config error');
      
      expect(ErrorHandler.getErrorType(error)).toBe('ConfigError');
    });

    it('should return correct type for ValidateError', () => {
      const error = new ValidateError('Validation error');
      
      expect(ErrorHandler.getErrorType(error)).toBe('ValidateError');
    });

    it('should return correct type for ApiError', () => {
      const error = new ApiError('API error');
      
      expect(ErrorHandler.getErrorType(error)).toBe('ApiError');
    });

    it('should return generic type for Error', () => {
      const error = new Error('Generic error');
      
      expect(ErrorHandler.getErrorType(error)).toBe('Error');
    });

    it('should handle custom error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const error = new CustomError('Custom error');
      
      expect(ErrorHandler.getErrorType(error)).toBe('CustomError');
    });
  });

  describe('error chain handling', () => {
    it('should handle nested errors', () => {
      const innerError = new ValidateError('Inner validation error');
      const outerError = new ConfigError('Config error caused by validation');
      
      // Simulate error chaining
      (outerError as any).cause = innerError;
      
      const formatted = ErrorHandler.formatError(outerError);
      expect(formatted).toContain('ConfigError');
      expect(formatted).toContain('Config error caused by validation');
    });
  });
});
