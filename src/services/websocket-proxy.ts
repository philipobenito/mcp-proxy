import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { type DetectedServer, ServerType } from './detection.js';
import { type PortManager } from './port-manager.js';
import { getLogger } from '../utils/index.js';

export interface WebSocketConnection {
    id: string;
    serverName: string;
    clientWs: WebSocket;
    targetWs?: WebSocket;
    connected: boolean;
    createdAt: Date;
    lastActivity: Date;
}

export interface WebSocketProxyConfig {
    pingInterval: number;
    connectionTimeout: number;
    maxConnections: number;
    enableHeartbeat: boolean;
}

export class WebSocketProxyService extends EventEmitter {
    private readonly wss: WebSocketServer;
    private readonly connections = new Map<string, WebSocketConnection>();
    private readonly portManager: PortManager;
    private readonly config: WebSocketProxyConfig;
    private readonly logger = getLogger({ component: 'websocket-proxy' });
    private connectionCounter = 0;
    private heartbeatInterval?: NodeJS.Timeout;

    constructor(
        server: any, // HTTP server instance
        portManager: PortManager,
        config: Partial<WebSocketProxyConfig> = {}
    ) {
        super();

        this.portManager = portManager;
        this.config = {
            pingInterval: config.pingInterval || 30000, // 30 seconds
            connectionTimeout: config.connectionTimeout || 60000, // 1 minute
            maxConnections: config.maxConnections || 1000,
            enableHeartbeat: config.enableHeartbeat !== false,
        };

        this.wss = new WebSocketServer({
            server,
            path: '/ws',
        });

        this.setupWebSocketServer();
        this.startHeartbeat();
    }

    private setupWebSocketServer(): void {
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req).catch(error => {
                this.logger.error('WebSocket connection handling error', error);
                ws.close(1011, 'Internal server error');
            });
        });

        this.wss.on('error', (error: Error) => {
            this.logger.error('WebSocket server error', error);
            this.emit('error', error);
        });

        this.logger.info('WebSocket server initialised', {
            path: '/ws',
            maxConnections: this.config.maxConnections,
        });
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        // Check connection limits
        if (this.connections.size >= this.config.maxConnections) {
            this.logger.warn('WebSocket connection limit reached');
            ws.close(1008, 'Connection limit reached');
            return;
        }

        // Parse server name from URL path
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const pathSegments = url.pathname.split('/').filter(Boolean);
        
        // Expected format: /ws/server-name
        if (pathSegments.length < 2 || pathSegments[0] !== 'ws') {
            this.logger.warn('Invalid WebSocket path', { path: url.pathname });
            ws.close(1003, 'Invalid path format');
            return;
        }

        const serverName = pathSegments[1];
        const connectionId = `ws-${++this.connectionCounter}-${Date.now()}`;

        this.logger.info('New WebSocket connection', {
            connectionId,
            serverName,
            clientIp: this.getClientIp(req),
        });

        const connection: WebSocketConnection = {
            id: connectionId,
            serverName,
            clientWs: ws,
            connected: false,
            createdAt: new Date(),
            lastActivity: new Date(),
        };

        this.connections.set(connectionId, connection);

        try {
            // Set up client WebSocket handlers
            this.setupClientWebSocket(connection);

            // Connect to target server
            await this.connectToServer(connection);

            this.emit('connectionEstablished', connectionId, serverName);
        } catch (error) {
            this.logger.error('Failed to establish WebSocket connection', error, {
                connectionId,
                serverName,
            });
            
            this.closeConnection(connectionId, 1011, 'Failed to connect to server');
        }
    }

    private setupClientWebSocket(connection: WebSocketConnection): void {
        const { clientWs, id } = connection;

        clientWs.on('message', (data: Buffer) => {
            this.handleClientMessage(id, data);
        });

        clientWs.on('close', (code: number, reason: Buffer) => {
            this.logger.info('Client WebSocket closed', {
                connectionId: id,
                code,
                reason: reason.toString(),
            });
            this.closeConnection(id);
        });

        clientWs.on('error', (error: Error) => {
            this.logger.error('Client WebSocket error', error, { connectionId: id });
            this.closeConnection(id, 1011, 'Client error');
        });

        clientWs.on('pong', () => {
            const conn = this.connections.get(id);
            if (conn) {
                conn.lastActivity = new Date();
            }
        });
    }

    private async connectToServer(connection: WebSocketConnection): Promise<void> {
        const port = this.portManager.getPortForServer(connection.serverName);
        if (!port) {
            throw new Error(`No port allocated for server ${connection.serverName}`);
        }

        // Create WebSocket connection to server
        const targetUrl = `ws://localhost:${port}/ws`;
        
        return new Promise((resolve, reject) => {
            const targetWs = new WebSocket(targetUrl);
            
            const timeout = setTimeout(() => {
                targetWs.close();
                reject(new Error('Connection timeout'));
            }, this.config.connectionTimeout);

            targetWs.on('open', () => {
                clearTimeout(timeout);
                connection.targetWs = targetWs;
                connection.connected = true;

                this.setupTargetWebSocket(connection);
                
                this.logger.info('Connected to target server', {
                    connectionId: connection.id,
                    serverName: connection.serverName,
                    targetUrl,
                });

                resolve();
            });

            targetWs.on('error', (error: Error) => {
                clearTimeout(timeout);
                this.logger.error('Target WebSocket connection error', error, {
                    connectionId: connection.id,
                    serverName: connection.serverName,
                });
                reject(error);
            });
        });
    }

    private setupTargetWebSocket(connection: WebSocketConnection): void {
        const { targetWs, id } = connection;
        
        if (!targetWs) {
            return;
        }

        targetWs.on('message', (data: Buffer) => {
            this.handleServerMessage(id, data);
        });

        targetWs.on('close', (code: number, reason: Buffer) => {
            this.logger.info('Target WebSocket closed', {
                connectionId: id,
                code,
                reason: reason.toString(),
            });
            this.closeConnection(id, code, reason.toString());
        });

        targetWs.on('error', (error: Error) => {
            this.logger.error('Target WebSocket error', error, { connectionId: id });
            this.closeConnection(id, 1011, 'Server error');
        });
    }

    private handleClientMessage(connectionId: string, data: Buffer): void {
        const connection = this.connections.get(connectionId);
        if (!connection || !connection.connected) {
            return;
        }

        connection.lastActivity = new Date();

        // Forward message to server
        if (connection.targetWs && connection.targetWs.readyState === WebSocket.OPEN) {
            connection.targetWs.send(data);
            
            this.emit('messageForwarded', {
                connectionId,
                direction: 'client-to-server',
                size: data.length,
            });
        }
    }

    private handleServerMessage(connectionId: string, data: Buffer): void {
        const connection = this.connections.get(connectionId);
        if (!connection || !connection.connected) {
            return;
        }

        connection.lastActivity = new Date();

        // Forward message to client
        if (connection.clientWs.readyState === WebSocket.OPEN) {
            connection.clientWs.send(data);
            
            this.emit('messageForwarded', {
                connectionId,
                direction: 'server-to-client',
                size: data.length,
            });
        }
    }

    private closeConnection(connectionId: string, code = 1000, reason = 'Normal closure'): void {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return;
        }

        this.logger.info('Closing WebSocket connection', {
            connectionId,
            serverName: connection.serverName,
            code,
            reason,
        });

        // Close client connection
        if (connection.clientWs.readyState === WebSocket.OPEN) {
            connection.clientWs.close(code, reason);
        }

        // Close server connection
        if (connection.targetWs && connection.targetWs.readyState === WebSocket.OPEN) {
            connection.targetWs.close(code, reason);
        }

        this.connections.delete(connectionId);
        this.emit('connectionClosed', connectionId, connection.serverName);
    }

    private startHeartbeat(): void {
        if (!this.config.enableHeartbeat) {
            return;
        }

        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            
            for (const [connectionId, connection] of this.connections) {
                const timeSinceActivity = now - connection.lastActivity.getTime();
                
                if (timeSinceActivity > this.config.connectionTimeout) {
                    this.logger.warn('WebSocket connection timeout', {
                        connectionId,
                        serverName: connection.serverName,
                        timeSinceActivity,
                    });
                    this.closeConnection(connectionId, 1001, 'Connection timeout');
                } else if (connection.clientWs.readyState === WebSocket.OPEN) {
                    // Send ping
                    connection.clientWs.ping();
                }
            }
        }, this.config.pingInterval);

        this.logger.info('WebSocket heartbeat started', {
            pingInterval: this.config.pingInterval,
            connectionTimeout: this.config.connectionTimeout,
        });
    }

    private getClientIp(req: IncomingMessage): string {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded 
            ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
            : req.socket.remoteAddress || 'unknown';
        
        return ip;
    }

    getConnections(): WebSocketConnection[] {
        return Array.from(this.connections.values());
    }

    getConnectionsByServer(serverName: string): WebSocketConnection[] {
        return Array.from(this.connections.values())
            .filter(conn => conn.serverName === serverName);
    }

    getConnectionCount(): number {
        return this.connections.size;
    }

    getStats(): {
        totalConnections: number;
        activeConnections: number;
        connectionsByServer: Record<string, number>;
    } {
        const connectionsByServer: Record<string, number> = {};
        
        for (const connection of this.connections.values()) {
            connectionsByServer[connection.serverName] = 
                (connectionsByServer[connection.serverName] || 0) + 1;
        }

        return {
            totalConnections: this.connectionCounter,
            activeConnections: this.connections.size,
            connectionsByServer,
        };
    }

    async shutdown(): Promise<void> {
        this.logger.info('Shutting down WebSocket proxy service');

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // Close all connections
        const closePromises = Array.from(this.connections.keys()).map(id =>
            new Promise<void>(resolve => {
                this.closeConnection(id, 1001, 'Server shutdown');
                resolve();
            })
        );

        await Promise.all(closePromises);

        // Close WebSocket server
        await new Promise<void>(resolve => {
            this.wss.close(() => {
                this.logger.info('WebSocket server closed');
                resolve();
            });
        });

        this.removeAllListeners();
    }
}