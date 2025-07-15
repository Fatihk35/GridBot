/**
 * Rate limiter for Binance API calls
 */

import { Logger } from '@/utils/logger';
import { BinanceRateLimitError } from '@/utils/binanceErrors';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerDay: number;
  orderRateLimitPerSecond: number;
  orderRateLimitPerDay: number;
}

/**
 * Default rate limits based on Binance documentation
 */
const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  requestsPerSecond: 10, // Conservative limit
  requestsPerMinute: 1200,
  requestsPerDay: 100000,
  orderRateLimitPerSecond: 10,
  orderRateLimitPerDay: 200000,
};

/**
 * Request type for tracking different rate limits
 */
type RequestType = 'general' | 'order';

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly logger: Logger;

  // Request tracking
  private requestTimes: Map<RequestType, number[]> = new Map();
  private lastRequestTime: number = 0;

  // Counters
  private dailyRequestCount: number = 0;
  private dailyOrderCount: number = 0;
  private lastResetTime: number = Date.now();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
    this.logger = Logger.getInstance();

    // Initialize request tracking
    this.requestTimes.set('general', []);
    this.requestTimes.set('order', []);

    this.logger.info('Rate limiter initialized', {
      config: this.config,
    });
  }

  /**
   * Wait for rate limit clearance before making a request
   */
  public async waitForRateLimit(requestType: RequestType = 'general'): Promise<void> {
    this.resetDailyCountersIfNeeded();

    const now = Date.now();
    const requestTimes = this.requestTimes.get(requestType) || [];

    // Check daily limits
    if (requestType === 'general' && this.dailyRequestCount >= this.config.requestsPerDay) {
      throw new BinanceRateLimitError('Daily request limit exceeded');
    }

    if (requestType === 'order' && this.dailyOrderCount >= this.config.orderRateLimitPerDay) {
      throw new BinanceRateLimitError('Daily order limit exceeded');
    }

    // Check per-second limits
    const secondAgo = now - 1000;
    const recentRequests = requestTimes.filter(time => time > secondAgo);

    const secondLimit =
      requestType === 'order' ? this.config.orderRateLimitPerSecond : this.config.requestsPerSecond;

    if (recentRequests.length >= secondLimit) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = 1000 - (now - oldestRequest) + 10; // Add 10ms buffer

      this.logger.debug(`Rate limit hit, waiting ${waitTime}ms`, {
        requestType,
        recentRequests: recentRequests.length,
        limit: secondLimit,
      });

      await this.sleep(waitTime);
    }

    // Check per-minute limits for general requests
    if (requestType === 'general') {
      const minuteAgo = now - 60000;
      const requestsLastMinute = requestTimes.filter(time => time > minuteAgo);

      if (requestsLastMinute.length >= this.config.requestsPerMinute) {
        const oldestRequest = Math.min(...requestsLastMinute);
        const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer

        this.logger.debug(`Minute rate limit hit, waiting ${waitTime}ms`, {
          requestsLastMinute: requestsLastMinute.length,
          limit: this.config.requestsPerMinute,
        });

        await this.sleep(waitTime);
      }
    }

    // Ensure minimum time between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 100; // 100ms minimum between requests

    if (timeSinceLastRequest < minInterval) {
      await this.sleep(minInterval - timeSinceLastRequest);
    }
  }

  /**
   * Record a successful request
   */
  public recordRequest(requestType: RequestType = 'general'): void {
    const now = Date.now();

    // Record request time
    const requestTimes = this.requestTimes.get(requestType) || [];
    requestTimes.push(now);

    // Clean old request times (keep only last hour)
    const hourAgo = now - 3600000;
    const recentTimes = requestTimes.filter(time => time > hourAgo);
    this.requestTimes.set(requestType, recentTimes);

    // Update counters
    if (requestType === 'general') {
      this.dailyRequestCount++;
    } else if (requestType === 'order') {
      this.dailyOrderCount++;
    }

    this.lastRequestTime = now;

    this.logger.debug('Request recorded', {
      requestType,
      dailyRequestCount: this.dailyRequestCount,
      dailyOrderCount: this.dailyOrderCount,
    });
  }

  /**
   * Handle rate limit exceeded response from API
   */
  public handleRateLimitExceeded(retryAfter?: number): void {
    this.logger.warn('Rate limit exceeded by API', { retryAfter });

    // Increase the wait time for future requests
    if (retryAfter) {
      // Add penalty time to prevent immediate retry
      this.lastRequestTime = Date.now() + retryAfter * 1000;
    }
  }

  /**
   * Get current rate limit status
   */
  public getStatus(): {
    dailyRequestCount: number;
    dailyOrderCount: number;
    requestsPerSecond: number;
    orderRequestsPerSecond: number;
    isNearLimit: boolean;
  } {
    const now = Date.now();
    const secondAgo = now - 1000;

    const generalRequests = this.requestTimes.get('general') || [];
    const orderRequests = this.requestTimes.get('order') || [];

    const requestsPerSecond = generalRequests.filter(time => time > secondAgo).length;
    const orderRequestsPerSecond = orderRequests.filter(time => time > secondAgo).length;

    const isNearLimit =
      this.dailyRequestCount > this.config.requestsPerDay * 0.9 ||
      this.dailyOrderCount > this.config.orderRateLimitPerDay * 0.9 ||
      requestsPerSecond > this.config.requestsPerSecond * 0.8 ||
      orderRequestsPerSecond > this.config.orderRateLimitPerSecond * 0.8;

    return {
      dailyRequestCount: this.dailyRequestCount,
      dailyOrderCount: this.dailyOrderCount,
      requestsPerSecond,
      orderRequestsPerSecond,
      isNearLimit,
    };
  }

  /**
   * Reset daily counters if a new day has started
   */
  private resetDailyCountersIfNeeded(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (now - this.lastResetTime > dayInMs) {
      this.dailyRequestCount = 0;
      this.dailyOrderCount = 0;
      this.lastResetTime = now;

      this.logger.info('Daily rate limit counters reset');
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update rate limit configuration
   */
  public updateConfig(newConfig: Partial<RateLimitConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.info('Rate limiter configuration updated', {
      config: this.config,
    });
  }
}
