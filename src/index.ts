#!/usr/bin/env node
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigLoader, ConfigurationError, type Config } from './config/index.js';
import { type DetectedServer, PortManager } from './services/index.js';
import { initialiseLogger, getLogger } from './utils/index.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

let appConfig: Config | null = null;
let detectedServers: DetectedServer[] = [];
let portManager: PortManager;
let logger = getLogger();

// Basic health check server for now
const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: getVersion(),
                uptime: process.uptime(),
                servers: {
                    discovered: appConfig?.servers.length || 0,
                    running: 0,
                    failed: 0,
                },
            })
        );
        return;
    }

    if (url.pathname === '/servers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                servers: detectedServers.map(server => ({
                    name: server.name,
                    protocol: server.protocol,
                    detectedType: server.detectedType,
                    capabilities: server.capabilities,
                    command: server.command,
                    args: server.args,
                    url: server.url,
                    restart: server.restart,
                    healthCheck: server.healthCheck,
                    allocatedPort: portManager?.getPortForServer(server.name),
                })),
                count: detectedServers.length,
                timestamp: new Date().toISOString(),
            })
        );
        return;
    }

    if (url.pathname === '/ports') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                portRange: portManager?.getPortRangeInfo(),
                allocations: portManager?.getAllocations() || [],
                reservedPorts: portManager?.getReservedPorts() || [],
                timestamp: new Date().toISOString(),
            })
        );
        return;
    }

    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                name: 'MCP Proxy',
                version: getVersion(),
                description: 'A conductor service for Model Context Protocol servers',
                endpoints: {
                    health: '/health',
                    servers: '/servers',
                    ports: '/ports',
                    metrics: '/metrics',
                },
                documentation: 'https://github.com/philipobenito/mcp-proxy',
            })
        );
        return;
    }

    // 404 for all other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
        JSON.stringify({
            error: 'Not Found',
            message: `Endpoint ${url.pathname} not found`,
            timestamp: new Date().toISOString(),
        })
    );
});

function getVersion(): string {
    try {
        const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
        return packageJson.version || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function initialiseApplication() {
    try {
        const configLoader = new ConfigLoader();
        const result = await configLoader.loadConfigurationWithDetection();
        appConfig = result.config;
        detectedServers = result.detectedServers;

        // Initialise logger with configuration
        if (appConfig.logging) {
            initialiseLogger(appConfig.logging);
            logger = getLogger();
        }

        // Initialise port manager with environment-configurable range
        const startPort = parseInt(process.env.MCP_PORT_START || '3001');
        const endPort = parseInt(process.env.MCP_PORT_END || '3099');

        portManager = new PortManager({
            startPort,
            endPort,
            reservationTimeout: 60000,
        });

        logger.configLoaded(detectedServers.length, 'servers.json');

        // Allocate ports for stdio servers that will need them
        for (const server of detectedServers) {
            if (server.capabilities.requiresStdio) {
                try {
                    const allocatedPort = await portManager.allocatePort(server.name);
                    logger.portAllocated(server.name, allocatedPort);
                } catch (error) {
                    logger.portAllocationFailed(server.name, error);
                }
            } else {
                logger.info('Server does not require port allocation', {
                    serverName: server.name,
                    protocol: server.protocol,
                    detectedType: server.detectedType,
                    component: 'port-manager',
                });
            }
        }

        const portInfo = portManager.getPortRangeInfo();
        logger.info('Port manager initialised', {
            allocated: portInfo.allocated,
            total: portInfo.total,
            range: `${portInfo.start}-${portInfo.end}`,
            component: 'port-manager',
        });

        logger.appStarting(PORT, HOST);

        server.listen(PORT, HOST, () => {
            logger.appStarted(PORT, HOST);
            logger.info('Service endpoints available', {
                health: `http://${HOST}:${PORT}/health`,
                servers: `http://${HOST}:${PORT}/servers`,
                ports: `http://${HOST}:${PORT}/ports`,
                component: 'application',
            });
            logger.info('Runtime information', {
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                component: 'application',
            });
        });
    } catch (error) {
        if (error instanceof ConfigurationError) {
            logger.configError(error);
        } else {
            logger.error('Failed to initialise application', error, {
                component: 'application',
            });
        }
        process.exit(1);
    }
}

// Start the application
initialiseApplication();

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.appShutdown('SIGTERM');
    cleanup();
});

process.on('SIGINT', () => {
    logger.appShutdown('SIGINT');
    cleanup();
});

function cleanup() {
    server.close(() => {
        logger.info('Server closed', { component: 'application' });

        if (portManager) {
            portManager.cleanup();
            logger.info('Port manager cleaned up', { component: 'port-manager' });
        }

        process.exit(0);
    });
}
