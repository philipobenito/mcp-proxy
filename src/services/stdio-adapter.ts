import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { type DetectedServer, ServerType } from './detection.js';
import { getLogger } from '../utils/index.js';

export interface StdioAdapterConfig {
    timeout: number;
    maxBufferSize: number;
    healthCheckPath: string;
    enableCors: boolean;
}

export interface AdapterInstance {
    server: DetectedServer;
    httpServer: Server;
    childProcess?: ChildProcess;
    port: number;
    isHealthy: boolean;
    startedAt: Date;
    lastActivity: Date;
}

export class StdioHttpAdapter extends EventEmitter {
    private readonly config: StdioAdapterConfig;
    private readonly adapters = new Map<string, AdapterInstance>();
    private readonly logger = getLogger({ component: 'stdio-adapter' });

    constructor(config: Partial<StdioAdapterConfig> = {}) {
        super();

        this.config = {
            timeout: config.timeout || 30000,
            maxBufferSize: config.maxBufferSize || 10 * 1024 * 1024, // 10MB
            healthCheckPath: config.healthCheckPath || '/health',
            enableCors: config.enableCors !== false,
        };
    }

    async createAdapter(server: DetectedServer, port: number): Promise<AdapterInstance> {
        if (server.detectedType === ServerType.HTTP) {
            throw new Error(`Cannot create stdio adapter for HTTP server ${server.name}`);
        }

        this.logger.info('Creating stdio-to-HTTP adapter', {
            serverName: server.name,
            port,
            type: server.detectedType,
        });

        const httpServer = createServer((req, res) => {
            this.handleHttpRequest(server.name, req, res).catch(error => {
                this.logger.error('Request handling error', error, {
                    serverName: server.name,
                    url: req.url,
                    method: req.method,
                });
                this.sendErrorResponse(res, 500, 'Internal Server Error');
            });
        });

        const adapter: AdapterInstance = {
            server,
            httpServer,
            port,
            isHealthy: false,
            startedAt: new Date(),
            lastActivity: new Date(),
        };

        // Start the HTTP server
        await new Promise<void>((resolve, reject) => {
            httpServer.listen(port, 'localhost', () => {
                this.logger.info('Stdio adapter listening', {
                    serverName: server.name,
                    port,
                });
                resolve();
            });

            httpServer.on('error', reject);
        });

        // Start the child process if required
        if (server.command) {
            try {
                adapter.childProcess = await this.startChildProcess(server);
                adapter.isHealthy = true;
            } catch (error) {
                this.logger.error('Failed to start child process', error, {
                    serverName: server.name,
                });
                httpServer.close();
                throw error;
            }
        } else {
            // For HTTP servers, we just need the adapter running
            adapter.isHealthy = true;
        }

        this.adapters.set(server.name, adapter);
        this.emit('adapterCreated', server.name, port);

        return adapter;
    }

    async stopAdapter(serverName: string): Promise<void> {
        const adapter = this.adapters.get(serverName);
        if (!adapter) {
            return;
        }

        this.logger.info('Stopping stdio adapter', { serverName });

        // Stop child process
        if (adapter.childProcess) {
            try {
                adapter.childProcess.kill('SIGTERM');
                await this.waitForProcessExit(adapter.childProcess, 5000);
            } catch (error) {
                this.logger.warn('Force killing child process', { serverName });
                adapter.childProcess.kill('SIGKILL');
            }
        }

        // Stop HTTP server
        await new Promise<void>(resolve => {
            adapter.httpServer.close(() => {
                resolve();
            });
        });

        this.adapters.delete(serverName);
        this.emit('adapterStopped', serverName);
    }

    getAdapter(serverName: string): AdapterInstance | undefined {
        return this.adapters.get(serverName);
    }

    getAllAdapters(): AdapterInstance[] {
        return Array.from(this.adapters.values());
    }

    async stopAllAdapters(): Promise<void> {
        const stopPromises = Array.from(this.adapters.keys()).map(name =>
            this.stopAdapter(name).catch(error => {
                this.logger.error('Failed to stop adapter', error, { serverName: name });
            })
        );

        await Promise.allSettled(stopPromises);
    }

    private async handleHttpRequest(
        serverName: string,
        req: IncomingMessage,
        res: ServerResponse
    ): Promise<void> {
        const adapter = this.adapters.get(serverName);
        if (!adapter) {
            return this.sendErrorResponse(res, 404, 'Server not found');
        }

        adapter.lastActivity = new Date();

        // Handle CORS if enabled
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

        // Handle health check
        if (req.url === this.config.healthCheckPath) {
            return this.handleHealthCheck(adapter, res);
        }

        // Handle MCP requests
        if (!adapter.childProcess) {
            return this.sendErrorResponse(res, 503, 'Service not available');
        }

        try {
            await this.handleMcpRequest(adapter, req, res);
        } catch (error) {
            this.logger.error('MCP request failed', error, { serverName });
            this.sendErrorResponse(res, 500, 'MCP request failed');
        }
    }

    private handleHealthCheck(adapter: AdapterInstance, res: ServerResponse): void {
        const health = {
            status: adapter.isHealthy ? 'healthy' : 'unhealthy',
            server: adapter.server.name,
            type: adapter.server.detectedType,
            uptime: Date.now() - adapter.startedAt.getTime(),
            lastActivity: adapter.lastActivity.toISOString(),
            hasChildProcess: Boolean(adapter.childProcess),
        };

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(adapter.isHealthy ? 200 : 503);
        res.end(JSON.stringify(health));
    }

    private async handleMcpRequest(
        adapter: AdapterInstance,
        req: IncomingMessage,
        res: ServerResponse
    ): Promise<void> {
        if (!adapter.childProcess) {
            throw new Error('No child process available');
        }

        // Collect request body
        const body = await this.collectRequestBody(req);

        // Create MCP request
        const mcpRequest = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body.toString('utf8'),
        };

        // Send to stdio process
        const response = await this.sendToStdioProcess(adapter.childProcess, mcpRequest);

        // Send response
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(response.statusCode || 200);
        res.end(response.body);
    }

    private async collectRequestBody(req: IncomingMessage): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalSize = 0;

            req.on('data', (chunk: Buffer) => {
                totalSize += chunk.length;
                if (totalSize > this.config.maxBufferSize) {
                    reject(new Error('Request body too large'));
                    return;
                }
                chunks.push(chunk);
            });

            req.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            req.on('error', reject);
        });
    }

    private async startChildProcess(server: DetectedServer): Promise<ChildProcess> {
        if (!server.command) {
            throw new Error('No command specified for server');
        }

        const env = {
            ...process.env,
            ...server.env,
        };

        const childProcess = spawn(server.command, server.args || [], {
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
        });

        // Set up error handling
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                childProcess.kill('SIGTERM');
                reject(new Error('Child process startup timeout'));
            }, this.config.timeout);

            childProcess.on('error', (error: Error) => {
                clearTimeout(timeout);
                reject(error);
            });

            childProcess.on('spawn', () => {
                clearTimeout(timeout);
                resolve(childProcess);
            });

            childProcess.on('exit', (code, signal) => {
                this.logger.info('Child process exited', {
                    serverName: server.name,
                    code,
                    signal,
                });
            });

            // Log stdout/stderr for debugging
            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data: Buffer) => {
                    this.logger.debug('Child stdout', {
                        serverName: server.name,
                        output: data.toString().trim(),
                    });
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data: Buffer) => {
                    this.logger.debug('Child stderr', {
                        serverName: server.name,
                        output: data.toString().trim(),
                    });
                });
            }
        });
    }

    private async sendToStdioProcess(
        childProcess: ChildProcess,
        request: unknown
    ): Promise<{ statusCode: number; body: string }> {
        return new Promise((resolve, reject) => {
            if (!childProcess.stdin || !childProcess.stdout) {
                reject(new Error('Child process stdio not available'));
                return;
            }

            const requestData = JSON.stringify(request) + '\n';
            let responseData = '';

            const timeout = setTimeout(() => {
                reject(new Error('Stdio request timeout'));
            }, this.config.timeout);

            const onData = (data: Buffer) => {
                responseData += data.toString();
                
                // Check if we have a complete JSON response
                try {
                    const response = JSON.parse(responseData.trim());
                    clearTimeout(timeout);
                    childProcess.stdout?.off('data', onData);
                    resolve({
                        statusCode: response.statusCode || 200,
                        body: JSON.stringify(response),
                    });
                } catch {
                    // Continue collecting data
                }
            };

            childProcess.stdout.on('data', onData);

            childProcess.stdin.write(requestData, error => {
                if (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });
    }

    private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
        if (res.headersSent) {
            return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(statusCode);
        res.end(
            JSON.stringify({
                error: message,
                statusCode,
                timestamp: new Date().toISOString(),
            })
        );
    }

    private async waitForProcessExit(childProcess: ChildProcess, timeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Process did not exit within ${timeoutMs}ms`));
            }, timeoutMs);

            childProcess.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
}