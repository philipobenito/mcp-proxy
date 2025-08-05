import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConfigLoader, type Config } from './config/index.js';
import {
    type DetectedServer,
    PortManager,
    ProcessManager,
    HttpProxyService,
    StdioHttpAdapter,
    RequestRouter,
    RateLimiterService,
    AuthenticationService,
    WebSocketProxyService,
} from './services/index.js';
import { initialiseLogger, getLogger } from './utils/index.js';

export interface ProxyApplicationConfig {
    port: number;
    host: string;
    portStart: number;
    portEnd: number;
    enableCors: boolean;
    enableMetrics: boolean;
    enableAuth: boolean;
    enableRateLimit: boolean;
    enableWebSocket: boolean;
}

export class ProxyApplication {
    private readonly config: ProxyApplicationConfig;
    private readonly logger = getLogger({ component: 'proxy-application' });

    private server?: Server;
    private appConfig?: Config;
    private detectedServers: DetectedServer[] = [];

    // Core services
    private portManager!: PortManager;
    private processManager!: ProcessManager;
    private stdioAdapter!: StdioHttpAdapter;
    private httpProxy!: HttpProxyService;
    private requestRouter!: RequestRouter;
    private rateLimiter!: RateLimiterService;
    private authService!: AuthenticationService;
    private websocketProxy?: WebSocketProxyService;

    constructor(config: Partial<ProxyApplicationConfig> = {}) {
        this.config = {
            port: config.port || parseInt(process.env.PORT || '3000'),
            host: config.host || process.env.HOST || '0.0.0.0',
            portStart: config.portStart || parseInt(process.env.MCP_PORT_START || '3001'),
            portEnd: config.portEnd || parseInt(process.env.MCP_PORT_END || '3099'),
            enableCors: config.enableCors !== false,
            enableMetrics: config.enableMetrics !== false,
            enableAuth: config.enableAuth || false,
            enableRateLimit: config.enableRateLimit || false,
            enableWebSocket: config.enableWebSocket !== false,
        };
    }

    async initialise(): Promise<void> {
        try {
            this.logger.info('Initialising MCP Proxy Application', {
                port: this.config.port,
                host: this.config.host,
                portRange: `${this.config.portStart}-${this.config.portEnd}`,
            });

            // Load configuration
            await this.loadConfiguration();

            // Initialise services
            this.initialiseServices();

            // Create HTTP server
            this.createServer();

            // Setup servers and adapters
            await this.setupServers();

            this.logger.info('MCP Proxy Application initialised successfully');
        } catch (error) {
            this.logger.error('Failed to initialise application', error);
            throw error;
        }
    }

    async start(): Promise<void> {
        if (!this.server) {
            throw new Error('Application not initialised');
        }

        return new Promise((resolve, reject) => {
            this.server!.listen(this.config.port, this.config.host, () => {
                this.logger.info('MCP Proxy Application started', {
                    port: this.config.port,
                    host: this.config.host,
                    endpoints: this.getEndpoints(),
                });
                resolve();
            });

            this.server!.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        this.logger.info('Stopping MCP Proxy Application');

        try {
            // Stop WebSocket proxy
            if (this.websocketProxy) {
                await this.websocketProxy.shutdown();
            }

            // Stop stdio adapters
            if (this.stdioAdapter) {
                await this.stdioAdapter.stopAllAdapters();
            }

            // Stop all server processes
            if (this.processManager) {
                await this.processManager.stopAllServers();
            }

            // Close HTTP server
            if (this.server) {
                await new Promise<void>(resolve => {
                    this.server!.close(() => resolve());
                });
            }

            // Cleanup services
            this.cleanup();

            this.logger.info('MCP Proxy Application stopped');
        } catch (error) {
            this.logger.error('Error during application shutdown', error);
            throw error;
        }
    }

    private async loadConfiguration(): Promise<void> {
        const configLoader = new ConfigLoader();
        const result = await configLoader.loadConfigurationWithDetection();

        this.appConfig = result.config;
        this.detectedServers = result.detectedServers;

        // Initialise logger with configuration
        if (this.appConfig.logging) {
            initialiseLogger(this.appConfig.logging);
        }

        this.logger.info('Configuration loaded', {
            serversCount: this.detectedServers.length,
            servers: this.detectedServers.map(s => ({
                name: s.name,
                type: s.detectedType,
                protocol: s.protocol,
            })),
        });
    }

    private initialiseServices(): void {
        // Port manager
        this.portManager = new PortManager({
            startPort: this.config.portStart,
            endPort: this.config.portEnd,
            reservationTimeout: 60000,
        });

        // Process manager
        this.processManager = new ProcessManager({
            maxRestarts: 3,
            restartDelay: 5000,
            startupTimeout: 30000,
            shutdownTimeout: 10000,
        });

        // Stdio adapter
        this.stdioAdapter = new StdioHttpAdapter({
            timeout: 30000,
            maxBufferSize: 10 * 1024 * 1024,
            enableCors: this.config.enableCors,
        });

        // HTTP proxy service
        this.httpProxy = new HttpProxyService(this.processManager, this.portManager);

        // Request router
        this.requestRouter = new RequestRouter(this.httpProxy, {
            stripServerPrefix: true,
            caseSensitive: false,
            enableWildcards: true,
        });

        // Rate limiter (if enabled)
        if (this.config.enableRateLimit) {
            this.rateLimiter = new RateLimiterService();

            // Configure default rate limits
            for (const server of this.detectedServers) {
                this.rateLimiter.configureServerLimits(server.name, {
                    windowMs: 60000, // 1 minute
                    maxRequests: 100, // 100 requests per minute per IP
                });
            }
        }

        // Authentication service (if enabled)
        if (this.config.enableAuth) {
            this.authService = new AuthenticationService();
        }

        this.logger.info('Services initialised', {
            enableAuth: this.config.enableAuth,
            enableRateLimit: this.config.enableRateLimit,
            enableWebSocket: this.config.enableWebSocket,
        });
    }

    private createServer(): void {
        this.server = createServer(async (req, res) => {
            try {
                await this.handleRequest(req, res);
            } catch (error) {
                this.logger.error('Request handling error', error);
                this.sendErrorResponse(res, 500, 'Internal Server Error');
            }
        });

        // WebSocket support
        if (this.config.enableWebSocket) {
            this.websocketProxy = new WebSocketProxyService(this.server, this.portManager, {
                pingInterval: 30000,
                connectionTimeout: 60000,
                maxConnections: 1000,
            });
        }

        this.server.on('error', error => {
            this.logger.error('HTTP server error', error);
        });
    }

    private async setupServers(): Promise<void> {
        // Allocate ports and start servers
        for (const server of this.detectedServers) {
            try {
                // Register server with router
                this.requestRouter.registerServer(server);

                if (server.capabilities.requiresStdio) {
                    // Allocate port
                    const port = await this.portManager.allocatePort(server.name);
                    this.logger.info('Port allocated', { serverName: server.name, port });

                    // Create stdio adapter
                    await this.stdioAdapter.createAdapter(server, port);

                    // Start process if needed
                    if (server.command) {
                        await this.processManager.startServer(server, port);
                    }
                } else {
                    this.logger.info('HTTP server registered', {
                        serverName: server.name,
                        url: server.url,
                    });
                }
            } catch (error) {
                this.logger.error('Failed to setup server', error, {
                    serverName: server.name,
                });
            }
        }

        const portInfo = this.portManager.getPortRangeInfo();
        this.logger.info('Server setup completed', {
            totalServers: this.detectedServers.length,
            allocatedPorts: portInfo.allocated,
            runningProcesses: this.processManager.getRunningProcesses().length,
        });
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = parseUrl(req.url || '/', true);

        // Add CORS headers if enabled
        if (this.config.enableCors) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
        }

        // Handle built-in endpoints
        if (await this.handleBuiltinEndpoints(req, res, url.pathname || '/')) {
            return;
        }

        // Try to route to a server
        const routed = await this.requestRouter.routeRequest(req, res);
        if (routed) {
            return;
        }

        // No route found
        this.sendErrorResponse(res, 404, 'Not Found', {
            message: `No server found for path ${url.pathname}`,
            availableServers: this.requestRouter.getRegisteredServers().map(s => s.name),
        });
    }

    private async handleBuiltinEndpoints(
        req: IncomingMessage,
        res: ServerResponse,
        pathname: string
    ): Promise<boolean> {
        switch (pathname) {
            case '/':
                this.handleRootEndpoint(res);
                return true;

            case '/health':
                this.handleHealthEndpoint(res);
                return true;

            case '/servers':
                this.handleServersEndpoint(res);
                return true;

            case '/ports':
                this.handlePortsEndpoint(res);
                return true;

            case '/metrics':
                if (this.config.enableMetrics) {
                    this.handleMetricsEndpoint(res);
                    return true;
                }
                break;

            case '/stats':
                this.handleStatsEndpoint(res);
                return true;
        }

        return false;
    }

    private handleRootEndpoint(res: ServerResponse): void {
        const info = {
            name: 'MCP Proxy',
            version: this.getVersion(),
            description: 'HTTP proxy and request management system for MCP servers',
            endpoints: this.getEndpoints(),
            servers: this.detectedServers.map(s => ({
                name: s.name,
                type: s.detectedType,
                protocol: s.protocol,
                url: s.protocol === 'http' ? s.url : `/${s.name}/*`,
            })),
            features: {
                cors: this.config.enableCors,
                metrics: this.config.enableMetrics,
                auth: this.config.enableAuth,
                rateLimit: this.config.enableRateLimit,
                webSocket: this.config.enableWebSocket,
            },
        };

        this.sendJsonResponse(res, 200, info);
    }

    private handleHealthEndpoint(res: ServerResponse): void {
        const runningProcesses = this.processManager.getRunningProcesses();
        const failedProcesses = this.processManager.getFailedProcesses();

        const health = {
            status: failedProcesses.length === 0 ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            servers: {
                total: this.detectedServers.length,
                running: runningProcesses.length,
                failed: failedProcesses.length,
            },
            memory: process.memoryUsage(),
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        this.sendJsonResponse(res, statusCode, health);
    }

    private handleServersEndpoint(res: ServerResponse): void {
        const servers = this.detectedServers.map(server => {
            const processInfo = this.processManager.getProcessInfo(server.name);
            const allocatedPort = this.portManager.getPortForServer(server.name);

            return {
                name: server.name,
                type: server.detectedType,
                protocol: server.protocol,
                url: server.url,
                command: server.command,
                args: server.args,
                capabilities: server.capabilities,
                port: allocatedPort,
                status: processInfo?.state || 'not-managed',
                pid: processInfo?.pid,
                restartCount: processInfo?.restartCount || 0,
                startedAt: processInfo?.startedAt,
            };
        });

        this.sendJsonResponse(res, 200, {
            servers,
            count: servers.length,
            timestamp: new Date().toISOString(),
        });
    }

    private handlePortsEndpoint(res: ServerResponse): void {
        const portInfo = {
            range: this.portManager.getPortRangeInfo(),
            allocations: this.portManager.getAllocations(),
            reserved: this.portManager.getReservedPorts(),
            timestamp: new Date().toISOString(),
        };

        this.sendJsonResponse(res, 200, portInfo);
    }

    private handleMetricsEndpoint(res: ServerResponse): void {
        const metrics = {
            proxy: this.httpProxy.getStats(),
            routing: this.requestRouter.getRoutingInfo(),
            processes: {
                total: this.processManager.getAllProcesses().length,
                running: this.processManager.getRunningProcesses().length,
                failed: this.processManager.getFailedProcesses().length,
            },
            ports: this.portManager.getPortRangeInfo(),
            rateLimiting: this.config.enableRateLimit ? this.rateLimiter.getStats() : null,
            auth: this.config.enableAuth ? this.authService.getStats() : null,
            websocket: this.config.enableWebSocket ? this.websocketProxy?.getStats() : null,
            timestamp: new Date().toISOString(),
        };

        this.sendJsonResponse(res, 200, metrics);
    }

    private handleStatsEndpoint(res: ServerResponse): void {
        const stats = {
            application: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: this.getVersion(),
            },
            servers: this.detectedServers.length,
            activeConnections: this.websocketProxy?.getConnectionCount() || 0,
            timestamp: new Date().toISOString(),
        };

        this.sendJsonResponse(res, 200, stats);
    }

    private sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(statusCode);
        res.end(JSON.stringify(data, null, 2));
    }

    private sendErrorResponse(
        res: ServerResponse,
        statusCode: number,
        message: string,
        details?: unknown
    ): void {
        if (res.headersSent) {
            return;
        }

        const error = {
            error: message,
            statusCode,
            timestamp: new Date().toISOString(),
            ...details,
        };

        this.sendJsonResponse(res, statusCode, error);
    }

    private getEndpoints(): Record<string, string> {
        const endpoints: Record<string, string> = {
            root: '/',
            health: '/health',
            servers: '/servers',
            ports: '/ports',
            stats: '/stats',
        };

        if (this.config.enableMetrics) {
            endpoints.metrics = '/metrics';
        }

        if (this.config.enableWebSocket) {
            endpoints.websocket = '/ws/{server-name}';
        }

        return endpoints;
    }

    private getVersion(): string {
        try {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const packageJsonPath = join(__dirname, '../package.json');
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            return packageJson.version || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    private cleanup(): void {
        if (this.rateLimiter) {
            this.rateLimiter.cleanup();
        }

        if (this.authService) {
            this.authService.cleanup();
        }

        if (this.processManager) {
            this.processManager.cleanup();
        }

        if (this.portManager) {
            this.portManager.cleanup();
        }
    }
}
