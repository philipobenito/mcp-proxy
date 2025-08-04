import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigLoader, ConfigurationError } from '../../src/config/loader.js';
import { withMockEnvAsync, cleanupTempFile } from '../helpers.js';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigLoader - Comprehensive Coverage', () => {
    let tempDir: string;
    let tempConfigPath: string;
    let tempServersDir: string;

    beforeEach(() => {
        // Create a unique temp directory for each test
        tempDir = mkdirSync(join(tmpdir(), `mcp-proxy-test-${Date.now()}-${Math.random()}`), {
            recursive: true,
        });
        tempConfigPath = join(tempDir, 'servers.json');
        tempServersDir = join(tempDir, 'servers');
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Directory-based Server Loading', () => {
        it('should load servers from directory structure', async () => {
            // Create servers directory
            mkdirSync(tempServersDir, { recursive: true });

            // Create a server with explicit config
            const serverDir = join(tempServersDir, 'explicit-server');
            mkdirSync(serverDir);
            writeFileSync(
                join(serverDir, 'server.json'),
                JSON.stringify({
                    name: 'explicit-server',
                    protocol: 'stdio',
                    command: 'echo',
                    args: ['hello'],
                    restart: true,
                })
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('explicit-server');
        });

        it('should infer NPM-based servers from package.json', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const npmServerDir = join(tempServersDir, 'npm-server');
            mkdirSync(npmServerDir);
            writeFileSync(
                join(npmServerDir, 'package.json'),
                JSON.stringify({
                    name: 'npm-server',
                    scripts: {
                        start: 'node index.js',
                    },
                })
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('npm-server');
            expect(config.servers[0].command).toBe('npm');
            expect(config.servers[0].args).toEqual(['start']);
            expect(config.servers[0].protocol).toBe('stdio');
        });

        it('should infer Docker-based servers from Dockerfile', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const dockerServerDir = join(tempServersDir, 'docker-server');
            mkdirSync(dockerServerDir);
            writeFileSync(
                join(dockerServerDir, 'Dockerfile'),
                `FROM node:16
COPY . .
CMD ["node", "index.js"]`
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('docker-server');
            expect(config.servers[0].command).toBe('docker');
            expect(config.servers[0].args).toEqual(['run', '--rm', '-i', 'mcp/docker-server']);
        });

        it('should try multiple config file names', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const serverDir = join(tempServersDir, 'multi-config-server');
            mkdirSync(serverDir);

            // Create config.json (should be found after server.json)
            writeFileSync(
                join(serverDir, 'config.json'),
                JSON.stringify({
                    name: 'multi-config-server',
                    protocol: 'stdio',
                    command: 'echo',
                    restart: true,
                })
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('multi-config-server');
        });

        it('should handle servers with no inferable configuration', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const unknownServerDir = join(tempServersDir, 'unknown-server');
            mkdirSync(unknownServerDir);
            // Create empty directory with no recognisable files

            const loader = new ConfigLoader('non-existent.json', tempServersDir);

            // Should throw error since no servers found
            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow('No servers found');
        });

        it('should handle invalid JSON in server config files gracefully', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const invalidServerDir = join(tempServersDir, 'invalid-server');
            mkdirSync(invalidServerDir);
            writeFileSync(join(invalidServerDir, 'server.json'), '{ invalid json }');

            // Mock console.warn to capture warnings
            const originalWarn = console.warn;
            const warnSpy = vi.fn();
            console.warn = warnSpy;

            try {
                const loader = new ConfigLoader('non-existent.json', tempServersDir);

                // Should throw error since no valid servers found
                await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
                await expect(loader.loadConfiguration()).rejects.toThrow('No servers found');
                expect(warnSpy).toHaveBeenCalled();
            } finally {
                console.warn = originalWarn;
            }
        });

        it('should auto-assign directory name when server name is missing', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const serverDir = join(tempServersDir, 'auto-named-server');
            mkdirSync(serverDir);
            writeFileSync(
                join(serverDir, 'server.json'),
                JSON.stringify({
                    // name is missing - should use directory name
                    protocol: 'stdio',
                    command: 'echo',
                    restart: true,
                })
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('auto-named-server');
        });

        it('should handle .mcp-server config files', async () => {
            mkdirSync(tempServersDir, { recursive: true });

            const serverDir = join(tempServersDir, 'mcp-server');
            mkdirSync(serverDir);
            writeFileSync(
                join(serverDir, '.mcp-server'),
                JSON.stringify({
                    name: 'mcp-server',
                    protocol: 'stdio',
                    command: 'node',
                    args: ['server.js'],
                    restart: true,
                })
            );

            const loader = new ConfigLoader('non-existent.json', tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(1);
            expect(config.servers[0].name).toBe('mcp-server');
        });
    });

    describe('Combined Configuration Sources', () => {
        it('should load servers from both config file and directory', async () => {
            // Create config file
            const configFileServers = {
                servers: [
                    {
                        name: 'config-file-server',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        args: ['from-file'],
                        restart: true,
                    },
                ],
            };
            writeFileSync(tempConfigPath, JSON.stringify(configFileServers));

            // Create directory with server
            mkdirSync(tempServersDir, { recursive: true });
            const serverDir = join(tempServersDir, 'directory-server');
            mkdirSync(serverDir);
            writeFileSync(
                join(serverDir, 'server.json'),
                JSON.stringify({
                    name: 'directory-server',
                    protocol: 'stdio',
                    command: 'echo',
                    args: ['from-directory'],
                    restart: true,
                })
            );

            const loader = new ConfigLoader(tempConfigPath, tempServersDir);
            const config = await loader.loadConfiguration();

            expect(config.servers).toHaveLength(2);

            const serverNames = config.servers.map(s => s.name);
            expect(serverNames).toContain('config-file-server');
            expect(serverNames).toContain('directory-server');
        });

        it('should detect duplicate server names across sources', async () => {
            // Create config file
            const configFileServers = {
                servers: [
                    {
                        name: 'duplicate-server',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        restart: true,
                    },
                ],
            };
            writeFileSync(tempConfigPath, JSON.stringify(configFileServers));

            // Create directory with same name
            mkdirSync(tempServersDir, { recursive: true });
            const serverDir = join(tempServersDir, 'duplicate-server');
            mkdirSync(serverDir);
            writeFileSync(
                join(serverDir, 'server.json'),
                JSON.stringify({
                    name: 'duplicate-server',
                    protocol: 'http',
                    url: 'http://localhost:8080',
                    restart: true,
                })
            );

            const loader = new ConfigLoader(tempConfigPath, tempServersDir);

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow('Duplicate server names');
        });
    });

    describe('Environment Variable Expansion Edge Cases', () => {
        it('should handle nested string environment expansion', async () => {
            const complexConfig = {
                servers: [
                    {
                        name: 'complex-server',
                        protocol: 'stdio' as const,
                        command: '${COMMAND}',
                        restart: true,
                        env: {
                            NESTED_VALUE: '${DEEP_VAR}',
                            CONFIG_PATH: '/path/to/${CONFIG_NAME}',
                        },
                    },
                ],
            };

            writeFileSync(tempConfigPath, JSON.stringify(complexConfig));
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            const result = await withMockEnvAsync(
                {
                    COMMAND: 'test-command',
                    DEEP_VAR: 'deep-value',
                    CONFIG_NAME: 'config.json',
                },
                async () => await loader.loadConfiguration()
            );

            const server = result.servers[0];
            expect(server.command).toBe('test-command');
            expect(server.env?.NESTED_VALUE).toBe('deep-value');
            expect(server.env?.CONFIG_PATH).toBe('/path/to/config.json');
        });

        it('should preserve non-string values during expansion', async () => {
            const configWithMixedTypes = {
                servers: [
                    {
                        name: 'mixed-types-server',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        restart: true,
                        env: {
                            FEATURE_NAME: '${FEATURE}',
                            TIMEOUT: '5000',
                            ENABLED: 'true',
                        },
                    },
                ],
            };

            writeFileSync(tempConfigPath, JSON.stringify(configWithMixedTypes));
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            const result = await withMockEnvAsync(
                { FEATURE: 'test-feature' },
                async () => await loader.loadConfiguration()
            );

            const server = result.servers[0];
            expect(server.env?.FEATURE_NAME).toBe('test-feature');
            expect(server.env?.TIMEOUT).toBe('5000');
            expect(server.env?.ENABLED).toBe('true');
        });
    });

    describe('Error Handling Edge Cases', () => {
        it('should handle directory scanning errors', async () => {
            const loader = new ConfigLoader('non-existent.json', '/root/inaccessible-directory');

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
        });

        it('should handle file system errors when loading config file', async () => {
            // Create a directory where the file should be (causing read error)
            mkdirSync(tempConfigPath, { recursive: true });

            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfiguration()).rejects.toThrow(ConfigurationError);
            await expect(loader.loadConfiguration()).rejects.toThrow(
                'Failed to load configuration'
            );
        });

        it('should validate server configuration in detection', async () => {
            const invalidConfig = {
                servers: [
                    {
                        name: 'incomplete-server',
                        protocol: 'stdio' as const,
                        // Missing command
                        restart: true,
                    },
                ],
            };

            writeFileSync(tempConfigPath, JSON.stringify(invalidConfig));
            const loader = new ConfigLoader(tempConfigPath, 'non-existent-dir');

            await expect(loader.loadConfigurationWithDetection()).rejects.toThrow(
                ConfigurationError
            );
            await expect(loader.loadConfigurationWithDetection()).rejects.toThrow(
                'Server validation failed'
            );
        });

        it('should handle warnings during server detection', async () => {
            const configWithWarnings = {
                servers: [
                    {
                        name: 'warning-server',
                        protocol: 'stdio' as const,
                        command: 'echo',
                        restart: true,
                        // Some configuration that might trigger warnings
                        env: {},
                    },
                ],
            };

            writeFileSync(tempConfigPath, JSON.stringify(configWithWarnings));
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
    });

    describe('Additional Validation Cases', () => {
        it('should validate stdio servers have commands', () => {
            const loader = new ConfigLoader();
            const invalidStdioServer = {
                name: 'invalid-stdio',
                protocol: 'stdio' as const,
                // Missing command
                restart: true,
            };

            expect(() => loader.validateServerConfig(invalidStdioServer as any)).toThrow(
                ConfigurationError
            );
            expect(() => loader.validateServerConfig(invalidStdioServer as any)).toThrow(
                'must have a command'
            );
        });

        it('should validate HTTP servers have URLs', () => {
            const loader = new ConfigLoader();
            const invalidHttpServer = {
                name: 'invalid-http',
                protocol: 'http' as const,
                // Missing URL
                restart: true,
            };

            expect(() => loader.validateServerConfig(invalidHttpServer as any)).toThrow(
                ConfigurationError
            );
            expect(() => loader.validateServerConfig(invalidHttpServer as any)).toThrow(
                'must have a URL'
            );
        });

        it('should pass validation for valid servers', () => {
            const loader = new ConfigLoader();

            const validStdioServer = {
                name: 'valid-stdio',
                protocol: 'stdio' as const,
                command: 'echo',
                restart: true,
            };

            const validHttpServer = {
                name: 'valid-http',
                protocol: 'http' as const,
                url: 'http://localhost:8080',
                restart: true,
            };

            expect(() => loader.validateServerConfig(validStdioServer)).not.toThrow();
            expect(() => loader.validateServerConfig(validHttpServer)).not.toThrow();
        });
    });

    describe('Constructor Options', () => {
        it('should use custom paths when provided', () => {
            const customConfigPath = '/custom/config.json';
            const customServersDir = '/custom/servers';

            const loader = new ConfigLoader(customConfigPath, customServersDir);

            // These paths are private, but we can test they don't throw during construction
            expect(loader).toBeDefined();
        });

        it('should use default paths when not provided', () => {
            const loader = new ConfigLoader();

            expect(loader).toBeDefined();
        });
    });
});
