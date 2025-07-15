/**
 * Jest test setup file
 * Configures global test environment and utilities
 */

import { jest } from '@jest/globals';

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  // Uncomment to silence console output during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock process.env for consistent testing
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
  
  // Clean up process event listeners to prevent memory leaks
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidConfig(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidConfig(received) {
    const pass =
      typeof received === 'object' &&
      received !== null &&
      'tradeMode' in received &&
      'exchange' in received &&
      'maxBudget' in received &&
      'symbols' in received &&
      'apiKeys' in received &&
      'strategySettings' in received &&
      'binanceSettings' in received &&
      'logging' in received;

    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid config`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid config`,
        pass: false,
      };
    }
  },
});

// Test timeout
jest.setTimeout(10000);

// Add a test to prevent "no tests" error
describe('Test Setup', () => {
  it('should configure test environment properly', () => {
    expect((global as any).WebSocket).toBeDefined();
    expect(global.console).toBeDefined();
  });
});
