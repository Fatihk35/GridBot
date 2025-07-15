declare module '@binance/connector' {
  export interface SpotOptions {
    baseURL?: string;
    timeout?: number;
    recvWindow?: number;
  }

  export interface ApiResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
  }

  export interface KlineParams {
    startTime?: number;
    endTime?: number;
    limit?: number;
  }

  export interface OrderParams {
    quantity?: number;
    quoteOrderQty?: number;
    price?: number;
    newClientOrderId?: string;
    stopPrice?: number;
    icebergQty?: number;
    newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
    timeInForce?: string;
  }

  export interface CancelOrderParams {
    orderId?: number;
    origClientOrderId?: string;
    newClientOrderId?: string;
  }

  export interface QueryOrderParams {
    orderId?: number;
    origClientOrderId?: string;
  }

  export class Spot {
    constructor(apiKey?: string, apiSecret?: string, options?: SpotOptions);

    klines(symbol: string, interval: string, options?: KlineParams): Promise<ApiResponse>;
    account(): Promise<ApiResponse>;
    newOrder(
      symbol: string,
      side: string,
      type: string,
      options?: OrderParams
    ): Promise<ApiResponse>;
    cancelOrder(symbol: string, options?: CancelOrderParams): Promise<ApiResponse>;
    getOrder(symbol: string, options?: QueryOrderParams): Promise<ApiResponse>;
    tickerPrice(symbol?: string): Promise<ApiResponse>;
    ticker24hr(symbol?: string): Promise<ApiResponse>;
    exchangeInfo(): Promise<ApiResponse>;
  }
}
