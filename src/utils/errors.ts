/** * Custom error classes and error handling utilities *//** * Base error class for all custom errors */export abstract class BaseError extends Error {  public readonly code: string;  public readonly timestamp: number;  public readonly cause?: Error | undefined;  constructor(
    message: string,
    code: string,
    cause?: Error
  ) {
    super(message);
    this.code = code;
    this.timestamp = Date.now();
    this.cause = cause;
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration-related error
 */
export class ConfigError extends BaseError {
  constructor(
    message: string,
    code?: string,
    public readonly details?: unknown,
    cause?: Error
  ) {
    super(message, code || 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

/**
 * Validation-related error
 */
export class ValidateError extends BaseError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly expected?: string,
    public readonly received?: string,
    cause?: Error
  ) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidateError';
  }
}

/**
 * API-related error
 */
export class ApiError extends BaseError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
    public readonly response?: unknown,
    cause?: Error
  ) {
    super(message, 'API_ERROR', cause);
    this.name = 'ApiError';
  }
}

/**
 * Trading-related error
 */
export class TradingError extends BaseError {
  constructor(
    message: string,
    public readonly symbol?: string,
    cause?: Error
  ) {
    super(message, 'TRADING_ERROR', cause);
    this.name = 'TradingError';
  }
}

/**
 * Order-related error
 */
export class OrderError extends BaseError {
  constructor(
    message: string,
    public readonly orderId?: string,
    public readonly symbol?: string,
    cause?: Error
  ) {
    super(message, 'ORDER_ERROR', cause);
    this.name = 'OrderError';
  }
}

/**
 * Insufficient balance error
 */
export class InsufficientBalanceError extends BaseError {
  constructor(
    message: string,
    public readonly currency?: string,
    public readonly required?: number,
    public readonly available?: number,
    cause?: Error
  ) {
    super(message, 'INSUFFICIENT_BALANCE_ERROR', cause);
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Error handler utility functions
 */
export class ErrorHandler {
  /**
   * Check if error is a configuration error
   * @param error - Error to check
   * @returns True if configuration error
   */
  public static isConfigError(error: unknown): error is ConfigError {
    return error instanceof ConfigError;
  }

  /**
   * Check if error is a validation error
   * @param error - Error to check
   * @returns True if validation error
   */
  public static isValidateError(error: unknown): error is ValidateError {
    return error instanceof ValidateError;
  }

  /**
   * Check if error is an API error
   * @param error - Error to check
   * @returns True if API error
   */
  public static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  /**
   * Get error type name
   * @param error - Error to check
   * @returns Error type name
   */
  public static getErrorType(error: Error): string {
    return error.constructor.name;
  }

  /**
   * Format error for logging or display
   * @param error - Error to format
   * @returns Formatted error string
   */
  public static formatError(error: Error): string {
    const type = this.getErrorType(error);
    let formatted = `${type}: ${error.message}`;

    if (this.isConfigError(error)) {
      if (error.details) {
        formatted += ` | Details: ${JSON.stringify(error.details)}`;
      }
    } else if (this.isValidateError(error)) {
      if (error.field) {
        formatted += ` | Field: ${error.field}`;
      }
      if (error.expected) {
        formatted += ` | Expected: ${error.expected}`;
      }
      if (error.received) {
        formatted += ` | Received: ${error.received}`;
      }
    } else if (this.isApiError(error)) {
      if (error.statusCode) {
        formatted += ` | Status: ${error.statusCode}`;
      }
      if (error.endpoint) {
        formatted += ` | Endpoint: ${error.endpoint}`;
      }
      if (error.response) {
        formatted += ` | Response: ${JSON.stringify(error.response)}`;
      }
    }

    if (error.stack) {
      formatted += `\nStack: ${error.stack}`;
    }

    return formatted;
  }
}
