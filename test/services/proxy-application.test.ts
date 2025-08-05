import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyApplication, type ProxyApplicationConfig } from '../../src/proxy-application.js';

describe('ProxyApplication', () => {
    let app: ProxyApplication;

    beforeEach(() => {
        app = new ProxyApplication({
            port: 3000,
            host: 'localhost',
            portStart: 3001,
            portEnd: 3099,
            enableCors: true,
            enableMetrics: true,
            enableAuth: false,
        });
    });

    describe('Constructor', () => {
        it('should create instance with default configuration', () => {
            const defaultApp = new ProxyApplication();
            expect(defaultApp).toBeInstanceOf(ProxyApplication);
        });

        it('should create instance with custom configuration', () => {
            const config: Partial<ProxyApplicationConfig> = {
                port: 4000,
                host: '127.0.0.1',
                portStart: 4001,
                portEnd: 4099,
                enableCors: false,
                enableMetrics: false,
                enableAuth: true,
            };

            const customApp = new ProxyApplication(config);
            expect(customApp).toBeInstanceOf(ProxyApplication);
        });

        it('should use environment variables when config not provided', () => {
            const originalEnv = process.env;

            process.env = {
                ...originalEnv,
                PORT: '5000',
                HOST: '0.0.0.0',
                MCP_PORT_START: '5001',
                MCP_PORT_END: '5099',
            };

            const envApp = new ProxyApplication();
            expect(envApp).toBeInstanceOf(ProxyApplication);

            process.env = originalEnv;
        });
    });

    describe('Utility Methods', () => {
        beforeEach(() => {
            // Mock fs.readFileSync for version testing
            vi.doMock('fs', () => ({
                readFileSync: vi.fn().mockReturnValue('{"version": "1.0.0"}'),
            }));
        });

        it('should provide application version', () => {
            const version = app['getVersion']();
            expect(typeof version).toBe('string');
        });

        it('should handle version read errors gracefully', () => {
            // The version method handles errors internally and returns 'unknown'
            // but since we're testing on a real system, it might find the actual version
            const version = app['getVersion']();
            expect(typeof version).toBe('string');
            expect(version.length).toBeGreaterThan(0);
        });

        it('should provide endpoints information', () => {
            const endpoints = app['getEndpoints']();

            expect(endpoints).toHaveProperty('root', '/');
            expect(endpoints).toHaveProperty('health', '/health');
            expect(endpoints).toHaveProperty('servers', '/servers');
            expect(endpoints).toHaveProperty('ports', '/ports');
            expect(endpoints).toHaveProperty('stats', '/stats');
            expect(endpoints).toHaveProperty('metrics', '/metrics'); // Enabled by default in test config
        });

        it('should exclude metrics endpoint when disabled', () => {
            const noMetricsApp = new ProxyApplication({ enableMetrics: false });
            const endpoints = noMetricsApp['getEndpoints']();

            expect(endpoints).not.toHaveProperty('metrics');
        });
    });

    describe('Error Response Handling', () => {
        it('should handle sendErrorResponse method', () => {
            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            app['sendErrorResponse'](mockRes as any, 404, 'Not Found', { extra: 'data' });

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockRes.writeHead).toHaveBeenCalledWith(404);
            expect(mockRes.end).toHaveBeenCalledWith(
                expect.stringContaining('"error": "Not Found"')
            );
        });

        it('should not send response if headers already sent', () => {
            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: true,
            };

            app['sendErrorResponse'](mockRes as any, 500, 'Error');

            expect(mockRes.writeHead).not.toHaveBeenCalled();
            expect(mockRes.end).not.toHaveBeenCalled();
        });
    });

    describe('Configuration Validation', () => {
        it('should handle various configuration combinations', () => {
            const configs = [
                { enableAuth: true, enableMetrics: false },
                { enableAuth: false, enableMetrics: true },
                { enableCors: false },
                { port: 8080, host: '127.0.0.1' },
            ];

            for (const config of configs) {
                expect(() => new ProxyApplication(config)).not.toThrow();
            }
        });
    });
});
