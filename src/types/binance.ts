/**
 * Binance API related types and interfaces
 */

import { z } from 'zod';

/**
 * Binance kline/candlestick intervals
 */
export type BinanceInterval =
  | '1s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';

/**
 * Binance order side
 */
export type BinanceOrderSide = 'BUY' | 'SELL';

/**
 * Binance order type
 */
export type BinanceOrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP_LOSS'
  | 'STOP_LOSS_LIMIT'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_LIMIT'
  | 'LIMIT_MAKER';

/**
 * Binance order status
 */
export type BinanceOrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'PENDING_CANCEL'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Binance time in force
 */
export type BinanceTimeInForce = 'GTC' | 'IOC' | 'FOK';

/**
 * Raw kline data from Binance API
 */
export const BinanceKlineSchema = z.tuple([
  z.number(), // Open time
  z.string(), // Open price
  z.string(), // High price
  z.string(), // Low price
  z.string(), // Close price
  z.string(), // Volume
  z.number(), // Close time
  z.string(), // Quote asset volume
  z.number(), // Number of trades
  z.string(), // Taker buy base asset volume
  z.string(), // Taker buy quote asset volume
  z.string(), // Ignore
]);

export type BinanceKlineRaw = z.infer<typeof BinanceKlineSchema>;

/**
 * Processed kline/candlestick data
 */
export interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteAssetVolume: number;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: number;
  takerBuyQuoteAssetVolume: number;
}

/**
 * Binance order response
 */
export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  timeInForce: BinanceTimeInForce;
  type: BinanceOrderType;
  side: BinanceOrderSide;
  fills: BinanceOrderFill[];
}

/**
 * Binance order fill
 */
export interface BinanceOrderFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
}

/**
 * Binance account balance
 */
export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

/**
 * Binance account information
 */
export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: BinanceBalance[];
  permissions: string[];
}

/**
 * Binance exchange information
 */
export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  rateLimits: BinanceRateLimit[];
  exchangeFilters: any[];
  symbols: BinanceSymbolInfo[];
}

/**
 * Binance rate limit information
 */
export interface BinanceRateLimit {
  rateLimitType: string;
  interval: string;
  intervalNum: number;
  limit: number;
}

/**
 * Binance symbol information
 */
export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  baseAssetPrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  quoteAssetPrecision: number;
  baseCommissionPrecision: number;
  quoteCommissionPrecision: number;
  orderTypes: BinanceOrderType[];
  icebergAllowed: boolean;
  ocoAllowed: boolean;
  quoteOrderQtyMarketAllowed: boolean;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  filters: BinanceSymbolFilter[];
  permissions: string[];
}

/**
 * Binance symbol filter
 */
export interface BinanceSymbolFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  multiplierUp?: string;
  multiplierDown?: string;
  avgPriceMins?: number;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
  applyToMarket?: boolean;
  limit?: number;
  maxNumOrders?: number;
  maxNumAlgoOrders?: number;
}

/**
 * WebSocket kline stream data
 */
export interface BinanceWebSocketKline {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

/**
 * Binance API error response
 */
export interface BinanceError {
  code: number;
  msg: string;
}

/**
 * Order parameters for creating orders
 */
export interface CreateOrderParams {
  symbol: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  newClientOrderId?: string;
  stopPrice?: number;
  icebergQty?: number;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  timeInForce?: BinanceTimeInForce;
}

/**
 * Query order parameters
 */
export interface QueryOrderParams {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}

/**
 * Cancel order parameters
 */
export interface CancelOrderParams {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
  newClientOrderId?: string;
}

/**
 * Get klines parameters
 */
export interface GetKlinesParams {
  symbol: string;
  interval: BinanceInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/**
 * Symbol price ticker
 */
export interface BinanceTickerPrice {
  symbol: string;
  price: string;
}

/**
 * Symbol price ticker 24hr
 */
export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}
