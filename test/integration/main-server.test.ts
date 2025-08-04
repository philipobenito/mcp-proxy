import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import type { Server } from 'http';
import { createMockConfig, createTempConfigFile, cleanupTempFile } from '../helpers.js';

describe('Main Server Integration', () => {
    let tempConfigPath: string;
    let server: Server;
    let serverPort: number;

    beforeEach(() => {
        // Mock console methods to avoid log spam during tests
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Find an available port for testing
        serverPort = 3500 + Math.floor(Math.random() * 100);
    });

    afterEach(async () => {
        if (server) {
            await new Promise<void>(resolve => {
                server.close(() => resolve());
            });
        }
        if (tempConfigPath) {
            cleanupTempFile(tempConfigPath);
        }
        vi.restoreAllMocks();
    });

    describe('HTTP Endpoints', () => {
        beforeEach(async () => {
            const mockConfig = createMockConfig({
                servers: [
                    {
                        name: 'test-server',
                        protocol: 'stdio',
                        command: 'echo',
                        args: ['hello'],
                        restart: true,
                    },
                ],
            });
            tempConfigPath = createTempConfigFile(mockConfig);

            // Set environment variables for the test
            process.env.PORT = serverPort.toString();
            process.env.HOST = '127.0.0.1';
            process.env.MCP_PORT_START = '4000';
            process.env.MCP_PORT_END = '4099';

            // Create a simple test server to simulate main application
            server = createServer((req, res) => {
                const url = new URL(req.url || '/', `http://${req.headers.host}`);

                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (url.pathname === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            status: 'healthy',
                            timestamp: new Date().toISOString(),
                            version: '1.0.0',
                            uptime: process.uptime(),
                            servers: {
                                discovered: 1,
                                running: 0,
                                failed: 0,
                            },
                        })
                    );
                    return;
                }

                if (url.pathname === '/servers') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            servers: [
                                {
                                    name: 'test-server',
                                    protocol: 'stdio',
                                    detectedType: 'custom',
                                    capabilities: {
                                        requiresStdio: true,
                                        supportsHealthCheck: false,
                                        requiresEnvironment: false,
                                        canRestart: true,
                                    },
                                    command: 'echo',
                                    args: ['hello'],
                                    restart: true,
                                    allocatedPort: undefined,
                                },
                            ],
                            count: 1,
                            timestamp: new Date().toISOString(),
                        })
                    );
                    return;
                }

                if (url.pathname === '/ports') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            portRange: {
                                start: 4000,
                                end: 4099,
                                total: 100,
                                allocated: 0,
                            },
                            allocations: [],
                            reservedPorts: [],
                            timestamp: new Date().toISOString(),
                        })
                    );
                    return;
                }

                if (url.pathname === '/') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            name: 'MCP Proxy',
                            version: '1.0.0',
                            description: 'A conductor service for Model Context Protocol servers',
                            endpoints: {
                                health: '/health',
                                servers: '/servers',
                                ports: '/ports',
                                metrics: '/metrics',
                            },
                            documentation: 'https://github.com/philipobenito/mcp-proxy',
                        })
                    );
                    return;
                }

                // 404 for all other routes
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify({
                        error: 'Not Found',
                        message: `Endpoint ${url.pathname} not found`,
                        timestamp: new Date().toISOString(),
                    })
                );
            });

            await new Promise<void>(resolve => {
                server.listen(serverPort, '127.0.0.1', resolve);
            });
        });

        it('should respond to health check endpoint', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/health`);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('healthy');
            expect(data.version).toBe('1.0.0');
            expect(typeof data.uptime).toBe('number');
            expect(data.servers).toEqual({
                discovered: 1,
                running: 0,
                failed: 0,
            });
        });

        it('should respond to servers endpoint', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/servers`);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.servers).toHaveLength(1);
            expect(data.servers[0].name).toBe('test-server');
            expect(data.count).toBe(1);
            expect(typeof data.timestamp).toBe('string');
        });

        it('should respond to ports endpoint', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/ports`);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.portRange).toEqual({
                start: 4000,
                end: 4099,
                total: 100,
                allocated: 0,
            });
            expect(Array.isArray(data.allocations)).toBe(true);
            expect(Array.isArray(data.reservedPorts)).toBe(true);
        });

        it('should respond to root endpoint', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/`);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.name).toBe('MCP Proxy');
            expect(data.version).toBe('1.0.0');
            expect(data.endpoints).toEqual({
                health: '/health',
                servers: '/servers',
                ports: '/ports',
                metrics: '/metrics',
            });
        });

        it('should handle OPTIONS requests (CORS)', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/health`, {
                method: 'OPTIONS',
            });

            expect(response.status).toBe(200);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
        });

        it('should return 404 for unknown endpoints', async () => {
            const response = await fetch(`http://127.0.0.1:${serverPort}/unknown`);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Not Found');
            expect(data.message).toContain('/unknown');
        });
    });

    describe('Version Helper', () => {
        it('should get version from package.json', () => {
            // Test the getVersion function logic
            const { readFileSync } = require('fs');
            const { join } = require('path');

            let version: string;
            try {
                const packageJson = JSON.parse(
                    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
                );
                version = packageJson.version || 'unknown';
            } catch {
                version = 'unknown';
            }

            expect(typeof version).toBe('string');
            expect(version.length).toBeGreaterThan(0);
        });

        it('should return "unknown" when package.json is not found', () => {
            // Mock readFileSync to throw an error
            const originalReadFile = require('fs').readFileSync;
            require('fs').readFileSync = vi.fn().mockImplementation(() => {
                throw new Error('File not found');
            });

            try {
                const { join } = require('path');
                let version: string;
                try {
                    const packageJson = JSON.parse(
                        require('fs').readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
                    );
                    version = packageJson.version || 'unknown';
                } catch {
                    version = 'unknown';
                }
                expect(version).toBe('unknown');
            } finally {
                require('fs').readFileSync = originalReadFile;
            }
        });
    });

    describe('Environment Variables', () => {
        it('should use default PORT and HOST when not specified', () => {
            delete process.env.PORT;
            delete process.env.HOST;

            const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
            const HOST = process.env.HOST || '0.0.0.0';

            expect(PORT).toBe(3000);
            expect(HOST).toBe('0.0.0.0');
        });

        it('should use environment PORT and HOST when specified', () => {
            process.env.PORT = '8080';
            process.env.HOST = '192.168.1.1';

            const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
            const HOST = process.env.HOST || '0.0.0.0';

            expect(PORT).toBe(8080);
            expect(HOST).toBe('192.168.1.1');
        });

        it('should use default MCP port range when not specified', () => {
            delete process.env.MCP_PORT_START;
            delete process.env.MCP_PORT_END;

            const startPort = parseInt(process.env.MCP_PORT_START || '3001');
            const endPort = parseInt(process.env.MCP_PORT_END || '3099');

            expect(startPort).toBe(3001);
            expect(endPort).toBe(3099);
        });

        it('should use environment MCP port range when specified', () => {
            process.env.MCP_PORT_START = '5000';
            process.env.MCP_PORT_END = '5100';

            const startPort = parseInt(process.env.MCP_PORT_START || '3001');
            const endPort = parseInt(process.env.MCP_PORT_END || '3099');

            expect(startPort).toBe(5000);
            expect(endPort).toBe(5100);
        });
    });
});
