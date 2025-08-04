import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ConfigSchema, type Config, type ServerConfig } from './schema.js';
import { ServerTypeDetector, type DetectedServer } from '../services/index.js';

export class ConfigurationError extends Error {
    public override readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'ConfigurationError';
        this.cause = cause;
    }
}

export class ConfigLoader {
    private readonly configPath: string;
    private readonly serversDir: string;
    private readonly detector: ServerTypeDetector;

    constructor(configPath = 'servers.json', serversDir = 'servers') {
        this.configPath = resolve(configPath);
        this.serversDir = resolve(serversDir);
        this.detector = new ServerTypeDetector();
    }

    async loadConfiguration(): Promise<Config> {
        const servers: ServerConfig[] = [];

        // Load from configuration file if it exists
        if (existsSync(this.configPath)) {
            const configServers = await this.loadFromConfigFile();
            servers.push(...configServers.servers);
        }

        // Load from servers directory if it exists
        if (existsSync(this.serversDir)) {
            const directoryServers = await this.loadFromDirectory();
            servers.push(...directoryServers);
        }

        if (servers.length === 0) {
            throw new ConfigurationError(
                `No servers found. Create either ${this.configPath} or add servers to ${this.serversDir}/`
            );
        }

        // Validate server names are unique
        this.validateUniqueServerNames(servers);

        // Create default configuration
        const config: Partial<Config> = {
            servers,
        };

        try {
            return ConfigSchema.parse(config);
        } catch (error) {
            throw new ConfigurationError('Configuration validation failed', error);
        }
    }

    async loadConfigurationWithDetection(): Promise<{
        config: Config;
        detectedServers: DetectedServer[];
    }> {
        const config = await this.loadConfiguration();
        const detectedServers: DetectedServer[] = [];
        const validationErrors: string[] = [];

        for (const server of config.servers) {
            const detectedServer = this.detector.detectServerType(server);
            const validation = this.detector.validateServerConfiguration(detectedServer);

            if (!validation.isValid) {
                validationErrors.push(`Server '${server.name}': ${validation.issues.join(', ')}`);
            }

            if (validation.warnings.length > 0) {
                console.warn(`Server '${server.name}' warnings: ${validation.warnings.join(', ')}`);
            }

            detectedServers.push(detectedServer);
        }

        if (validationErrors.length > 0) {
            throw new ConfigurationError(
                `Server validation failed:\n${validationErrors.join('\n')}`
            );
        }

        return { config, detectedServers };
    }

    private async loadFromConfigFile(): Promise<Config> {
        try {
            const configContent = readFileSync(this.configPath, 'utf-8');
            const rawConfig = JSON.parse(configContent);

            // Expand environment variables in commands and env values
            const processedConfig = this.expandEnvironmentVariables(rawConfig);

            return ConfigSchema.parse(processedConfig);
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new ConfigurationError(`Invalid JSON in ${this.configPath}`, error);
            }
            throw new ConfigurationError(
                `Failed to load configuration from ${this.configPath}`,
                error
            );
        }
    }

    private async loadFromDirectory(): Promise<ServerConfig[]> {
        const servers: ServerConfig[] = [];

        try {
            const entries = readdirSync(this.serversDir);

            for (const entry of entries) {
                const fullPath = join(this.serversDir, entry);
                const stat = statSync(fullPath);

                if (stat.isDirectory()) {
                    const serverConfig = await this.loadServerFromDirectory(entry, fullPath);
                    if (serverConfig) {
                        servers.push(serverConfig);
                    }
                }
            }
        } catch (error) {
            throw new ConfigurationError(
                `Failed to scan servers directory ${this.serversDir}`,
                error
            );
        }

        return servers;
    }

    private async loadServerFromDirectory(
        name: string,
        dirPath: string
    ): Promise<ServerConfig | null> {
        const configFiles = ['server.json', 'config.json', '.mcp-server'];

        for (const configFile of configFiles) {
            const configPath = join(dirPath, configFile);

            if (existsSync(configPath)) {
                try {
                    const configContent = readFileSync(configPath, 'utf-8');
                    const rawConfig = JSON.parse(configContent);

                    // Ensure the server has a name
                    if (!rawConfig.name) {
                        rawConfig.name = name;
                    }

                    const processedConfig = this.expandEnvironmentVariables(rawConfig);
                    return ConfigSchema.shape.servers.element.parse(processedConfig);
                } catch (error) {
                    // Use console.warn here as logger may not be initialised yet
                    console.warn(`Failed to load server config from ${configPath}:`, error);
                }
            }
        }

        // Try to infer configuration from directory structure
        return this.inferServerConfig(name, dirPath);
    }

    private inferServerConfig(name: string, dirPath: string): ServerConfig | null {
        const packageJsonPath = join(dirPath, 'package.json');
        const dockerfilePath = join(dirPath, 'Dockerfile');

        if (existsSync(packageJsonPath)) {
            // NPM package-based server
            return {
                name,
                protocol: 'stdio' as const,
                command: 'npm',
                args: ['start'],
                restart: true,
            };
        }

        if (existsSync(dockerfilePath)) {
            // Docker-based server
            return {
                name,
                protocol: 'stdio' as const,
                command: 'docker',
                args: ['run', '--rm', '-i', `mcp/${name}`],
                restart: true,
            };
        }

        return null;
    }

    private expandEnvironmentVariables(obj: unknown): unknown {
        if (typeof obj === 'string') {
            return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
                return process.env[varName] || match;
            });
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.expandEnvironmentVariables(item));
        }

        if (obj && typeof obj === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.expandEnvironmentVariables(value);
            }
            return result;
        }

        return obj;
    }

    validateServerConfig(server: ServerConfig): void {
        // Validate stdio servers have required command
        if (server.protocol === 'stdio' && !server.command) {
            throw new ConfigurationError(
                `Server '${server.name}' with stdio protocol must have a command`
            );
        }

        // Validate HTTP servers have required URL
        if (server.protocol === 'http' && !server.url) {
            throw new ConfigurationError(
                `Server '${server.name}' with http protocol must have a URL`
            );
        }
    }

    private validateUniqueServerNames(servers: ServerConfig[]): void {
        const names = new Set<string>();
        const duplicates: string[] = [];

        for (const server of servers) {
            if (names.has(server.name)) {
                duplicates.push(server.name);
            } else {
                names.add(server.name);
            }
        }

        if (duplicates.length > 0) {
            throw new ConfigurationError(`Duplicate server names found: ${duplicates.join(', ')}`);
        }
    }
}
