/**
 * Binance API Service Implementation
 * Provides comprehensive interface to Binance Spot API with error handling,
 * rate limiting, and WebSocket support
 */

import { Spot } from '@binance/connector';
import WebSocket from 'ws';
import { z } from 'zod';

import { BotConfigType } from '../config/schema';
import { Logger } from '../utils/logger';
import { RateLimiter } from '../utils/rateLimiter';
import {
  BinanceApiError,
  BinanceRateLimitError,
  BinanceWebSocketError,
  BinanceOrderValidationError,
  BinanceSymbolFilterError,
  BINANCE_ERROR_CODES,
} from '../utils/binanceErrors';

import {
  BinanceInterval,
  BinanceOrderSide,
  BinanceOrderType,
  BinanceTimeInForce,
  BinanceKlineRaw,
  BinanceKline,
  BinanceOrderResponse,
  BinanceAccountInfo,
  BinanceExchangeInfo,
  BinanceSymbolInfo,
  BinanceSymbolFilter,
  BinanceWebSocketKline,
  BinanceError,
  BinanceTickerPrice,
  BinanceTicker24hr,
  CreateOrderParams,
  QueryOrderParams,
  CancelOrderParams,
  GetKlinesParams,
  BinanceKlineSchema,
} from '../types/binance';

/**
 * Binance service configuration
 */
interface BinanceServiceConfig {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
  recvWindow?: number;
  timeout?: number;
  maxRetries?: number;
  baseURL?: string;
}

/**
 * WebSocket subscription callback
 */
type WebSocketCallback<T = any> = (data: T) => void;

/**
 * WebSocket subscription
 */
interface WebSocketSubscription {
  id: string;
  stream: string;
  callback: WebSocketCallback;
  ws?: WebSocket;
}

/**
 * Binance API Service
 */
export class BinanceService {
  private readonly config: BinanceServiceConfig;
  private readonly client: Spot;
  private readonly logger: Logger;
  private readonly rateLimiter: RateLimiter;

  // Exchange information cache
  private exchangeInfo: BinanceExchangeInfo | null = null;
  private symbolInfoCache: Map<string, BinanceSymbolInfo> = new Map();
  private lastExchangeInfoUpdate: number = 0;

  // WebSocket management
  private wsSubscriptions: Map<string, WebSocketSubscription> = new Map();
  private wsReconnectAttempts: Map<string, number> = new Map();
  private wsReconnectDelay: number = 1000;
  private maxWsReconnectAttempts: number = 10;

  constructor(config: BotConfigType) {
    // Validate budget amount
    if (config.maxBudget.amount <= 0) {
      throw new Error('Budget amount must be positive');
    }

    this.config = {
      apiKey: config.apiKeys.binanceApiKey,
      secretKey: config.apiKeys.binanceSecretKey,
      testnet: config.binanceSettings.testnet,
      recvWindow: 5000,
      timeout: 60000,
      maxRetries: 3,
    };

    // Initialize Binance client
    this.client = new Spot(this.config.apiKey, this.config.secretKey, {
      baseURL: this.config.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com',
      timeout: this.config.timeout!,
      recvWindow: this.config.recvWindow!,
    });

    this.logger = Logger.getInstance();
    this.rateLimiter = new RateLimiter();

    this.logger.info('BinanceService initialized', {
      testnet: this.config.testnet,
      recvWindow: this.config.recvWindow,
    });
  }

  /**
   * Initialize the service by fetching exchange information
   */
  public async initialize(): Promise<void> {
    try {
      await this.updateExchangeInfo();
      this.logger.info('BinanceService initialization completed');
    } catch (error) {
      this.logger.error('Failed to initialize BinanceService', { error });
      throw error;
    }
  }

  /**
   * Get historical klines/candlestick data
   */
  public async getHistoricalKlines(params: GetKlinesParams): Promise<BinanceKline[]> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        const requestParams: any = {
          limit: params.limit || 1000,
        };

        if (params.startTime !== undefined) {
          requestParams.startTime = params.startTime;
        }

        if (params.endTime !== undefined) {
          requestParams.endTime = params.endTime;
        }

        return await this.client.klines(params.symbol, params.interval, requestParams);
      });

      this.rateLimiter.recordRequest('general');

      // Validate and transform response
      const rawKlines = z.array(BinanceKlineSchema).parse(response.data);

      return rawKlines.map(this.transformKlineData);
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'getHistoricalKlines');
      throw binanceError;
    }
  }

  /**
   * Get account information
   */
  public async getAccountInfo(): Promise<BinanceAccountInfo> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.account();
      });

      this.rateLimiter.recordRequest('general');
      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'getAccountInfo');
      throw binanceError;
    }
  }

  /**
   * Create a new order
   */
  public async createOrder(params: CreateOrderParams): Promise<BinanceOrderResponse> {
    // Validate order parameters against symbol filters
    await this.validateOrderParameters(params);

    await this.rateLimiter.waitForRateLimit('order');

    try {
      const response = await this.executeWithRetry(async () => {
        const orderParams: any = {
          newOrderRespType: params.newOrderRespType || 'RESULT',
        };

        if (params.quantity !== undefined) orderParams.quantity = params.quantity;
        if (params.quoteOrderQty !== undefined) orderParams.quoteOrderQty = params.quoteOrderQty;
        if (params.price !== undefined) orderParams.price = params.price;
        if (params.newClientOrderId !== undefined)
          orderParams.newClientOrderId = params.newClientOrderId;
        if (params.stopPrice !== undefined) orderParams.stopPrice = params.stopPrice;
        if (params.icebergQty !== undefined) orderParams.icebergQty = params.icebergQty;
        if (params.timeInForce !== undefined) orderParams.timeInForce = params.timeInForce;

        return await this.client.newOrder(params.symbol, params.side, params.type, orderParams);
      });

      this.rateLimiter.recordRequest('order');

      this.logger.info('Order created successfully', {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        orderId: response.data.orderId,
      });

      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'createOrder');
      throw binanceError;
    }
  }

  /**
   * Cancel an existing order
   */
  public async cancelOrder(params: CancelOrderParams): Promise<BinanceOrderResponse> {
    await this.rateLimiter.waitForRateLimit('order');

    try {
      const response = await this.executeWithRetry(async () => {
        const cancelParams: any = {};

        if (params.orderId !== undefined) cancelParams.orderId = params.orderId;
        if (params.origClientOrderId !== undefined)
          cancelParams.origClientOrderId = params.origClientOrderId;
        if (params.newClientOrderId !== undefined)
          cancelParams.newClientOrderId = params.newClientOrderId;

        return await this.client.cancelOrder(params.symbol, cancelParams);
      });

      this.rateLimiter.recordRequest('order');

      this.logger.info('Order cancelled successfully', {
        symbol: params.symbol,
        orderId: params.orderId || params.origClientOrderId,
      });

      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'cancelOrder');
      throw binanceError;
    }
  }

  /**
   * Query order status
   */
  public async queryOrder(params: QueryOrderParams): Promise<BinanceOrderResponse> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        const queryParams: any = {};

        if (params.orderId !== undefined) queryParams.orderId = params.orderId;
        if (params.origClientOrderId !== undefined)
          queryParams.origClientOrderId = params.origClientOrderId;

        return await this.client.getOrder(params.symbol, queryParams);
      });

      this.rateLimiter.recordRequest('general');
      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'queryOrder');
      throw binanceError;
    }
  }

  /**
   * Get symbol price ticker
   */
  public async getSymbolPrice(symbol: string): Promise<BinanceTickerPrice> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.tickerPrice(symbol);
      });

      this.rateLimiter.recordRequest('general');
      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'getSymbolPrice');
      throw binanceError;
    }
  }

  /**
   * Get 24hr ticker statistics
   */
  public async get24hrTicker(symbol?: string): Promise<BinanceTicker24hr | BinanceTicker24hr[]> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.ticker24hr(symbol);
      });

      this.rateLimiter.recordRequest('general');
      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'get24hrTicker');
      throw binanceError;
    }
  }

  /**
   * Subscribe to kline/candlestick WebSocket updates
   */
  public subscribeToKlineUpdates(
    symbol: string,
    interval: BinanceInterval,
    callback: WebSocketCallback<BinanceWebSocketKline>
  ): string {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    const subscriptionId = `${stream}_${Date.now()}`;

    const subscription: WebSocketSubscription = {
      id: subscriptionId,
      stream,
      callback,
    };

    this.wsSubscriptions.set(subscriptionId, subscription);
    this.connectWebSocket(subscription);

    this.logger.info('WebSocket kline subscription created', {
      subscriptionId,
      symbol,
      interval,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from WebSocket updates
   */
  public unsubscribeFromUpdates(subscriptionId: string): void {
    const subscription = this.wsSubscriptions.get(subscriptionId);
    if (!subscription) {
      this.logger.warn('Subscription not found', { subscriptionId });
      return;
    }

    if (subscription.ws) {
      subscription.ws.close();
    }

    this.wsSubscriptions.delete(subscriptionId);
    this.wsReconnectAttempts.delete(subscriptionId);

    this.logger.info('WebSocket subscription cancelled', { subscriptionId });
  }

  /**
   * Get exchange information
   */
  public async getExchangeInfo(): Promise<BinanceExchangeInfo> {
    const now = Date.now();
    const cacheValidDuration = 60 * 60 * 1000; // 1 hour

    if (this.exchangeInfo && now - this.lastExchangeInfoUpdate < cacheValidDuration) {
      return this.exchangeInfo;
    }

    await this.updateExchangeInfo();
    return this.exchangeInfo!;
  }

  /**
   * Get symbol information
   */
  public async getSymbolInfo(symbol: string): Promise<BinanceSymbolInfo | null> {
    await this.getExchangeInfo(); // Ensure we have latest exchange info
    return this.symbolInfoCache.get(symbol) || null;
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus(): ReturnType<RateLimiter['getStatus']> {
    return this.rateLimiter.getStatus();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Close all WebSocket connections
    for (const [subscriptionId] of this.wsSubscriptions) {
      this.unsubscribeFromUpdates(subscriptionId);
    }

    this.logger.info('BinanceService destroyed');
  }

  /**
   * Update exchange information and symbol cache
   */
  private async updateExchangeInfo(): Promise<void> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.exchangeInfo();
      });

      this.rateLimiter.recordRequest('general');
      this.exchangeInfo = response.data;
      this.lastExchangeInfoUpdate = Date.now();

      // Update symbol cache
      this.symbolInfoCache.clear();
      if (this.exchangeInfo?.symbols) {
        for (const symbolInfo of this.exchangeInfo.symbols) {
          this.symbolInfoCache.set(symbolInfo.symbol, symbolInfo);
        }
      }

      this.logger.info('Exchange info updated', {
        symbolCount: this.exchangeInfo?.symbols?.length || 0,
      });
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'updateExchangeInfo');
      throw binanceError;
    }
  }

  /**
   * Validate order parameters against symbol filters
   */
  private async validateOrderParameters(params: CreateOrderParams): Promise<void> {
    const symbolInfo = await this.getSymbolInfo(params.symbol);

    if (!symbolInfo) {
      throw new BinanceOrderValidationError(
        `Symbol ${params.symbol} not found`,
        params.symbol,
        params
      );
    }

    // Check if symbol is active
    if (symbolInfo.status !== 'TRADING') {
      throw new BinanceOrderValidationError(
        `Symbol ${params.symbol} is not trading (status: ${symbolInfo.status})`,
        params.symbol,
        params
      );
    }

    // Validate against filters
    for (const filter of symbolInfo.filters) {
      this.validateAgainstFilter(filter, params);
    }
  }

  /**
   * Validate order against specific symbol filter
   */
  private validateAgainstFilter(filter: BinanceSymbolFilter, params: CreateOrderParams): void {
    switch (filter.filterType) {
      case 'PRICE_FILTER':
        if (params.price !== undefined) {
          const price = params.price;
          const minPrice = parseFloat(filter.minPrice || '0');
          const maxPrice = parseFloat(filter.maxPrice || '999999999');
          const tickSize = parseFloat(filter.tickSize || '0');

          if (price < minPrice || price > maxPrice) {
            throw new BinanceSymbolFilterError(
              `Price ${price} outside allowed range [${minPrice}, ${maxPrice}]`,
              params.symbol,
              'PRICE_FILTER',
              params
            );
          }

          if (tickSize > 0 && price % tickSize !== 0) {
            throw new BinanceSymbolFilterError(
              `Price ${price} does not meet tick size requirement ${tickSize}`,
              params.symbol,
              'PRICE_FILTER',
              params
            );
          }
        }
        break;

      case 'LOT_SIZE':
        if (params.quantity !== undefined) {
          const quantity = params.quantity;
          const minQty = parseFloat(filter.minQty || '0');
          const maxQty = parseFloat(filter.maxQty || '999999999');
          const stepSize = parseFloat(filter.stepSize || '0');

          if (quantity < minQty || quantity > maxQty) {
            throw new BinanceSymbolFilterError(
              `Quantity ${quantity} outside allowed range [${minQty}, ${maxQty}]`,
              params.symbol,
              'LOT_SIZE',
              params
            );
          }

          if (stepSize > 0 && quantity % stepSize !== 0) {
            throw new BinanceSymbolFilterError(
              `Quantity ${quantity} does not meet step size requirement ${stepSize}`,
              params.symbol,
              'LOT_SIZE',
              params
            );
          }
        }
        break;

      case 'MIN_NOTIONAL':
        if (params.quantity !== undefined && params.price !== undefined) {
          const notional = params.quantity * params.price;
          const minNotional = parseFloat(filter.minNotional || '0');

          if (notional < minNotional) {
            throw new BinanceSymbolFilterError(
              `Order notional ${notional} below minimum ${minNotional}`,
              params.symbol,
              'MIN_NOTIONAL',
              params
            );
          }
        }
        break;
    }
  }

  /**
   * Connect WebSocket for subscription
   */
  private connectWebSocket(subscription: WebSocketSubscription): void {
    const baseUrl = this.config.testnet
      ? 'wss://testnet.binance.vision/ws/'
      : 'wss://stream.binance.com:9443/ws/';

    const wsUrl = `${baseUrl}${subscription.stream}`;

    try {
      const ws = new WebSocket(wsUrl);
      subscription.ws = ws;

      ws.on('open', () => {
        this.logger.info('WebSocket connected', {
          subscriptionId: subscription.id,
          stream: subscription.stream,
        });
        this.wsReconnectAttempts.set(subscription.id, 0);
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          subscription.callback(message);
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message', {
            error,
            subscriptionId: subscription.id,
          });
        }
      });

      ws.on('error', error => {
        this.logger.error('WebSocket error', {
          error,
          subscriptionId: subscription.id,
        });
      });

      ws.on('close', (code, reason) => {
        this.logger.warn('WebSocket closed', {
          code,
          reason: reason.toString(),
          subscriptionId: subscription.id,
        });

        this.handleWebSocketReconnect(subscription);
      });
    } catch (error) {
      throw new BinanceWebSocketError(`Failed to connect WebSocket: ${error}`, error as Error);
    }
  }

  /**
   * Handle WebSocket reconnection
   */
  private handleWebSocketReconnect(subscription: WebSocketSubscription): void {
    const attempts = this.wsReconnectAttempts.get(subscription.id) || 0;

    if (attempts >= this.maxWsReconnectAttempts) {
      this.logger.error('Max WebSocket reconnection attempts reached', {
        subscriptionId: subscription.id,
        attempts,
      });
      return;
    }

    const delay = this.wsReconnectDelay * Math.pow(2, attempts); // Exponential backoff
    this.wsReconnectAttempts.set(subscription.id, attempts + 1);

    this.logger.info('Attempting WebSocket reconnection', {
      subscriptionId: subscription.id,
      attempt: attempts + 1,
      delay,
    });

    setTimeout(() => {
      if (this.wsSubscriptions.has(subscription.id)) {
        this.connectWebSocket(subscription);
      }
    }, delay);
  }

  /**
   * Transform raw kline data to typed format
   */
  private transformKlineData(raw: BinanceKlineRaw): BinanceKline {
    return {
      openTime: raw[0],
      open: parseFloat(raw[1]),
      high: parseFloat(raw[2]),
      low: parseFloat(raw[3]),
      close: parseFloat(raw[4]),
      volume: parseFloat(raw[5]),
      closeTime: raw[6],
      quoteAssetVolume: parseFloat(raw[7]),
      numberOfTrades: raw[8],
      takerBuyBaseAssetVolume: parseFloat(raw[9]),
      takerBuyQuoteAssetVolume: parseFloat(raw[10]),
    };
  }

  /**
   * Execute function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.config.maxRetries || 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (this.isRetryableError(error)) {
          const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff

          this.logger.warn('Request failed, retrying', {
            attempt,
            maxRetries,
            delay,
            error: lastError.message,
          });

          if (attempt < maxRetries) {
            await this.sleep(delay);
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return true;
    }

    // Binance rate limit or server errors
    if (error.response?.data?.code) {
      const binanceError = BinanceApiError.fromBinanceError(error.response.data);
      return binanceError.isRetryable();
    }

    return false;
  }

  /**
   * Handle Binance API errors
   */
  private handleBinanceError(error: any, context: string): Error {
    this.logger.error('Binance API error', { error, context });

    // Handle axios errors with Binance response
    if (error.response?.data?.code && error.response?.data?.msg) {
      const binanceError: BinanceError = error.response.data;

      // Handle rate limiting
      if (binanceError.code === BINANCE_ERROR_CODES.TOO_MANY_REQUESTS) {
        const retryAfter = this.extractRetryAfter(error.response.headers);
        this.rateLimiter.handleRateLimitExceeded(retryAfter);
        return new BinanceRateLimitError(binanceError.msg, retryAfter);
      }

      return BinanceApiError.fromBinanceError(binanceError);
    }

    // Handle network and other errors
    return new BinanceApiError(
      `${context} failed: ${error.message}`,
      BINANCE_ERROR_CODES.UNKNOWN,
      error.message,
      error
    );
  }

  /**
   * Extract retry-after value from response headers
   */
  private extractRetryAfter(headers: any): number {
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    return retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000; // Default to 1 minute
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get historical candlestick data
   */
  public async getHistoricalData(
    symbol: string,
    interval: BinanceInterval,
    limit: number = 500
  ): Promise<
    Array<{
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      timestamp: number;
    }>
  > {
    const klines = await this.getHistoricalKlines({
      symbol,
      interval,
      limit,
    });

    return klines.map((kline: BinanceKline) => ({
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      timestamp: kline.openTime,
    }));
  }

  /**
   * Get latest candlestick data for a symbol
   */
  public async getLatestCandle(
    symbol: string,
    interval: BinanceInterval
  ): Promise<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  }> {
    const klines = await this.getHistoricalKlines({
      symbol,
      interval,
      limit: 1,
    });

    if (klines.length === 0) {
      throw new BinanceApiError(
        `No candlestick data available for ${symbol}`,
        BINANCE_ERROR_CODES.UNKNOWN,
        `No candlestick data available for ${symbol}`
      );
    }

    const kline = klines[0];
    if (!kline) {
      throw new BinanceApiError(
        `No valid candlestick data available for ${symbol}`,
        BINANCE_ERROR_CODES.UNKNOWN,
        'No data returned'
      );
    }

    return {
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      timestamp: kline.openTime,
    };
  }

  /**
   * Place a limit order
   */
  public async placeLimitOrder(
    symbol: string,
    side: BinanceOrderSide,
    quantity: number,
    price: number
  ): Promise<BinanceOrderResponse> {
    return this.createOrder({
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity,
      price,
    });
  }

  /**
   * Get open orders for a symbol
   */
  public async getOpenOrders(symbol?: string): Promise<BinanceOrderResponse[]> {
    await this.rateLimiter.waitForRateLimit('general');

    try {
      const response = await this.executeWithRetry(async () => {
        const params: any = {};
        if (symbol) {
          params.symbol = symbol;
        }
        return await (this.client as any).openOrders(params);
      });

      this.rateLimiter.recordRequest('general');
      return response.data;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'getOpenOrders');
      throw binanceError;
    }
  }

  /**
   * Cancel all open orders for a symbol
   */
  public async cancelAllOrders(symbol: string): Promise<BinanceOrderResponse[]> {
    try {
      // First get all open orders for the symbol
      const openOrders = await this.getOpenOrders(symbol);

      const cancelledOrders: BinanceOrderResponse[] = [];

      // Cancel each order individually
      for (const order of openOrders) {
        try {
          const cancelledOrder = await this.cancelOrder({
            symbol: order.symbol,
            orderId: order.orderId,
          });
          cancelledOrders.push(cancelledOrder);
        } catch (error) {
          this.logger.warn(`Failed to cancel order ${order.orderId}`, { error });
        }
      }

      this.logger.info('Orders cancelled for symbol', {
        symbol,
        totalOrders: openOrders.length,
        cancelledOrders: cancelledOrders.length,
      });

      return cancelledOrders;
    } catch (error) {
      const binanceError = this.handleBinanceError(error, 'cancelAllOrders');
      throw binanceError;
    }
  }
}
