import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initialiseLogger } from '../src/utils/index.js';

// Set up test environment
beforeAll(() => {
    // Initialise logger with test configuration (silent by default)
    initialiseLogger({
        level: process.env.TEST_LOG_LEVEL === 'debug' ? 'debug' : 'error',
        format: 'pretty',
        output: 'stdout',
    });

    // Set test environment variables
    process.env.NODE_ENV = 'test';
});

afterAll(() => {
    // Clean up any global resources
});

beforeEach(() => {
    // Reset any per-test state
});

afterEach(() => {
    // Clean up after each test
});
