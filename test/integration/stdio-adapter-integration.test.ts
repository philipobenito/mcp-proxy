import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StdioHttpAdapter } from '../../src/services/stdio-adapter.js';
import { type DetectedServer, ServerType } from '../../src/services/detection.js';

// Mock child_process and http modules
vi.mock('child_process', () => ({
    spawn: vi.fn(() => ({
        kill: vi.fn(),
        stdin: { write: vi.fn() },
        stdout: { on: vi.fn(), off: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
            if (event === 'spawn') {
                setTimeout(callback, 0);
            }
        }),
        once: vi.fn(),
    })),
}));

vi.mock('http', () => ({
    createServer: vi.fn(() => ({
        listen: vi.fn((port, host, callback) => callback()),
        close: vi.fn(callback => callback()),
        on: vi.fn(),
    })),
}));

describe('StdioHttpAdapter Integration', () => {
    let adapter: StdioHttpAdapter;
    let mockServer: DetectedServer;

    beforeEach(() => {
        vi.clearAllMocks();

        adapter = new StdioHttpAdapter({
            timeout: 5000,
            maxBufferSize: 1024,
            enableCors: true,
        });

        mockServer = {
            name: 'test-server',
            detectedType: ServerType.NPX,
            protocol: 'stdio',
            command: 'node',
            args: ['test.js'],
            capabilities: { requiresStdio: true },
            url: '',
            env: { TEST_VAR: 'test_value' },
        };
    });

    describe('Adapter Creation and Management', () => {
        it('should create adapter for valid stdio server', async () => {
            const adapter_instance = await adapter.createAdapter(mockServer, 3001);

            expect(adapter_instance).toBeDefined();
            expect(adapter_instance.server).toBe(mockServer);
            expect(adapter_instance.port).toBe(3001);
            expect(adapter_instance.isHealthy).toBe(true);
        });

        it('should create adapter without child process when no command', async () => {
            const serverWithoutCommand = { ...mockServer, command: undefined };

            const adapter_instance = await adapter.createAdapter(serverWithoutCommand, 3002);

            expect(adapter_instance.isHealthy).toBe(true);
            expect(adapter_instance.childProcess).toBeUndefined();
        });

        it('should track created adapters', async () => {
            await adapter.createAdapter(mockServer, 3001);

            const allAdapters = adapter.getAllAdapters();
            expect(allAdapters).toHaveLength(1);
            expect(allAdapters[0].server.name).toBe('test-server');

            const specificAdapter = adapter.getAdapter('test-server');
            expect(specificAdapter).toBeDefined();
            expect(specificAdapter?.port).toBe(3001);
        });

        it('should stop specific adapter', async () => {
            await adapter.createAdapter(mockServer, 3001);

            expect(adapter.getAllAdapters()).toHaveLength(1);

            await adapter.stopAdapter('test-server');

            expect(adapter.getAllAdapters()).toHaveLength(0);
            expect(adapter.getAdapter('test-server')).toBeUndefined();
        });

        it('should handle stopping non-existent adapter gracefully', async () => {
            await expect(adapter.stopAdapter('non-existent')).resolves.not.toThrow();
        });
    });

    describe('HTTP Request Handling', () => {
        it('should handle health check requests', async () => {
            const adapter_instance = await adapter.createAdapter(mockServer, 3001);

            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            adapter['handleHealthCheck'](adapter_instance, mockRes as any);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockRes.writeHead).toHaveBeenCalledWith(200);
            const response = JSON.parse((mockRes.end as any).mock.calls[0][0]);
            expect(response.status).toBe('healthy');
            expect(response.server).toBe('test-server');
            expect(response.type).toBe('npx');
        });

        it('should handle health check for unhealthy adapter', async () => {
            const adapter_instance = await adapter.createAdapter(mockServer, 3001);
            adapter_instance.isHealthy = false;

            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            adapter['handleHealthCheck'](adapter_instance, mockRes as any);

            expect(mockRes.writeHead).toHaveBeenCalledWith(503);
            const response = JSON.parse((mockRes.end as any).mock.calls[0][0]);
            expect(response.status).toBe('unhealthy');
            expect(response.server).toBe('test-server');
        });

        it('should handle CORS preflight requests', async () => {
            await adapter.createAdapter(mockServer, 3001);

            const mockReq = {
                method: 'OPTIONS',
                url: '/test',
                headers: {},
            };

            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            await adapter['handleHttpRequest']('test-server', mockReq as any, mockRes as any);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Access-Control-Allow-Methods',
                'GET, POST, PUT, DELETE, OPTIONS'
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Access-Control-Allow-Headers',
                'Content-Type, Authorization'
            );
            expect(mockRes.writeHead).toHaveBeenCalledWith(200);
            expect(mockRes.end).toHaveBeenCalled();
        });

        it('should handle requests to non-existent adapter', async () => {
            const mockReq = {
                method: 'GET',
                url: '/test',
                headers: {},
            };

            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            await adapter['handleHttpRequest']('non-existent', mockReq as any, mockRes as any);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(mockRes.writeHead).toHaveBeenCalledWith(404);
            const response = JSON.parse((mockRes.end as any).mock.calls[0][0]);
            expect(response.error).toBe('Server not found');
            expect(response.statusCode).toBe(404);
        });

        it('should handle requests to adapter without child process', async () => {
            const serverWithoutCommand = { ...mockServer, command: undefined };
            await adapter.createAdapter(serverWithoutCommand, 3001);

            const mockReq = {
                method: 'POST',
                url: '/api/test',
                headers: { 'content-type': 'application/json' },
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        // No data
                    } else if (event === 'end') {
                        callback();
                    }
                }),
            };

            const mockRes = {
                setHeader: vi.fn(),
                writeHead: vi.fn(),
                end: vi.fn(),
                headersSent: false,
            };

            await adapter['handleHttpRequest']('test-server', mockReq as any, mockRes as any);

            expect(mockRes.writeHead).toHaveBeenCalledWith(503);
            const response = JSON.parse((mockRes.end as any).mock.calls[0][0]);
            expect(response.error).toBe('Service not available');
            expect(response.statusCode).toBe(503);
        });
    });

    describe('Request Body Collection', () => {
        it('should collect small request bodies', async () => {
            const mockReq = {
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        callback(Buffer.from('{"test": "data"}'));
                    } else if (event === 'end') {
                        callback();
                    }
                }),
            };

            const body = await adapter['collectRequestBody'](mockReq as any);
            expect(body.toString()).toBe('{"test": "data"}');
        });

        it('should reject oversized request bodies', async () => {
            const largeData = 'x'.repeat(2000); // Larger than maxBufferSize (1024)

            const mockReq = {
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        callback(Buffer.from(largeData));
                    } else if (event === 'end') {
                        callback();
                    }
                }),
            };

            await expect(adapter['collectRequestBody'](mockReq as any)).rejects.toThrow(
                'Request body too large'
            );
        });

        it('should handle request errors', async () => {
            const mockReq = {
                on: vi.fn((event, callback) => {
                    if (event === 'error') {
                        callback(new Error('Request error'));
                    }
                }),
            };

            await expect(adapter['collectRequestBody'](mockReq as any)).rejects.toThrow(
                'Request error'
            );
        });
    });

    describe('Process Management', () => {
        it('should handle process exit waiting', async () => {
            const mockProcess = {
                once: vi.fn((event, callback) => {
                    if (event === 'exit') {
                        setTimeout(callback, 10);
                    }
                }),
            };

            await expect(
                adapter['waitForProcessExit'](mockProcess as any, 100)
            ).resolves.not.toThrow();
        });

        it('should timeout when process does not exit', async () => {
            const mockProcess = {
                once: vi.fn(),
            };

            await expect(adapter['waitForProcessExit'](mockProcess as any, 50)).rejects.toThrow(
                'Process did not exit within 50ms'
            );
        });
    });
});
