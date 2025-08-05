import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestRouter } from '../../src/services/request-router.js';
import { HttpProxyService } from '../../src/services/http-proxy.js';
import { DetectedServer, ServerType } from '../../src/services/detection.js';

describe('RequestRouter', () => {
    let router: RequestRouter;
    let mockHttpProxy: HttpProxyService;
    let mockServers: DetectedServer[];

    beforeEach(() => {
        mockHttpProxy = {
            proxyRequest: vi.fn(),
            isHealthy: vi.fn().mockReturnValue(true),
            getMetrics: vi.fn().mockReturnValue({
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
            }),
        } as any;

        mockServers = [
            {
                name: 'server-1',
                command: 'node',
                args: ['server1.js'],
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
            },
            {
                name: 'server-2',
                command: 'python',
                args: ['server2.py'],
                protocol: 'http',
                detectedType: ServerType.CUSTOM,
                capabilities: {
                    requiresStdio: false,
                    supportsHealthCheck: true,
                    requiresEnvironment: false,
                    canRestart: true,
                },
                restart: true,
                port: 3002,
            },
        ];

        router = new RequestRouter(mockHttpProxy);
        mockServers.forEach(server => router.registerServer(server));
    });

    describe('constructor', () => {
        it('should create RequestRouter with proxy service', () => {
            const newRouter = new RequestRouter(mockHttpProxy);
            expect(newRouter).toBeDefined();
            expect(newRouter).toBeInstanceOf(RequestRouter);
        });

        it('should create with custom configuration', () => {
            const config = {
                stripServerPrefix: false,
                caseSensitive: false,
                enableWildcards: true,
            };
            const newRouter = new RequestRouter(mockHttpProxy, config);
            expect(newRouter).toBeDefined();
        });
    });

    describe('registerServer', () => {
        it('should register new server', () => {
            const newRouter = new RequestRouter(mockHttpProxy);
            const server = mockServers[0];

            newRouter.registerServer(server);

            const servers = newRouter.getRegisteredServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe(server.name);
        });

        it('should handle case insensitive registration by default', () => {
            const newRouter = new RequestRouter(mockHttpProxy, { caseSensitive: false });
            const server = { ...mockServers[0], name: 'TestServer' };

            newRouter.registerServer(server);

            const servers = newRouter.getRegisteredServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('TestServer');
        });
    });

    describe('unregisterServer', () => {
        it('should remove registered server', () => {
            const serverName = mockServers[0].name;

            // Verify server is registered
            expect(router.getRegisteredServers()).toHaveLength(2);

            // Unregister server
            router.unregisterServer(serverName);

            // Verify server is no longer available
            expect(router.getRegisteredServers()).toHaveLength(1);
            expect(router.getServerByName(serverName)).toBeUndefined();
        });
    });

    describe('getServerByName', () => {
        it('should return server by name', () => {
            const server = router.getServerByName('server-1');
            expect(server).toBeDefined();
            expect(server?.name).toBe('server-1');
            expect(server?.port).toBe(3001);
        });

        it('should return undefined for non-existent server', () => {
            const server = router.getServerByName('non-existent');
            expect(server).toBeUndefined();
        });
    });

    describe('routeRequest', () => {
        it('should route HTTP request successfully', async () => {
            const mockReq = {
                url: '/server-1/api/test',
                method: 'GET',
                headers: {},
            } as any;

            const mockRes = {
                writeHead: vi.fn(),
                write: vi.fn(),
                end: vi.fn(),
            } as any;

            const result = await router.routeRequest(mockReq, mockRes);

            expect(result).toBe(true);
            expect(mockHttpProxy.proxyRequest).toHaveBeenCalled();
        });

        it('should handle routing errors gracefully', async () => {
            const mockReq = {
                url: '/unknown-server/api/test',
                method: 'GET',
                headers: {},
            } as any;

            const mockRes = {
                writeHead: vi.fn(),
                write: vi.fn(),
                end: vi.fn(),
            } as any;

            const result = await router.routeRequest(mockReq, mockRes);

            expect(result).toBe(false);
        });
    });

    describe('getRegisteredServers', () => {
        it('should return all registered servers', () => {
            const servers = router.getRegisteredServers();
            expect(servers).toHaveLength(2);
            expect(servers.map(s => s.name)).toContain('server-1');
            expect(servers.map(s => s.name)).toContain('server-2');
        });

        it('should return empty array when no servers registered', () => {
            const emptyRouter = new RequestRouter(mockHttpProxy);
            const servers = emptyRouter.getRegisteredServers();
            expect(servers).toHaveLength(0);
        });
    });

    describe('clearServers', () => {
        it('should remove all registered servers', () => {
            expect(router.getRegisteredServers()).toHaveLength(2);

            router.clearServers();

            expect(router.getRegisteredServers()).toHaveLength(0);
        });
    });

    describe('getRoutingInfo', () => {
        it('should return routing information', () => {
            const info = router.getRoutingInfo();
            expect(info).toBeDefined();
            expect(info.totalServers).toBe(2);
            expect(info.config).toBeDefined();
            expect(info.routes).toHaveLength(2);
        });
    });
});
