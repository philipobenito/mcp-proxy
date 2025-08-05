import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { type DetectedServer } from './detection.js';
import { type HttpProxyService } from './http-proxy.js';
import { getLogger } from '../utils/index.js';

export interface RouteMatch {
    server: DetectedServer;
    path: string;
    params: Record<string, string>;
}

export interface RoutingConfig {
    stripServerPrefix: boolean;
    caseSensitive: boolean;
    enableWildcards: boolean;
}

export class RequestRouter {
    private readonly servers: Map<string, DetectedServer> = new Map();
    private readonly proxyService: HttpProxyService;
    private readonly config: RoutingConfig;
    private readonly logger = getLogger({ component: 'request-router' });

    constructor(proxyService: HttpProxyService, config: Partial<RoutingConfig> = {}) {
        this.proxyService = proxyService;
        this.config = {
            stripServerPrefix: config.stripServerPrefix !== false,
            caseSensitive: config.caseSensitive !== false,
            enableWildcards: config.enableWildcards !== false,
        };
    }

    registerServer(server: DetectedServer): void {
        const serverKey = this.config.caseSensitive ? server.name : server.name.toLowerCase();
        this.servers.set(serverKey, server);

        this.logger.info('Registered server for routing', {
            serverName: server.name,
            type: server.detectedType,
            protocol: server.protocol,
        });
    }

    unregisterServer(serverName: string): void {
        const serverKey = this.config.caseSensitive ? serverName : serverName.toLowerCase();
        const removed = this.servers.delete(serverKey);

        if (removed) {
            this.logger.info('Unregistered server from routing', { serverName });
        }
    }

    async routeRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = parseUrl(req.url || '/', true);
        const pathSegments = (url.pathname || '/').split('/').filter(Boolean);

        // Route based on URL path
        const routeMatch = this.matchRoute(pathSegments, url.pathname || '/');

        if (!routeMatch) {
            this.logger.debug('No route match found', {
                path: url.pathname,
                method: req.method,
                availableServers: Array.from(this.servers.keys()),
            });
            return false;
        }

        this.logger.info('Routing request', {
            originalPath: url.pathname,
            serverName: routeMatch.server.name,
            targetPath: routeMatch.path,
            method: req.method,
        });

        // Update request URL to target path
        if (this.config.stripServerPrefix) {
            req.url = routeMatch.path + (url.search || '');
        }

        try {
            await this.proxyService.proxyRequest(req, res, routeMatch.server);
            return true;
        } catch (error) {
            this.logger.error('Failed to proxy request', error, {
                serverName: routeMatch.server.name,
                path: routeMatch.path,
                method: req.method,
            });

            // Let the proxy service handle the error response
            throw error;
        }
    }

    private matchRoute(pathSegments: string[], fullPath: string): RouteMatch | null {
        if (pathSegments.length === 0) {
            return null;
        }

        const serverName = pathSegments[0]!; // We already checked pathSegments.length > 0
        const serverKey = this.config.caseSensitive ? serverName : serverName.toLowerCase();
        const server = this.servers.get(serverKey);

        if (!server) {
            // Try wildcard matching if enabled
            if (this.config.enableWildcards) {
                return this.matchWildcardRoute(pathSegments, fullPath);
            }
            return null;
        }

        // Calculate target path
        let targetPath = '/';
        if (this.config.stripServerPrefix && pathSegments.length > 1) {
            targetPath = '/' + pathSegments.slice(1).join('/');
        } else if (!this.config.stripServerPrefix) {
            targetPath = fullPath;
        }

        return {
            server,
            path: targetPath,
            params: this.extractParams(pathSegments),
        };
    }

    private matchWildcardRoute(pathSegments: string[], fullPath: string): RouteMatch | null {
        // Try pattern matching for servers with wildcards in their names
        for (const [serverKey, server] of this.servers) {
            if (this.matchWildcardPattern(serverKey, pathSegments[0]!)) {
                let targetPath = '/';
                if (this.config.stripServerPrefix && pathSegments.length > 1) {
                    targetPath = '/' + pathSegments.slice(1).join('/');
                } else if (!this.config.stripServerPrefix) {
                    targetPath = fullPath;
                }

                return {
                    server,
                    path: targetPath,
                    params: this.extractParams(pathSegments),
                };
            }
        }

        return null;
    }

    private matchWildcardPattern(pattern: string, value: string): boolean {
        if (!pattern.includes('*')) {
            return pattern === value;
        }

        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
            .replace(/\\\\?\*/g, '.*'); // Convert * to .*

        const regex = new RegExp(`^${regexPattern}$`, this.config.caseSensitive ? '' : 'i');
        return regex.test(value);
    }

    private extractParams(pathSegments: string[]): Record<string, string> {
        // Extract parameters from path segments
        const params: Record<string, string> = {};

        // For now, just include the server name
        if (pathSegments.length > 0) {
            params.server = pathSegments[0]!;
        }

        return params;
    }

    getRegisteredServers(): DetectedServer[] {
        return Array.from(this.servers.values());
    }

    getServerByName(name: string): DetectedServer | undefined {
        const serverKey = this.config.caseSensitive ? name : name.toLowerCase();
        return this.servers.get(serverKey);
    }

    // Helper method to generate routing information
    getRoutingInfo(): {
        totalServers: number;
        config: RoutingConfig;
        routes: Array<{
            name: string;
            type: string;
            protocol: string;
            pattern: string;
        }>;
        } {
        const routes = Array.from(this.servers.values()).map(server => ({
            name: server.name,
            type: server.detectedType,
            protocol: server.protocol,
            pattern: `/${server.name}/*`,
        }));

        return {
            totalServers: this.servers.size,
            config: this.config,
            routes,
        };
    }

    // Clear all registered servers
    clearServers(): void {
        this.servers.clear();
        this.logger.info('Cleared all registered servers');
    }
}
