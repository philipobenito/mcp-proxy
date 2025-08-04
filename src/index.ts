#!/usr/bin/env node
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

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
                    discovered: 0,
                    running: 0,
                    failed: 0,
                },
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

server.listen(PORT, HOST, () => {
    console.log(`MCP Proxy started on http://${HOST}:${PORT}`);
    console.log(`Health endpoint: http://${HOST}:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Node.js version: ${process.version}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
