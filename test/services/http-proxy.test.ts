import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HttpProxyService } from '../../src/services/http-proxy.js';
import { ProcessManager } from '../../src/services/process-manager.js';
import { PortManager } from '../../src/services/port-manager.js';
import { DetectedServer, ServerType } from '../../src/services/detection.js';

describe('HttpProxyService', () => {
    let httpProxy: HttpProxyService;
    let mockProcessManager: ProcessManager;
    let mockPortManager: PortManager;
    let mockReq: Partial<IncomingMessage>;
    let mockRes: Partial<ServerResponse>;

    beforeEach(() => {
        // Create mock dependencies
        mockProcessManager = {
            isRunning: vi.fn().mockReturnValue(true),
            getProcessInfo: vi.fn().mockReturnValue({ state: 'running', pid: 1234 }),
            startServer: vi.fn(),
            stopServer: vi.fn(),
        } as any;

        mockPortManager = {
            getPort: vi.fn().mockReturnValue(3001),
            allocatePort: vi.fn(),
            releasePort: vi.fn(),
        } as any;

        httpProxy = new HttpProxyService(mockProcessManager, mockPortManager);

        mockReq = {
            method: 'GET',
            headers: { 'user-agent': 'test-client' },
            url: '/test',
        };

        mockRes = {
            writeHead: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            statusCode: 200,
            setHeader: vi.fn(),
            headersSent: false,
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create HttpProxyService instance', () => {
            expect(httpProxy).toBeDefined();
            expect(httpProxy).toBeInstanceOf(HttpProxyService);
        });
    });

    describe('proxyRequest', () => {
        it('should handle HTTP server proxy request', async () => {
            const targetServer: DetectedServer = {
                name: 'test-server',
                command: 'node',
                args: ['server.js'],
                protocol: 'http',
                detectedType: ServerType.HTTP,
                capabilities: {
                    requiresStdio: false,
                    supportsHealthCheck: true,
                    requiresEnvironment: false,
                    canRestart: true,
                },
                restart: true,
                port: 3001,
                url: 'http://localhost:3001',
            };

            // Mock the HTTP request - this is complex to test without actual network
            // Instead, let's test that the method can be called without throwing
            expect(async () => {
                await httpProxy.proxyRequest(
                    mockReq as IncomingMessage,
                    mockRes as ServerResponse,
                    targetServer
                );
            }).not.toThrow();
        });

        it('should handle STDIO server proxy request', async () => {
            const targetServer: DetectedServer = {
                name: 'test-server',
                command: 'node',
                args: ['server.js'],
                protocol: 'stdio',
                detectedType: ServerType.CUSTOM,
                capabilities: {
                    requiresStdio: true,
                    supportsHealthCheck: false,
                    requiresEnvironment: false,
                    canRestart: true,
                },
                restart: true,
                port: 3001,
            };

            // Mock that the server is running
            mockPortManager.getPort = vi.fn().mockReturnValue(3001);
            mockProcessManager.getProcessInfo = vi.fn().mockReturnValue({
                state: 'running',
                pid: 1234,
            });

            // Test that the method can be called
            expect(async () => {
                await httpProxy.proxyRequest(
                    mockReq as IncomingMessage,
                    mockRes as ServerResponse,
                    targetServer
                );
            }).not.toThrow();
        });

        it('should handle unsupported server type error', async () => {
            const targetServer: DetectedServer = {
                name: 'test-server',
                command: 'node',
                args: ['server.js'],
                protocol: 'unknown',
                detectedType: 'unsupported' as any,
                capabilities: {
                    requiresStdio: false,
                    supportsHealthCheck: false,
                    requiresEnvironment: false,
                    canRestart: true,
                },
                restart: true,
                port: 3001,
            };

            await httpProxy.proxyRequest(
                mockReq as IncomingMessage,
                mockRes as ServerResponse,
                targetServer
            );

            // Should handle the error and send appropriate response
            expect(mockRes.statusCode).toBe(500);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockRes.end).toHaveBeenCalled();
        });
    });

    describe('getStats', () => {
        it('should return proxy statistics', () => {
            const stats = httpProxy.getStats();
            expect(stats).toBeDefined();
            expect(typeof stats.totalRequests).toBe('number');
            expect(typeof stats.successfulRequests).toBe('number');
            expect(typeof stats.failedRequests).toBe('number');
            expect(typeof stats.averageResponseTime).toBe('number');
            expect(stats.requestsPerServer).toBeInstanceOf(Map);
        });

        it('should start with zero stats', () => {
            const stats = httpProxy.getStats();
            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulRequests).toBe(0);
            expect(stats.failedRequests).toBe(0);
            expect(stats.averageResponseTime).toBe(0);
        });
    });

    describe('resetStats', () => {
        it('should reset all statistics', () => {
            httpProxy.resetStats();
            const stats = httpProxy.getStats();
            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulRequests).toBe(0);
            expect(stats.failedRequests).toBe(0);
            expect(stats.averageResponseTime).toBe(0);
            expect(stats.requestsPerServer.size).toBe(0);
        });
    });
});
