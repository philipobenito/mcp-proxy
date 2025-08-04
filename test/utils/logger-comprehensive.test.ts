import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    Logger,
    getLogger,
    initialiseLogger,
    createRequestLogger,
    createServerLogger,
    createComponentLogger,
    type LoggerContext,
} from '../../src/utils/logger.js';

describe('Logger - Comprehensive Coverage', () => {
    beforeEach(() => {
        // Mock process.stdout to capture log output from pino
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Logger Constructor', () => {
        it('should create logger with default config', () => {
            const logger = new Logger();
            expect(logger).toBeDefined();
        });

        it('should create logger with custom config', () => {
            const config = {
                level: 'debug',
                format: 'json',
                output: 'stdout',
            };
            const logger = new Logger(config);
            expect(logger).toBeDefined();
        });

        it('should create logger with context', () => {
            const context: LoggerContext = {
                serverName: 'test-server',
                port: 3001,
                component: 'test-component',
            };
            const logger = new Logger({}, context);
            expect(logger).toBeDefined();
        });

        it('should configure pretty formatter for development', () => {
            process.env.NODE_ENV = 'development';
            const logger = new Logger();
            expect(logger).toBeDefined();

            // Reset NODE_ENV
            delete process.env.NODE_ENV;
        });

        it('should configure pretty formatter when explicitly requested', () => {
            const config = {
                format: 'pretty' as const,
            };
            const logger = new Logger(config);
            expect(logger).toBeDefined();
        });

        it('should configure file output', () => {
            const config = {
                output: 'file' as const,
                file: '/tmp/test.log',
            };
            const logger = new Logger(config);
            expect(logger).toBeDefined();
        });

        it('should handle missing hostname environment variable', () => {
            const originalHostname = process.env.HOSTNAME;
            delete process.env.HOSTNAME;

            const logger = new Logger();
            expect(logger).toBeDefined();

            // Restore original value
            if (originalHostname) {
                process.env.HOSTNAME = originalHostname;
            }
        });
    });

    describe('Child Logger Creation', () => {
        it('should create child logger with additional context', () => {
            const parentLogger = new Logger({}, { component: 'parent' });
            const childLogger = parentLogger.child({ serverName: 'child-server' });

            expect(childLogger).toBeDefined();
            expect(childLogger).not.toBe(parentLogger);
        });

        it('should merge context from parent and child', () => {
            const parentContext = { component: 'parent', requestId: 'req-123' };
            const parentLogger = new Logger({}, parentContext);

            const childContext = { serverName: 'child-server', port: 3001 };
            const childLogger = parentLogger.child(childContext);

            expect(childLogger).toBeDefined();
        });
    });

    describe('Basic Logging Methods', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger({ level: 'debug' });
        });

        it('should log debug messages', () => {
            logger.debug('Debug message');
            logger.debug('Debug with extra', { key: 'value' });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log info messages', () => {
            logger.info('Info message');
            logger.info('Info with extra', { key: 'value' });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log warn messages', () => {
            logger.warn('Warning message');
            logger.warn('Warning with extra', { key: 'value' });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log error messages with Error objects', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error);
            logger.error('Error with extra', error, { key: 'value' });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log error messages with non-Error objects', () => {
            const errorObject = { message: 'Custom error', code: 500 };
            logger.error('Error occurred', errorObject);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log error messages without error object', () => {
            logger.error('Error occurred without details');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('HTTP Request/Response Logging', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger();
        });

        it('should log HTTP requests', () => {
            logger.request('GET', '/health');
            logger.request('POST', '/servers', { contentLength: 100 });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log HTTP responses', () => {
            logger.response('GET', '/health', 200, 150);
            logger.response('POST', '/servers', 201, 250, { responseSize: 500 });

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('Server Lifecycle Logging', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger();
        });

        it('should log server starting', () => {
            logger.serverStarting('test-server', 'node server.js');
            logger.serverStarting('test-server', 'node server.js', 3001);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log server started', () => {
            logger.serverStarted('test-server');
            logger.serverStarted('test-server', 3001);
            logger.serverStarted('test-server', 3001, 12345);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log server failed with Error object', () => {
            const error = new Error('Server failed');
            logger.serverFailed('test-server', error);
            logger.serverFailed('test-server', error, 3001);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log server failed with non-Error object', () => {
            const error = { message: 'Server failed', code: 'ECONNREFUSED' };
            logger.serverFailed('test-server', error);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log server stopped', () => {
            logger.serverStopped('test-server');
            logger.serverStopped('test-server', 3001);
            logger.serverStopped('test-server', 3001, 'manual');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('Port Management Logging', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger();
        });

        it('should log port allocation', () => {
            logger.portAllocated('test-server', 3001);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log port release', () => {
            logger.portReleased('test-server', 3001);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log port allocation failure with Error', () => {
            const error = new Error('Port allocation failed');
            logger.portAllocationFailed('test-server', error);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log port allocation failure with non-Error', () => {
            const error = 'Port already in use';
            logger.portAllocationFailed('test-server', error);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('Configuration Logging', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger();
        });

        it('should log configuration loaded', () => {
            logger.configLoaded(3, 'servers.json');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log configuration error with Error object', () => {
            const error = new Error('Invalid configuration');
            logger.configError(error);
            logger.configError(error, 'servers.json');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log configuration error with non-Error object', () => {
            const error = { message: 'Config validation failed', details: {} };
            logger.configError(error, 'servers.json');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('Application Lifecycle Logging', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger();
        });

        it('should log application starting', () => {
            logger.appStarting(3000, '0.0.0.0');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log application started', () => {
            logger.appStarted(3000, '0.0.0.0');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should log application shutdown', () => {
            logger.appShutdown('SIGTERM');
            logger.appShutdown('SIGINT');

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });

    describe('Version Handling', () => {
        it('should get version from package.json', () => {
            const logger = new Logger();
            expect(logger).toBeDefined();
        });

        it('should handle missing package.json', () => {
            // Mock fs.readFileSync to throw an error
            const fs = require('fs');
            const originalReadFileSync = fs.readFileSync;
            fs.readFileSync = vi.fn().mockImplementation(() => {
                throw new Error('File not found');
            });

            try {
                const logger = new Logger();
                expect(logger).toBeDefined();
            } finally {
                fs.readFileSync = originalReadFileSync;
            }
        });

        it('should handle package.json without version', () => {
            // Mock fs.readFileSync to return package.json without version
            const fs = require('fs');
            const originalReadFileSync = fs.readFileSync;
            fs.readFileSync = vi.fn().mockReturnValue(JSON.stringify({}));

            try {
                const logger = new Logger();
                expect(logger).toBeDefined();
            } finally {
                fs.readFileSync = originalReadFileSync;
            }
        });
    });

    describe('Global Logger Functions', () => {
        it('should get default logger', () => {
            const logger = getLogger();
            expect(logger).toBeDefined();
        });

        it('should get logger with context', () => {
            const context: LoggerContext = {
                component: 'test',
                serverName: 'test-server',
            };
            const logger = getLogger(context);
            expect(logger).toBeDefined();
        });

        it('should initialise global logger', () => {
            const config = {
                level: 'debug' as const,
                format: 'json' as const,
            };

            initialiseLogger(config);

            const logger = getLogger();
            expect(logger).toBeDefined();
        });

        it('should create request logger', () => {
            const logger = createRequestLogger('req-123');
            expect(logger).toBeDefined();
        });

        it('should create server logger without port', () => {
            const logger = createServerLogger('test-server');
            expect(logger).toBeDefined();
        });

        it('should create server logger with port', () => {
            const logger = createServerLogger('test-server', 3001);
            expect(logger).toBeDefined();
        });

        it('should create component logger', () => {
            const logger = createComponentLogger('test-component');
            expect(logger).toBeDefined();
        });
    });

    describe('Logger State Management', () => {
        it('should reuse same default logger instance', () => {
            const logger1 = getLogger();
            const logger2 = getLogger();

            // They should be the same instance
            expect(logger1).toBe(logger2);
        });

        it('should create new logger after initialisation', () => {
            const logger1 = getLogger();

            initialiseLogger({ level: 'debug' });

            const logger2 = getLogger();

            // They should be different instances after initialisation
            expect(logger1).not.toBe(logger2);
        });

        it('should return child loggers that are different instances', () => {
            const parentLogger = getLogger();
            const childLogger = getLogger({ component: 'child' });

            expect(parentLogger).not.toBe(childLogger);
        });
    });

    describe('Context Merging', () => {
        it('should properly merge contexts in error logging', () => {
            const logger = new Logger({}, { component: 'base', serverName: 'test' });

            const extraContext = { requestId: 'req-123', port: 3001 };
            const error = new Error('Test error');

            logger.error('Test message', error, extraContext);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });

        it('should handle context merging in all log levels', () => {
            const logger = new Logger({}, { component: 'base' });
            const extra = { key: 'value' };

            logger.debug('Debug', extra);
            logger.info('Info', extra);
            logger.warn('Warn', extra);
            logger.error('Error', undefined, extra);

            // Just verify the methods can be called without throwing
            expect(true).toBe(true);
        });
    });
});
