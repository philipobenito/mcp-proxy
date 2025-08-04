import { type ServerConfig, type Config } from '../src/config/index.js';

export const createMockServerConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
    name: 'test-server',
    protocol: 'stdio',
    command: 'echo',
    args: ['hello'],
    restart: true,
    ...overrides,
});

export const createMockConfig = (overrides: Partial<Config> = {}): Config => ({
    servers: [createMockServerConfig()],
    proxy: {
        port: 3000,
        host: '0.0.0.0',
        http2: true,
    },
    logging: {
        level: 'info',
        format: 'json',
        output: 'stdout',
    },
    ...overrides,
});

export const createMockHttpServerConfig = (
    overrides: Partial<ServerConfig> = {}
): ServerConfig => ({
    name: 'test-http-server',
    protocol: 'http',
    url: 'http://localhost:8080/mcp',
    restart: true,
    ...overrides,
});

export const createMockDockerServerConfig = (
    overrides: Partial<ServerConfig> = {}
): ServerConfig => ({
    name: 'test-docker-server',
    protocol: 'stdio',
    command: 'docker',
    args: ['run', '--rm', '-i', 'test-image'],
    restart: true,
    ...overrides,
});

export const createMockNpxServerConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
    name: 'test-npx-server',
    protocol: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-test'],
    restart: true,
    ...overrides,
});

// Port range for testing
export const TEST_PORT_START = 4000;
export const TEST_PORT_END = 4099;

// Mock environment helper
export const withMockEnv = <T>(envVars: Record<string, string>, fn: () => T): T => {
    const originalEnv = { ...process.env };

    try {
        Object.assign(process.env, envVars);
        return fn();
    } finally {
        process.env = originalEnv;
    }
};

// Async version
export const withMockEnvAsync = async <T>(
    envVars: Record<string, string>,
    fn: () => Promise<T>
): Promise<T> => {
    const originalEnv = { ...process.env };

    try {
        Object.assign(process.env, envVars);
        return await fn();
    } finally {
        process.env = originalEnv;
    }
};

// Wait for a condition to be true
export const waitFor = async (
    condition: () => boolean | Promise<boolean>,
    timeoutMs = 1000,
    intervalMs = 10
): Promise<void> => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
};

// Create a temporary configuration file
export const createTempConfigFile = (config: Config, filename = 'test-servers.json'): string => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-test-'));
    const configPath = path.join(tempDir, filename);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return configPath;
};

// Clean up temporary files
export const cleanupTempFile = (filePath?: string): void => {
    if (!filePath) return;

    const fs = require('fs');
    const path = require('path');

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        // Try to remove the parent directory if it's empty
        try {
            const parentDir = path.dirname(filePath);
            if (fs.existsSync(parentDir)) {
                fs.rmdirSync(parentDir);
            }
        } catch {
            // Ignore errors when removing directory (might not be empty)
        }
    } catch (error) {
        // Only warn in development, not in tests
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Failed to clean up temp file ${filePath}:`, error);
        }
    }
};
