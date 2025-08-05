import { describe, it, expect, vi } from 'vitest';
import { getLogger, createServerLogger, initialiseLogger, Logger } from '../../src/utils/logger.js';
import type { LoggingConfig } from '../../src/config/schema.js';

describe('Logger Utility Functions', () => {
    describe('getLogger', () => {
        it('should return a logger instance', () => {
            const logger = getLogger();
            expect(logger).toBeDefined();
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.debug).toBe('function');
        });

        it('should return logger with context', () => {
            const context = { component: 'test' };
            const logger = getLogger(context);
            expect(logger).toBeDefined();
        });
    });

    describe('createServerLogger', () => {
        it('should create server logger with name and port', () => {
            const logger = createServerLogger('test-server', 3001);
            expect(logger).toBeDefined();
            expect(typeof logger.serverStarting).toBe('function');
            expect(typeof logger.serverStarted).toBe('function');
            expect(typeof logger.serverFailed).toBe('function');
            expect(typeof logger.serverStopped).toBe('function');
        });

        it('should create server logger with name only', () => {
            const logger = createServerLogger('test-server');
            expect(logger).toBeDefined();
        });
    });

    describe('initialiseLogger', () => {
        it('should initialise logger with config', () => {
            const config: LoggingConfig = {
                level: 'debug',
                format: 'json',
                output: 'console',
            };

            expect(() => initialiseLogger(config)).not.toThrow();
        });

        it('should handle partial config', () => {
            const config = { level: 'warn' };
            expect(() => initialiseLogger(config as any)).not.toThrow();
        });
    });

    describe('logger methods coverage', () => {
        it('should call logger utility methods without errors', () => {
            // Create a test logger that captures output instead of using global logger
            const testLogger = new Logger({
                level: 'debug',
                output: 'file',
                file: '/dev/null', // Capture output to null device to avoid test noise
            });

            // Test all utility methods exist and can be called
            expect(() => testLogger.configLoaded(5, 'test.json')).not.toThrow();
            expect(() => testLogger.configError(new Error('test'))).not.toThrow();
            expect(() => testLogger.serverStarting('test', 'cmd', 3001)).not.toThrow();
            expect(() => testLogger.serverStarted('test', 3001, 1234)).not.toThrow();
            expect(() => testLogger.serverFailed('test', new Error('fail'), 3001)).not.toThrow();
            expect(() => testLogger.serverStopped('test', 3001, 'SIGTERM')).not.toThrow();
            expect(() => testLogger.portAllocated('test', 3001)).not.toThrow();
            expect(() => testLogger.portAllocationFailed('test', new Error('fail'))).not.toThrow();
            expect(() => testLogger.appStarting(3000, 'localhost')).not.toThrow();
            expect(() => testLogger.appStarted(3000, 'localhost')).not.toThrow();
            expect(() => testLogger.appShutdown('SIGTERM')).not.toThrow();
        });

        it('should handle child logger creation', () => {
            const testLogger = new Logger({
                level: 'debug',
                output: 'file',
                file: '/dev/null',
            });
            const child = testLogger.child({ test: 'context' });
            expect(child).toBeDefined();
            expect(typeof child.info).toBe('function');
        });
    });

    describe('error handling', () => {
        it('should handle errors in logging gracefully', () => {
            const testLogger = new Logger({
                level: 'debug',
                output: 'file',
                file: '/dev/null',
            });

            // These should not throw even with various error types
            expect(() => testLogger.error('test', new Error('test error'))).not.toThrow();
            expect(() => testLogger.error('test', { custom: 'error' })).not.toThrow();
            expect(() => testLogger.error('test', 'string error')).not.toThrow();
            expect(() => testLogger.error('test', null)).not.toThrow();
            expect(() => testLogger.error('test', undefined)).not.toThrow();
        });
    });
});
