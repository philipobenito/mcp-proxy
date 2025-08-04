import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, ConfigurationError } from '../../src/config/loader.js';
import {
    createMockConfig,
    createTempConfigFile,
    cleanupTempFile,
    withMockEnvAsync,
} from '../helpers.js';

describe('ConfigLoader', () => {
    let tempConfigPath: string;

    afterEach(() => {
        if (tempConfigPath) {
            cleanupTempFile(tempConfigPath);
        }
    });

    describe('loadConfiguration', () => {
        it('should load valid configuration from file', async () => {
            const mockConfig = createMockConfig();
            tempConfigPath = createTempConfigFile(mockConfig);

            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');
            const result = await loader.loadConfiguration();

            expect(result.servers).toHaveLength(1);
            expect(result.servers[0].name).toBe('test-server');
            expect(result.servers[0].protocol).toBe('stdio');
        });

        it('should throw ConfigurationError when no servers found', async () => {
            const loader = new ConfigLoader('non-existent.json', 'non-existent-dir');

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow('No servers found');
        });

        it('should expand environment variables in configuration', async () => {
            const configWithEnvVars = {
                servers: [
                    {
                        name: 'test-server',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        args: ['${TEST_MESSAGE}'],
                        restart: true,
                        env: {
                            DATABASE_URL: '${TEST_DB_URL}',
                        },
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(configWithEnvVars);

            await withMockEnvAsync(
                {
                    TEST_MESSAGE: 'hello-world',
                    TEST_DB_URL: 'postgresql://test:test@localhost/test',
                },
                async () => {
                    const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');
                    const result = await loader.loadConfiguration();

                    expect(result.servers[0].args).toEqual(['hello-world']);
                    expect(result.servers[0].env?.DATABASE_URL).toBe(
                        'postgresql://test:test@localhost/test'
                    );
                }
            );
        });

        it('should validate unique server names', async () => {
            const configWithDuplicates = {
                servers: [
                    {
                        name: 'duplicate',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        restart: true,
                    },
                    {
                        name: 'duplicate',
                        protocol: 'http' as const,
                        url: 'http://localhost:8080',
                        restart: true,
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(configWithDuplicates);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow('Duplicate server names');
        });

        it('should throw ConfigurationError for invalid JSON', async () => {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-test-'));
            tempConfigPath = path.join(tempDir, 'invalid.json');

            fs.writeFileSync(tempConfigPath, '{ invalid json }');

            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow('Invalid JSON');
        });
    });

    describe('loadConfigurationWithDetection', () => {
        it('should detect server types and validate configuration', async () => {
            const mockConfig = createMockConfig({
                servers: [
                    {
                        name: 'docker-server',
                        protocol: 'stdio',
                        command: 'docker',
                        args: ['run', '--rm', '-i', 'test-image'],
                        restart: true,
                    },
                    {
                        name: 'http-server',
                        protocol: 'http',
                        url: 'http://localhost:8080/mcp',
                        restart: true,
                    },
                ],
            });

            tempConfigPath = createTempConfigFile(mockConfig);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            const { detectedServers } = await loader.loadConfigurationWithDetection();

            expect(detectedServers).toHaveLength(2);
            expect(detectedServers[0].detectedType).toBe('docker');
            expect(detectedServers[0].capabilities.requiresStdio).toBe(true);
            expect(detectedServers[1].detectedType).toBe('http');
            expect(detectedServers[1].capabilities.requiresStdio).toBe(false);
        });

        it('should throw ConfigurationError for invalid server configuration', async () => {
            const invalidConfig = {
                servers: [
                    {
                        name: 'invalid-server',
                        protocol: 'http' as const,
                        restart: true,
                        // Missing required URL for HTTP server
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(invalidConfig);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfigurationWithDetection()).rejects.toThrow(
                ConfigurationError
            );
            await expect(loader.loadConfigurationWithDetection()).rejects.toThrow(
                'Server validation failed'
            );
        });
    });

    describe('validateServerConfig', () => {
        let loader: ConfigLoader;

        beforeEach(() => {
            loader = new ConfigLoader();
        });

        it('should validate stdio servers have command', () => {
            const invalidServer = {
                name: 'test',
                protocol: 'stdio' as const,
                // Missing command
            };

            expect(() => loader.validateServerConfig(invalidServer as any)).toThrow(
                ConfigurationError
            );
            expect(() => loader.validateServerConfig(invalidServer as any)).toThrow(
                'must have a command'
            );
        });

        it('should validate HTTP servers have URL', () => {
            const invalidServer = {
                name: 'test',
                protocol: 'http' as const,
                // Missing URL
            };

            expect(() => loader.validateServerConfig(invalidServer as any)).toThrow(
                ConfigurationError
            );
            expect(() => loader.validateServerConfig(invalidServer as any)).toThrow(
                'must have a URL'
            );
        });

        it('should pass validation for valid servers', () => {
            const validStdioServer = {
                name: 'test-stdio',
                protocol: 'stdio' as const,
                command: 'echo',
                restart: true,
            };

            const validHttpServer = {
                name: 'test-http',
                protocol: 'http' as const,
                url: 'http://localhost:8080',
                restart: true,
            };

            expect(() => loader.validateServerConfig(validStdioServer)).not.toThrow();
            expect(() => loader.validateServerConfig(validHttpServer)).not.toThrow();
        });

        it('should handle validation warnings during detection', async () => {
            const mockConfig = createMockConfig();
            tempConfigPath = createTempConfigFile(mockConfig);

            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            // Mock console.warn to capture warnings
            const originalWarn = console.warn;
            const warnSpy = vi.fn();
            console.warn = warnSpy;

            try {
                const result = await loader.loadConfigurationWithDetection();
                expect(result.config).toBeDefined();
                expect(result.detectedServers).toBeDefined();
            } finally {
                console.warn = originalWarn;
            }
        });

        it('should handle validation errors during detection', async () => {
            const invalidConfig = {
                servers: [
                    {
                        name: 'invalid-server',
                        protocol: 'stdio' as const,
                        // Missing required command for stdio protocol
                        restart: true,
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(invalidConfig);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfigurationWithDetection()).rejects.toThrow(
                ConfigurationError
            );
        });

        it('should handle directory scanning errors gracefully', async () => {
            const mockConfig = createMockConfig();
            tempConfigPath = createTempConfigFile(mockConfig);

            // Create a directory that we don't have permissions to read
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-test-'));
            const restrictedDir = path.join(tempDir, 'restricted');
            fs.mkdirSync(restrictedDir);

            const loader = new ConfigLoader(tempConfigPath, restrictedDir);

            // Should still work even if directory scanning fails
            const result = await loader.loadConfiguration();
            expect(result.servers).toHaveLength(1);

            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should handle complex environment variable expansion', async () => {
            const configWithComplexEnvVars = {
                servers: [
                    {
                        name: 'complex-server',
                        protocol: 'stdio' as const,
                        command: '${RUNTIME_PATH}/bin/${BINARY_NAME}',
                        args: ['--config=${CONFIG_FILE}', '--port=${SERVER_PORT}'],
                        restart: true,
                        env: {
                            NESTED_VAR: '${PREFIX}_${SUFFIX}',
                            UNCHANGED: 'no-vars-here',
                            MISSING_VAR: '${NON_EXISTENT_VAR}',
                        },
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(configWithComplexEnvVars);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            const result = await withMockEnvAsync(
                {
                    RUNTIME_PATH: '/usr/local',
                    BINARY_NAME: 'server',
                    CONFIG_FILE: '/etc/server.conf',
                    SERVER_PORT: '8080',
                    PREFIX: 'TEST',
                    SUFFIX: 'ENV',
                },
                async () => await loader.loadConfiguration()
            );

            const server = result.servers[0];
            expect(server.command).toBe('/usr/local/bin/server');
            expect(server.args).toEqual(['--config=/etc/server.conf', '--port=8080']);
            expect(server.env?.NESTED_VAR).toBe('TEST_ENV');
            expect(server.env?.UNCHANGED).toBe('no-vars-here');
            expect(server.env?.MISSING_VAR).toBe('${NON_EXISTENT_VAR}'); // Should remain unchanged
        });

        it('should handle array environment variable expansion', async () => {
            const configWithArrayEnvVars = {
                servers: [
                    {
                        name: 'array-server',
                        protocol: 'stdio' as const,
                        command: 'node',
                        args: ['${SCRIPT_NAME}', '${ARG1}', '${ARG2}'],
                        restart: true,
                    },
                ],
            };

            tempConfigPath = createTempConfigFile(configWithArrayEnvVars);
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            const result = await withMockEnvAsync(
                {
                    SCRIPT_NAME: 'app.js',
                    ARG1: '--verbose',
                    ARG2: '--port=3000',
                },
                async () => await loader.loadConfiguration()
            );

            const server = result.servers[0];
            expect(server.args).toEqual(['app.js', '--verbose', '--port=3000']);
        });
    });
});
