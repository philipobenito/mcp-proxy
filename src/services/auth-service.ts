import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { getLogger } from '../utils/index.js';

export interface AuthConfig {
    enabled: boolean;
    type: 'bearer' | 'basic' | 'api-key' | 'custom';
    headerName?: string;
    customValidator?: (req: IncomingMessage) => Promise<AuthResult>;
}

export interface AuthResult {
    success: boolean;
    user?: string;
    roles?: string[];
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface ServerAuthConfig extends AuthConfig {
    serverName: string;
    credentials?: {
        tokens?: string[];
        users?: Record<string, string>; // username -> password
        apiKeys?: string[];
    };
}

export class AuthenticationService extends EventEmitter {
    private readonly serverConfigs = new Map<string, ServerAuthConfig>();
    private readonly globalConfig: AuthConfig | undefined;
    private readonly logger = getLogger({ component: 'auth-service' });

    constructor(globalConfig?: AuthConfig) {
        super();
        this.globalConfig = globalConfig;
    }

    configureServerAuth(serverName: string, config: Partial<ServerAuthConfig>): void {
        const fullConfig: ServerAuthConfig = {
            serverName,
            enabled: config.enabled !== false,
            type: config.type || 'bearer',
            ...(config.headerName !== undefined && { headerName: config.headerName }),
            ...(config.customValidator !== undefined && {
                customValidator: config.customValidator,
            }),
            ...(config.credentials !== undefined && { credentials: config.credentials }),
        };

        this.serverConfigs.set(serverName, fullConfig);

        this.logger.info('Configured authentication for server', {
            serverName,
            enabled: fullConfig.enabled,
            type: fullConfig.type,
        });
    }

    async authenticate(serverName: string, req: IncomingMessage): Promise<AuthResult> {
        let config = this.serverConfigs.get(serverName);

        if (!config && this.globalConfig) {
            // Create a ServerAuthConfig from the global config
            config = {
                ...this.globalConfig,
                serverName,
            };
        }

        if (!config || !config.enabled) {
            // No authentication required
            return { success: true };
        }

        try {
            let result: AuthResult;

            switch (config.type) {
                case 'bearer':
                    result = await this.authenticateBearer(req, config);
                    break;

                case 'basic':
                    result = await this.authenticateBasic(req, config);
                    break;

                case 'api-key':
                    result = await this.authenticateApiKey(req, config);
                    break;

                case 'custom':
                    if (config.customValidator) {
                        result = await config.customValidator(req);
                    } else {
                        result = { success: false, error: 'No custom validator configured' };
                    }
                    break;

                default:
                    result = { success: false, error: `Unsupported auth type: ${config.type}` };
            }

            if (result.success) {
                this.logger.debug('Authentication successful', {
                    serverName,
                    type: config.type,
                    user: result.user,
                });

                this.emit('authSuccess', {
                    serverName,
                    user: result.user,
                    roles: result.roles,
                    metadata: result.metadata,
                });
            } else {
                this.logger.warn('Authentication failed', {
                    serverName,
                    type: config.type,
                    error: result.error,
                    ip: this.getClientIp(req),
                });

                this.emit('authFailure', {
                    serverName,
                    error: result.error,
                    ip: this.getClientIp(req),
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Authentication error', error, { serverName });
            return {
                success: false,
                error: 'Authentication service error',
            };
        }
    }

    private async authenticateBearer(
        req: IncomingMessage,
        config: ServerAuthConfig
    ): Promise<AuthResult> {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { success: false, error: 'Missing or invalid Authorization header' };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        if (!config.credentials?.tokens?.includes(token)) {
            return { success: false, error: 'Invalid token' };
        }

        return {
            success: true,
            user: `token-user-${token.substring(0, 8)}`,
            metadata: { tokenPrefix: token.substring(0, 8) },
        };
    }

    private async authenticateBasic(
        req: IncomingMessage,
        config: ServerAuthConfig
    ): Promise<AuthResult> {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return { success: false, error: 'Missing or invalid Authorization header' };
        }

        let credentials: string;
        try {
            const buffer = Buffer.from(authHeader.substring(6), 'base64');
            credentials = buffer.toString('utf8');

            // Validate UTF-8 encoding by checking if re-encoding produces the same buffer
            if (!Buffer.from(credentials, 'utf8').equals(buffer)) {
                return { success: false, error: 'Invalid UTF-8 encoding in credentials' };
            }
        } catch {
            return { success: false, error: 'Invalid base64 encoding' };
        }

        const [username, password] = credentials.split(':', 2);

        if (!username || !password) {
            return { success: false, error: 'Invalid credentials format' };
        }

        const users = config.credentials?.users;
        if (!users || users[username] !== password) {
            return { success: false, error: 'Invalid username or password' };
        }

        return {
            success: true,
            user: username,
            metadata: { authType: 'basic' },
        };
    }

    private async authenticateApiKey(
        req: IncomingMessage,
        config: ServerAuthConfig
    ): Promise<AuthResult> {
        const headerName = config.headerName || 'x-api-key';
        const apiKey = req.headers[headerName.toLowerCase()];

        if (!apiKey) {
            return { success: false, error: `Missing ${headerName} header` };
        }

        const keyValue = Array.isArray(apiKey) ? apiKey[0] : apiKey;

        if (!keyValue || !config.credentials?.apiKeys?.includes(keyValue)) {
            return { success: false, error: 'Invalid API key' };
        }

        return {
            success: true,
            user: `api-key-user-${keyValue.substring(0, 8)}`,
            metadata: {
                keyPrefix: keyValue.substring(0, 8),
                headerUsed: headerName,
            },
        };
    }

    private getClientIp(req: IncomingMessage): string {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
            ? (Array.isArray(forwarded) ? forwarded[0] || '' : forwarded).split(',')[0]?.trim() ||
              'unknown'
            : req.socket.remoteAddress || 'unknown';

        return ip;
    }

    getServerConfig(serverName: string): ServerAuthConfig | undefined {
        return this.serverConfigs.get(serverName);
    }

    getAllConfigs(): Map<string, ServerAuthConfig> {
        return new Map(this.serverConfigs);
    }

    isAuthRequired(serverName: string): boolean {
        const config = this.serverConfigs.get(serverName) || this.globalConfig;
        return Boolean(config?.enabled);
    }

    removeServerAuth(serverName: string): void {
        this.serverConfigs.delete(serverName);
        this.logger.info('Removed authentication config for server', { serverName });
    }

    getStats(): {
        totalConfigs: number;
        globalEnabled: boolean;
        servers: Array<{
            name: string;
            enabled: boolean;
            type: string;
            hasCredentials: boolean;
        }>;
    } {
        const servers = Array.from(this.serverConfigs.values()).map(config => ({
            name: config.serverName,
            enabled: config.enabled,
            type: config.type,
            hasCredentials: Boolean(config.credentials),
        }));

        return {
            totalConfigs: this.serverConfigs.size,
            globalEnabled: Boolean(this.globalConfig?.enabled),
            servers,
        };
    }

    // Helper method to check if a request has authentication headers
    hasAuthHeaders(req: IncomingMessage): boolean {
        return Boolean(
            req.headers.authorization || req.headers['x-api-key'] || req.headers['x-auth-token']
        );
    }

    // Helper method to extract auth info without validating
    extractAuthInfo(req: IncomingMessage): {
        type?: string;
        hasAuth: boolean;
        headerPresent: string[];
    } {
        const headerPresent: string[] = [];
        let type: string | undefined;

        if (req.headers.authorization) {
            headerPresent.push('authorization');
            if (req.headers.authorization.startsWith('Bearer ')) {
                type = 'bearer';
            } else if (req.headers.authorization.startsWith('Basic ')) {
                type = 'basic';
            }
        }

        if (req.headers['x-api-key']) {
            headerPresent.push('x-api-key');
            if (!type) type = 'api-key';
        }

        if (req.headers['x-auth-token']) {
            headerPresent.push('x-auth-token');
            if (!type) type = 'token';
        }

        return {
            ...(type && { type }),
            hasAuth: headerPresent.length > 0,
            headerPresent,
        };
    }

    cleanup(): void {
        this.serverConfigs.clear();
        this.removeAllListeners();
    }
}
