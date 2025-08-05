import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    StdioHttpAdapter,
    type AdapterInstance,
    type StdioAdapterConfig,
} from '../../src/services/stdio-adapter.js';
import { type DetectedServer, ServerType } from '../../src/services/detection.js';
import { EventEmitter } from 'events';

// Mock child_process
const mockChildProcess = {
    kill: vi.fn(),
    stdin: {
        write: vi.fn(),
    },
    stdout: {
        on: vi.fn(),
        off: vi.fn(),
    },
    stderr: {
        on: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
};

vi.mock('child_process', () => ({
    spawn: vi.fn(() => mockChildProcess),
}));

// Mock http server
const mockHttpServer = {
    listen: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
};

vi.mock('http', () => ({
    createServer: vi.fn(() => mockHttpServer),
}));

describe('StdioHttpAdapter', () => {
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
            env: {},
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Constructor and Configuration', () => {
        it('should use default configuration when no config provided', () => {
            const defaultAdapter = new StdioHttpAdapter();
            expect(defaultAdapter).toBeInstanceOf(EventEmitter);
        });

        it('should apply custom configuration', () => {
            const config: Partial<StdioAdapterConfig> = {
                timeout: 10000,
                maxBufferSize: 2048,
                healthCheckPath: '/custom-health',
                enableCors: false,
            };

            const customAdapter = new StdioHttpAdapter(config);
            expect(customAdapter).toBeInstanceOf(StdioHttpAdapter);
        });
    });

    describe('Command Validation', () => {
        it('should reject HTTP servers', async () => {
            const httpServer = {
                ...mockServer,
                detectedType: ServerType.HTTP,
            };

            await expect(adapter.createAdapter(httpServer, 3001)).rejects.toThrow(
                'Cannot create stdio adapter for HTTP server'
            );
        });

        it('should validate allowed commands', () => {
            const validCommands = [
                'node',
                'python',
                'python3',
                'npx',
                'yarn',
                'pnpm',
                'deno',
                'bun',
            ];

            for (const cmd of validCommands) {
                const server = { ...mockServer, command: cmd };
                expect(() => adapter['validateCommand'](cmd)).not.toThrow();
            }
        });

        it('should reject disallowed commands', () => {
            const invalidCommands = ['rm', 'wget', 'curl', 'sudo'];

            for (const cmd of invalidCommands) {
                expect(() => adapter['validateCommand'](cmd)).toThrow(
                    `Command '${cmd}' is not in the allowlist`
                );
            }
        });

        it('should reject commands with dangerous characters', () => {
            const dangerousCommands = [
                'node; rm -rf /',
                'node && echo test',
                'node | grep test',
                'node $HOME',
                'node `whoami`',
                'node ../../../bin/sh',
            ];

            for (const cmd of dangerousCommands) {
                expect(() => adapter['validateCommand'](cmd)).toThrow(
                    /Command .* is not in the allowlist|Command contains potentially dangerous characters/
                );
            }
        });

        it('should reject empty or non-string commands', () => {
            expect(() => adapter['validateCommand']('')).toThrow(
                'Command must be a non-empty string'
            );
            expect(() => adapter['validateCommand'](null as any)).toThrow(
                'Command must be a non-empty string'
            );
            expect(() => adapter['validateCommand'](123 as any)).toThrow(
                'Command must be a non-empty string'
            );
        });
    });

    describe('Argument Sanitisation', () => {
        it('should sanitise valid arguments', () => {
            const args = ['--port', '3000', '--verbose'];
            const result = adapter['sanitiseArguments'](args);
            expect(result).toEqual(args);
        });

        it('should reject non-array arguments', () => {
            expect(() => adapter['sanitiseArguments']('not-array' as any)).toThrow(
                'Arguments must be an array'
            );
        });

        it('should reject non-string array elements', () => {
            expect(() => adapter['sanitiseArguments']([123, 'valid'] as any)).toThrow(
                'All arguments must be strings'
            );
        });

        it('should reject arguments with dangerous characters', () => {
            const dangerousArgs = [
                ['arg; rm -rf /'],
                ['arg && echo test'],
                ['arg | grep test'],
                ['arg $HOME'],
                ['arg `whoami`'],
            ];

            for (const args of dangerousArgs) {
                expect(() => adapter['sanitiseArguments'](args)).toThrow(
                    'contains potentially dangerous characters'
                );
            }
        });
    });

    describe('HTTP Method Validation', () => {
        it('should validate allowed HTTP methods', () => {
            const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

            for (const method of allowedMethods) {
                expect(adapter['validateHttpMethod'](method)).toBe(method);
                expect(adapter['validateHttpMethod'](method.toLowerCase())).toBe(method);
            }
        });

        it('should reject invalid HTTP methods', () => {
            const invalidMethods = ['TRACE', 'CONNECT', 'INVALID'];

            for (const method of invalidMethods) {
                expect(() => adapter['validateHttpMethod'](method)).toThrow(
                    `HTTP method '${method}' is not allowed`
                );
            }
        });

        it('should reject empty or non-string methods', () => {
            expect(() => adapter['validateHttpMethod']('')).toThrow(
                'HTTP method must be a non-empty string'
            );
            expect(() => adapter['validateHttpMethod'](null as any)).toThrow(
                'HTTP method must be a non-empty string'
            );
        });
    });

    describe('URL Validation', () => {
        it('should validate normal URLs', () => {
            const validUrls = ['/api/test', '/health', '/server/endpoint?param=value'];

            for (const url of validUrls) {
                expect(adapter['validateUrl'](url)).toBe(url);
            }
        });

        it('should reject URLs that are too long', () => {
            const longUrl = '/' + 'a'.repeat(2048);
            expect(() => adapter['validateUrl'](longUrl)).toThrow('URL too long');
        });

        it('should reject URLs with dangerous characters', () => {
            const dangerousUrls = [
                '/api<script>alert(1)</script>',
                '/api"test',
                "/api'test",
                '/api>test',
            ];

            for (const url of dangerousUrls) {
                expect(() => adapter['validateUrl'](url)).toThrow(
                    'URL contains potentially dangerous characters'
                );
            }
        });

        it('should reject empty or non-string URLs', () => {
            expect(() => adapter['validateUrl']('')).toThrow('URL must be a non-empty string');
            expect(() => adapter['validateUrl'](null as any)).toThrow(
                'URL must be a non-empty string'
            );
        });
    });

    describe('Header Sanitisation', () => {
        it('should sanitise valid headers', () => {
            const headers = {
                'content-type': 'application/json',
                authorization: 'Bearer token123',
                accept: '*/*',
            };

            const result = adapter['sanitiseHeaders'](headers);
            expect(result).toEqual(headers);
        });

        it('should filter out disallowed headers', () => {
            const headers = {
                'content-type': 'application/json',
                'x-custom-header': 'should-be-filtered',
                'dangerous-header': 'value',
            };

            const result = adapter['sanitiseHeaders'](headers);
            expect(result).toEqual({ 'content-type': 'application/json' });
        });

        it('should sanitise header values', () => {
            const headers = {
                'content-type': 'application/json\r\n<script>',
                authorization: 'Bearer "token"',
            };

            const result = adapter['sanitiseHeaders'](headers);
            expect(result['content-type']).toBe('application/jsonscript');
            expect(result['authorization']).toBe('Bearer token');
        });

        it('should handle non-object headers', () => {
            expect(adapter['sanitiseHeaders'](null)).toEqual({});
            expect(adapter['sanitiseHeaders']('not-object')).toEqual({});
            expect(adapter['sanitiseHeaders'](123)).toEqual({});
        });

        it('should reject headers with values too long', () => {
            const headers = {
                'content-type': 'a'.repeat(1025), // Too long
                accept: 'application/json', // Valid
            };

            const result = adapter['sanitiseHeaders'](headers);
            expect(result).toEqual({ accept: 'application/json' });
        });
    });

    describe('Request Body Sanitisation', () => {
        it('should sanitise valid request bodies', () => {
            const body = '{"method": "test", "params": {}}';
            expect(adapter['sanitiseRequestBody'](body)).toBe(body);
        });

        it('should remove null bytes from body', () => {
            const body = 'test\0body\0content';
            expect(adapter['sanitiseRequestBody'](body)).toBe('testbodycontent');
        });

        it('should handle non-string bodies', () => {
            expect(adapter['sanitiseRequestBody'](123 as any)).toBe('');
            expect(adapter['sanitiseRequestBody'](null as any)).toBe('');
            expect(adapter['sanitiseRequestBody'](undefined as any)).toBe('');
        });

        it('should reject bodies that are too large', () => {
            const largeBody = 'a'.repeat(2000); // Larger than test config maxBufferSize
            expect(() => adapter['sanitiseRequestBody'](largeBody)).toThrow(
                'Request body too large'
            );
        });
    });

    describe('Request Validation', () => {
        it('should validate and sanitise complete requests', () => {
            const result = adapter['validateAndSanitiseRequest'](
                'POST',
                '/api/test',
                { 'content-type': 'application/json' },
                '{"test": "data"}'
            );

            expect(result).toEqual({
                method: 'POST',
                url: '/api/test',
                headers: { 'content-type': 'application/json' },
                body: '{"test": "data"}',
            });
        });

        it('should handle invalid components gracefully', () => {
            expect(() =>
                adapter['validateAndSanitiseRequest'](
                    'INVALID_METHOD',
                    '/valid/url',
                    {},
                    'valid body'
                )
            ).toThrow("HTTP method 'INVALID_METHOD' is not allowed");
        });
    });

    describe('Adapter Management', () => {
        it('should track adapters', () => {
            expect(adapter.getAllAdapters()).toEqual([]);
            expect(adapter.getAdapter('nonexistent')).toBeUndefined();
        });

        it('should stop all adapters', async () => {
            await adapter.stopAllAdapters();
            expect(adapter.getAllAdapters()).toEqual([]);
        });
    });
});
