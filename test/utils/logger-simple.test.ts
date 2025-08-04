import { describe, it, expect, vi } from 'vitest';
import { getLogger, createServerLogger, initialiseLogger } from '../../src/utils/logger.js';
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
            const logger = getLogger();

            // Test all utility methods exist and can be called
            expect(() => logger.configLoaded(5, 'test.json')).not.toThrow();
            expect(() => logger.configError(new Error('test'))).not.toThrow();
            expect(() => logger.serverStarting('test', 'cmd', 3001)).not.toThrow();
            expect(() => logger.serverStarted('test', 3001, 1234)).not.toThrow();
            expect(() => logger.serverFailed('test', new Error('fail'), 3001)).not.toThrow();
            expect(() => logger.serverStopped('test', 3001, 'SIGTERM')).not.toThrow();
            expect(() => logger.portAllocated('test', 3001)).not.toThrow();
            expect(() => logger.portAllocationFailed('test', new Error('fail'))).not.toThrow();
            expect(() => logger.appStarting(3000, 'localhost')).not.toThrow();
            expect(() => logger.appStarted(3000, 'localhost')).not.toThrow();
            expect(() => logger.appShutdown('SIGTERM')).not.toThrow();
        });

        it('should handle child logger creation', () => {
            const logger = getLogger();
            const child = logger.child({ test: 'context' });
            expect(child).toBeDefined();
            expect(typeof child.info).toBe('function');
        });
    });

    describe('error handling', () => {
        it('should handle errors in logging gracefully', () => {
            const logger = getLogger();

            // These should not throw even with various error types
            expect(() => logger.error('test', new Error('test error'))).not.toThrow();
            expect(() => logger.error('test', { custom: 'error' })).not.toThrow();
            expect(() => logger.error('test', 'string error')).not.toThrow();
            expect(() => logger.error('test', null)).not.toThrow();
            expect(() => logger.error('test', undefined)).not.toThrow();
        });
    });
});
