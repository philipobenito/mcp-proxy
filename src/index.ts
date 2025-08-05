#!/usr/bin/env node
import { ProxyApplication } from './proxy-application.js';
import { getLogger } from './utils/index.js';

const logger = getLogger({ component: 'main' });

async function main() {
    const app = new ProxyApplication({
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || '0.0.0.0',
        portStart: parseInt(process.env.MCP_PORT_START || '3001'),
        portEnd: parseInt(process.env.MCP_PORT_END || '3099'),
        enableCors: process.env.ENABLE_CORS !== 'false',
        enableMetrics: process.env.ENABLE_METRICS !== 'false',
        enableAuth: process.env.ENABLE_AUTH === 'true',
    });

    try {
        await app.initialise();
        await app.start();

        logger.info('MCP Proxy started successfully', {
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
        });
    } catch (error) {
        logger.error('Failed to start MCP Proxy', error);
        process.exit(1);
    }

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully`);

        try {
            await app.stop();
            logger.info('MCP Proxy stopped successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
        logger.error('Uncaught exception', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection', reason, { promise });
        process.exit(1);
    });
}

// Start the application
main().catch(error => {
    logger.error('Failed to start application', error);
    process.exit(1);
});
