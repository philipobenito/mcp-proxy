import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';
import { request, RequestOptions } from 'http';
import { parse as parseUrl } from 'url';
import { type DetectedServer, ServerType } from './detection.js';
import { type ProcessManager } from './process-manager.js';
import { type PortManager } from './port-manager.js';
import { getLogger } from '../utils/index.js';

export interface ProxyRequest {
    serverName: string;
    path: string;
    method: string;
    headers: Record<string, string | string[]>;
    body?: Buffer;
    timestamp: Date;
}

export interface ProxyResponse {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body?: Buffer;
    timestamp: Date;
    duration: number;
}

export interface ProxyStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsPerServer: Map<string, number>;
}

export class HttpProxyService extends EventEmitter {
    private readonly processManager: ProcessManager;
    private readonly portManager: PortManager;
    private readonly logger = getLogger({ component: 'http-proxy' });
    private readonly stats: ProxyStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsPerServer: new Map(),
    };

    constructor(processManager: ProcessManager, portManager: PortManager) {
        super();
        this.processManager = processManager;
        this.portManager = portManager;
    }

    async proxyRequest(
        req: IncomingMessage,
        res: ServerResponse,
        server: DetectedServer
    ): Promise<void> {
        const startTime = Date.now();
        const proxyReq: ProxyRequest = {
            serverName: server.name,
            path: req.url || '/',
            method: req.method || 'GET',
            headers: req.headers,
            timestamp: new Date(),
        };

        this.logger.info('Proxying request', {
            serverName: server.name,
            method: proxyReq.method,
            path: proxyReq.path,
            userAgent: req.headers['user-agent'],
        });

        this.updateStats(server.name);

        try {
            // Handle different server types
            switch (server.detectedType) {
                case ServerType.HTTP:
                    await this.proxyToHttpServer(req, res, server, proxyReq);
                    break;

                case ServerType.DOCKER:
                case ServerType.NPX:
                case ServerType.CUSTOM:
                    await this.proxyToStdioServer(req, res, server, proxyReq);
                    break;

                default:
                    throw new Error(`Unsupported server type: ${server.detectedType}`);
            }

            const duration = Date.now() - startTime;
            this.stats.successfulRequests++;
            this.updateAverageResponseTime(duration);

            this.emit('requestComplete', {
                server: server.name,
                method: proxyReq.method,
                path: proxyReq.path,
                statusCode: res.statusCode,
                duration,
            });
        } catch (error) {
            const duration = Date.now() - startTime;
            this.stats.failedRequests++;
            this.updateAverageResponseTime(duration);

            this.logger.error('Proxy request failed', error, {
                serverName: server.name,
                method: proxyReq.method,
                path: proxyReq.path,
                duration,
            });

            this.handleProxyError(res, error as Error, server);

            this.emit('requestError', {
                server: server.name,
                method: proxyReq.method,
                path: proxyReq.path,
                error: (error as Error).message,
                duration,
            });
        }
    }

    private async proxyToHttpServer(
        req: IncomingMessage,
        res: ServerResponse,
        server: DetectedServer,
        proxyReq: ProxyRequest
    ): Promise<void> {
        if (!server.url) {
            throw new Error(`HTTP server ${server.name} has no URL configured`);
        }

        const targetUrl = parseUrl(server.url);
        const options: RequestOptions = {
            hostname: targetUrl.hostname,
            port: targetUrl.port,
            path: proxyReq.path,
            method: proxyReq.method,
            headers: {
                ...proxyReq.headers,
                host: targetUrl.host,
            },
        };

        return new Promise((resolve, reject) => {
            const proxyRequest = request(options, proxyResponse => {
                // Copy response headers
                res.statusCode = proxyResponse.statusCode || 500;
                Object.entries(proxyResponse.headers).forEach(([key, value]) => {
                    if (value !== undefined) {
                        res.setHeader(key, value);
                    }
                });

                // Pipe response body
                proxyResponse.pipe(res);
                proxyResponse.on('end', resolve);
                proxyResponse.on('error', reject);
            });

            proxyRequest.on('error', reject);

            // Pipe request body
            req.pipe(proxyRequest);
        });
    }

    private async proxyToStdioServer(
        req: IncomingMessage,
        res: ServerResponse,
        server: DetectedServer,
        proxyReq: ProxyRequest
    ): Promise<void> {
        // Get allocated port for stdio server
        const port = this.portManager.getPortForServer(server.name);
        if (!port) {
            throw new Error(`No port allocated for stdio server ${server.name}`);
        }

        // Check if server process is running
        const processInfo = this.processManager.getProcessInfo(server.name);
        if (!processInfo || processInfo.state !== 'running') {
            throw new Error(`Server ${server.name} is not running`);
        }

        // Proxy to the allocated port (stdio-to-HTTP adapter should be listening)
        const options: RequestOptions = {
            hostname: 'localhost',
            port,
            path: proxyReq.path,
            method: proxyReq.method,
            headers: proxyReq.headers,
        };

        return new Promise((resolve, reject) => {
            const proxyRequest = request(options, proxyResponse => {
                // Copy response headers
                res.statusCode = proxyResponse.statusCode || 500;
                Object.entries(proxyResponse.headers).forEach(([key, value]) => {
                    if (value !== undefined) {
                        res.setHeader(key, value);
                    }
                });

                // Pipe response body
                proxyResponse.pipe(res);
                proxyResponse.on('end', resolve);
                proxyResponse.on('error', reject);
            });

            proxyRequest.on('error', reject);

            // Pipe request body
            req.pipe(proxyRequest);
        });
    }

    private handleProxyError(res: ServerResponse, error: Error, server: DetectedServer): void {
        // Don't write if response already started
        if (res.headersSent) {
            return;
        }

        let statusCode = 500;
        let message = 'Internal Server Error';

        // Map different error types to appropriate HTTP status codes
        if (error.message.includes('ECONNREFUSED')) {
            statusCode = 503;
            message = 'Service Unavailable';
        } else if (error.message.includes('ETIMEDOUT')) {
            statusCode = 504;
            message = 'Gateway Timeout';
        } else if (error.message.includes('not running')) {
            statusCode = 503;
            message = 'Service Unavailable';
        } else if (error.message.includes('No port allocated')) {
            statusCode = 503;
            message = 'Service Unavailable';
        }

        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                error: message,
                message: error.message,
                server: server.name,
                timestamp: new Date().toISOString(),
            })
        );
    }

    private updateStats(serverName: string): void {
        this.stats.totalRequests++;
        const currentCount = this.stats.requestsPerServer.get(serverName) || 0;
        this.stats.requestsPerServer.set(serverName, currentCount + 1);
    }

    private updateAverageResponseTime(duration: number): void {
        const totalRequests = this.stats.successfulRequests + this.stats.failedRequests;
        if (totalRequests === 1) {
            this.stats.averageResponseTime = duration;
        } else {
            this.stats.averageResponseTime =
                (this.stats.averageResponseTime * (totalRequests - 1) + duration) /
                totalRequests;
        }
    }

    getStats(): ProxyStats {
        return {
            ...this.stats,
            requestsPerServer: new Map(this.stats.requestsPerServer),
        };
    }

    resetStats(): void {
        this.stats.totalRequests = 0;
        this.stats.successfulRequests = 0;
        this.stats.failedRequests = 0;
        this.stats.averageResponseTime = 0;
        this.stats.requestsPerServer.clear();
    }
}