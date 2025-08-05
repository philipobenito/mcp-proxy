import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initialiseLogger } from '../src/utils/index.js';

// Set up test environment
beforeAll(() => {
    // Determine log level based on environment variables
    let logLevel = 'fatal';

    if (process.env.TEST_VERBOSE === 'true' || process.env.VITEST_VERBOSE === 'true') {
        logLevel = 'debug';
    } else if (process.env.TEST_LOG_LEVEL) {
        logLevel = process.env.TEST_LOG_LEVEL;
    }

    // Initialise logger with test configuration (fatal level to suppress most logs)
    initialiseLogger({
        level: logLevel,
        format: logLevel === 'fatal' ? 'json' : 'pretty',
        output: logLevel === 'fatal' ? 'file' : 'stdout',
        file: logLevel === 'fatal' ? '/dev/null' : undefined,
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
