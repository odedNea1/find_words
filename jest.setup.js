// Mock p-retry to avoid ESM issues
jest.mock('p-retry', () => {
  return function mockRetry(fn) {
    return fn();
  };
});

// Silence console.time and console.timeEnd in tests
global.console.time = jest.fn();
global.console.timeEnd = jest.fn();

// Set test environment variables if needed
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379'; 