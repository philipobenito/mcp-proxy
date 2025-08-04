import { type ServerConfig } from '../config/index.js';

export enum ServerType {
    DOCKER = 'docker',
    NPX = 'npx',
    HTTP = 'http',
    CUSTOM = 'custom',
}

export interface DetectedServer extends ServerConfig {
    detectedType: ServerType;
    capabilities: ServerCapabilities;
}

export interface ServerCapabilities {
    requiresStdio: boolean;
    supportsHealthCheck: boolean;
    requiresEnvironment: boolean;
    canRestart: boolean;
}

export class ServerTypeDetector {
    detectServerType(server: ServerConfig): DetectedServer {
        const detectedType = this.analyzeServerCommand(server);
        const capabilities = this.determineCapabilities(server, detectedType);

        return {
            ...server,
            detectedType,
            capabilities,
        };
    }

    private analyzeServerCommand(server: ServerConfig): ServerType {
        // HTTP servers are explicit
        if (server.protocol === 'http') {
            return ServerType.HTTP;
        }

        // For stdio servers, analyze the command
        if (!server.command) {
            return ServerType.CUSTOM;
        }

        const command = server.command.toLowerCase();

        // NPX detection patterns (check before Docker to avoid conflicts)
        if (this.isNpxCommand(command, server.args)) {
            return ServerType.NPX;
        }

        // Docker detection patterns
        if (this.isDockerCommand(command, server.args)) {
            return ServerType.DOCKER;
        }

        return ServerType.CUSTOM;
    }

    private isDockerCommand(command: string, args?: string[]): boolean {
        // Direct docker command
        if (command === 'docker') {
            return true;
        }

        // Docker compose patterns
        if (command === 'docker-compose' || command === 'docker compose') {
            return true;
        }

        // Check if command contains docker
        if (command.includes('docker')) {
            return true;
        }

        // Check args for docker patterns
        if (args && args.length > 0) {
            const firstArg = args[0]?.toLowerCase();
            return firstArg === 'run' || firstArg === 'exec' || firstArg === 'start';
        }

        return false;
    }

    private isNpxCommand(command: string, args?: string[]): boolean {
        // Direct npx command
        if (command === 'npx') {
            return true;
        }

        // npm run patterns that might use npx
        if (command === 'npm' && args && args.length > 0) {
            const firstArg = args[0]?.toLowerCase();
            return firstArg === 'run' || firstArg === 'start' || firstArg === 'exec';
        }

        // yarn patterns
        if (command === 'yarn' && args && args.length > 0) {
            return args[0]?.toLowerCase() !== 'install';
        }

        // pnpm patterns
        if (command === 'pnpm' && args && args.length > 0) {
            const firstArg = args[0]?.toLowerCase();
            return firstArg === 'run' || firstArg === 'start' || firstArg === 'exec';
        }

        // Check for MCP package patterns in args
        if (args && args.some(arg => arg.includes('@modelcontextprotocol'))) {
            return true;
        }

        return false;
    }

    private determineCapabilities(server: ServerConfig, type: ServerType): ServerCapabilities {
        const baseCapabilities: ServerCapabilities = {
            requiresStdio: server.protocol === 'stdio',
            supportsHealthCheck: Boolean(server.healthCheck),
            requiresEnvironment: Boolean(server.env && Object.keys(server.env).length > 0),
            canRestart: server.restart !== false,
        };

        // Type-specific capability adjustments
        switch (type) {
            case ServerType.HTTP:
                return {
                    ...baseCapabilities,
                    requiresStdio: false,
                    supportsHealthCheck: true, // HTTP servers can be health checked via HTTP
                };

            case ServerType.DOCKER:
                return {
                    ...baseCapabilities,
                    requiresStdio: true,
                    canRestart: true, // Docker containers can always be restarted
                };

            case ServerType.NPX:
                return {
                    ...baseCapabilities,
                    requiresStdio: true,
                    canRestart: true, // NPX processes can be restarted
                };

            case ServerType.CUSTOM:
            default:
                return baseCapabilities;
        }
    }

    validateServerConfiguration(detectedServer: DetectedServer): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];

        // Validate HTTP servers
        if (detectedServer.detectedType === ServerType.HTTP) {
            if (!detectedServer.url) {
                issues.push('HTTP servers must have a URL configured');
            }
            if (detectedServer.command || detectedServer.args) {
                warnings.push(
                    'HTTP servers should not have command or args - they will be ignored'
                );
            }
        }

        // Validate stdio servers
        if (detectedServer.capabilities.requiresStdio) {
            if (!detectedServer.command) {
                issues.push('Stdio servers must have a command configured');
            }
        }

        // Validate Docker-specific requirements
        if (detectedServer.detectedType === ServerType.DOCKER) {
            if (!detectedServer.args || !detectedServer.args.includes('run')) {
                warnings.push('Docker servers typically require "run" argument');
            }
        }

        // Validate NPX-specific requirements
        if (detectedServer.detectedType === ServerType.NPX) {
            if (!detectedServer.args || detectedServer.args.length === 0) {
                warnings.push('NPX servers typically require package arguments');
            }
        }

        // Validate environment requirements
        if (
            detectedServer.capabilities.requiresEnvironment &&
            detectedServer.detectedType === ServerType.DOCKER
        ) {
            // Docker containers might need -e flags for environment variables
            const hasEnvFlags = detectedServer.args?.some(
                arg => arg === '-e' || arg.startsWith('--env')
            );
            if (!hasEnvFlags && detectedServer.env) {
                warnings.push(
                    'Docker servers with environment variables should include -e flags in args'
                );
            }
        }

        return {
            isValid: issues.length === 0,
            issues,
            warnings,
        };
    }
}

export interface ValidationResult {
    isValid: boolean;
    issues: string[];
    warnings: string[];
}
