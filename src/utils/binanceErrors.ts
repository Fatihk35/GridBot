/**
 * Binance-specific error handling
 */

import { BaseError } from '../utils/errors';
import { BinanceError } from '../types/binance';

/**
 * Binance API error codes and their meanings
 */
export const BINANCE_ERROR_CODES = {
  // General errors
  UNKNOWN: -1000,
  DISCONNECTED: -1001,
  UNAUTHORIZED: -1002,
  TOO_MANY_REQUESTS: -1003,
  UNEXPECTED_RESP: -1006,
  TIMEOUT: -1007,
  UNKNOWN_ORDER_COMPOSITION: -1014,
  TOO_MANY_ORDERS: -1015,
  SERVICE_SHUTTING_DOWN: -1016,
  UNSUPPORTED_OPERATION: -1020,
  INVALID_TIMESTAMP: -1021,
  INVALID_SIGNATURE: -1022,

  // Order errors
  ILLEGAL_CHARS: -1100,
  TOO_MANY_PARAMETERS: -1101,
  MANDATORY_PARAM_EMPTY_OR_MALFORMED: -1102,
  UNKNOWN_PARAM: -1103,
  UNREAD_PARAMETERS: -1104,
  PARAM_EMPTY: -1105,
  PARAM_NOT_REQUIRED: -1106,
  NO_DEPTH: -1112,
  TIF_NOT_REQUIRED: -1114,
  INVALID_TIF: -1115,
  INVALID_ORDER_TYPE: -1116,
  INVALID_SIDE: -1117,
  EMPTY_NEW_CL_ORD_ID: -1118,
  EMPTY_ORG_CL_ORD_ID: -1119,
  BAD_INTERVAL: -1120,
  BAD_SYMBOL: -1121,
  INVALID_LISTEN_KEY: -1125,
  MORE_THAN_XX_HOURS: -1127,
  OPTIONAL_PARAMS_BAD_COMBO: -1128,
  INVALID_PARAMETER: -1130,

  // Trading errors
  NEW_ORDER_REJECTED: -2010,
  CANCEL_REJECTED: -2011,
  NO_SUCH_ORDER: -2013,
  BAD_API_KEY_FMT: -2014,
  REJECTED_MBX_KEY: -2015,
  NO_TRADING_SYMBOL: -2016,

  // Account errors
  INSUFFICIENT_BALANCE: -2019,

  // Filter failures
  PRICE_FILTER: -1013,
  LOT_SIZE: -1013,
  MIN_NOTIONAL: -1013,
  PERCENT_PRICE: -1013,
  MARKET_LOT_SIZE: -1013,
  MAX_NUM_ORDERS: -1013,
  MAX_ALGO_ORDERS: -1013,
} as const;

type BinanceErrorCode = (typeof BINANCE_ERROR_CODES)[keyof typeof BINANCE_ERROR_CODES];

/**
 * Binance API error class
 */
export class BinanceApiError extends BaseError {
  public override readonly code: string;
  public readonly binanceCode: number;
  public readonly binanceMessage: string;

  constructor(message: string, binanceCode: number, binanceMessage: string, cause?: Error) {
    super(message, `BINANCE_API_ERROR_${binanceCode}`, cause);
    this.binanceCode = binanceCode;
    this.binanceMessage = binanceMessage;
    this.code = `BINANCE_API_ERROR_${binanceCode}`;
    this.name = 'BinanceApiError';
  }

  /**
   * Create error from Binance API response
   */
  static fromBinanceError(error: BinanceError, context?: string): BinanceApiError {
    const contextMessage = context ? `${context}: ` : '';
    const message = `${contextMessage}${error.msg} (Code: ${error.code})`;

    return new BinanceApiError(message, error.code, error.msg);
  }

  /**
   * Check if error is retryable
   */
  public isRetryable(): boolean {
    const retryableCodes: BinanceErrorCode[] = [
      BINANCE_ERROR_CODES.TOO_MANY_REQUESTS,
      BINANCE_ERROR_CODES.TIMEOUT,
      BINANCE_ERROR_CODES.SERVICE_SHUTTING_DOWN,
      BINANCE_ERROR_CODES.DISCONNECTED,
    ];

    return retryableCodes.includes(this.binanceCode as BinanceErrorCode);
  }

  /**
   * Check if error is due to rate limiting
   */
  public isRateLimited(): boolean {
    return this.binanceCode === BINANCE_ERROR_CODES.TOO_MANY_REQUESTS;
  }

  /**
   * Check if error is due to insufficient balance
   */
  public isInsufficientBalance(): boolean {
    return this.binanceCode === BINANCE_ERROR_CODES.INSUFFICIENT_BALANCE;
  }

  /**
   * Check if error is authentication related
   */
  public isAuthenticationError(): boolean {
    const authCodes: BinanceErrorCode[] = [
      BINANCE_ERROR_CODES.UNAUTHORIZED,
      BINANCE_ERROR_CODES.INVALID_TIMESTAMP,
      BINANCE_ERROR_CODES.INVALID_SIGNATURE,
      BINANCE_ERROR_CODES.BAD_API_KEY_FMT,
      BINANCE_ERROR_CODES.REJECTED_MBX_KEY,
    ];

    return authCodes.includes(this.binanceCode as BinanceErrorCode);
  }

  /**
   * Check if error is due to invalid order parameters
   */
  public isOrderParameterError(): boolean {
    const orderParamCodes: BinanceErrorCode[] = [
      BINANCE_ERROR_CODES.ILLEGAL_CHARS,
      BINANCE_ERROR_CODES.MANDATORY_PARAM_EMPTY_OR_MALFORMED,
      BINANCE_ERROR_CODES.INVALID_ORDER_TYPE,
      BINANCE_ERROR_CODES.INVALID_SIDE,
      BINANCE_ERROR_CODES.INVALID_TIF,
      BINANCE_ERROR_CODES.BAD_SYMBOL,
      BINANCE_ERROR_CODES.PRICE_FILTER,
      BINANCE_ERROR_CODES.LOT_SIZE,
      BINANCE_ERROR_CODES.MIN_NOTIONAL,
    ];

    return orderParamCodes.includes(this.binanceCode as BinanceErrorCode);
  }
}

/**
 * Rate limit error
 */
export class BinanceRateLimitError extends BinanceApiError {
  public readonly retryAfter?: number | undefined;

  constructor(message: string, retryAfter?: number, cause?: Error) {
    super(message, BINANCE_ERROR_CODES.TOO_MANY_REQUESTS, 'Rate limit exceeded', cause);
    this.retryAfter = retryAfter;
    this.name = 'BinanceRateLimitError';
  }
}

/**
 * WebSocket connection error
 */
export class BinanceWebSocketError extends BaseError {
  constructor(message: string, cause?: Error) {
    super(message, 'BINANCE_WEBSOCKET_ERROR', cause);
    this.name = 'BinanceWebSocketError';
  }
}

/**
 * Order validation error
 */
export class BinanceOrderValidationError extends BaseError {
  public readonly symbol: string;
  public readonly orderParams: any;

  constructor(message: string, symbol: string, orderParams: any, cause?: Error) {
    super(message, 'BINANCE_ORDER_VALIDATION_ERROR', cause);
    this.symbol = symbol;
    this.orderParams = orderParams;
    this.name = 'BinanceOrderValidationError';
  }
}

/**
 * Symbol filter error
 */
export class BinanceSymbolFilterError extends BinanceOrderValidationError {
  public readonly filterType: string;

  constructor(
    message: string,
    symbol: string,
    filterType: string,
    orderParams: any,
    cause?: Error
  ) {
    super(message, symbol, orderParams, cause);
    this.filterType = filterType;
    this.name = 'BinanceSymbolFilterError';
  }
}
