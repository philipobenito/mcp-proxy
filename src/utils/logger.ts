import pino from 'pino';
import { type LoggingConfig } from '../config/index.js';

export interface LoggerContext {
    requestId?: string;
    serverName?: string;
    port?: number;
    component?: string;
}

export class Logger {
    private readonly logger: pino.Logger;
    private readonly context: LoggerContext;

    constructor(config: Partial<LoggingConfig> = {}, context: LoggerContext = {}) {
        const loggerConfig: pino.LoggerOptions = {
            level: config.level || 'info',
            formatters: {
                level: label => ({ level: label }),
            },
            timestamp: pino.stdTimeFunctions.isoTime,
            base: {
                pid: process.pid,
                hostname: process.env.HOSTNAME || 'localhost',
                service: 'mcp-proxy',
                version: this.getVersion(),
            },
        };

        // Configure transport based on format and output
        if (config.format === 'pretty' || process.env.NODE_ENV === 'development') {
            loggerConfig.transport = {
                target: 'pino-pretty',
                options: {
                    colorise: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                    messageFormat: '{component} [{serverName}:{port}] {msg}',
                },
            };
        }

        // Handle file output
        if (config.output === 'file' && config.file) {
            loggerConfig.transport = {
                target: 'pino/file',
                options: {
                    destination: config.file,
                },
            };
        }

        this.logger = pino(loggerConfig);
        this.context = context;
    }

    child(context: LoggerContext): Logger {
        const childLogger = new Logger({}, { ...this.context, ...context });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (childLogger as any).logger = this.logger.child(context);
        return childLogger;
    }

    debug(message: string, extra?: Record<string, unknown>): void {
        this.logger.debug({ ...this.context, ...extra }, message);
    }

    info(message: string, extra?: Record<string, unknown>): void {
        this.logger.info({ ...this.context, ...extra }, message);
    }

    warn(message: string, extra?: Record<string, unknown>): void {
        this.logger.warn({ ...this.context, ...extra }, message);
    }

    error(message: string, error?: Error | unknown, extra?: Record<string, unknown>): void {
        const errorData: Record<string, unknown> = { ...this.context, ...extra };

        if (error) {
            if (error instanceof Error) {
                errorData.error = {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                };
            } else {
                errorData.error = error;
            }
        }

        this.logger.error(errorData, message);
    }

    // Request-specific logging methods
    request(method: string, path: string, extra?: Record<string, unknown>): void {
        this.info('HTTP request received', {
            method,
            path,
            ...extra,
        });
    }

    response(
        method: string,
        path: string,
        statusCode: number,
        duration: number,
        extra?: Record<string, unknown>
    ): void {
        this.info('HTTP response sent', {
            method,
            path,
            statusCode,
            duration,
            ...extra,
        });
    }

    // Server lifecycle logging
    serverStarting(serverName: string, command: string, port?: number): void {
        this.info('Server starting', {
            serverName,
            command,
            port,
            component: 'server-lifecycle',
        });
    }

    serverStarted(serverName: string, port?: number, pid?: number): void {
        this.info('Server started successfully', {
            serverName,
            port,
            pid,
            component: 'server-lifecycle',
        });
    }

    serverFailed(serverName: string, error: Error | unknown, port?: number): void {
        this.error('Server failed to start', error, {
            serverName,
            port,
            component: 'server-lifecycle',
        });
    }

    serverStopped(serverName: string, port?: number, reason?: string): void {
        this.info('Server stopped', {
            serverName,
            port,
            reason,
            component: 'server-lifecycle',
        });
    }

    // Port management logging
    portAllocated(serverName: string, port: number): void {
        this.info('Port allocated', {
            serverName,
            port,
            component: 'port-manager',
        });
    }

    portReleased(serverName: string, port: number): void {
        this.info('Port released', {
            serverName,
            port,
            component: 'port-manager',
        });
    }

    portAllocationFailed(serverName: string, error: Error | unknown): void {
        this.error('Port allocation failed', error, {
            serverName,
            component: 'port-manager',
        });
    }

    // Configuration logging
    configLoaded(serverCount: number, source: string): void {
        this.info('Configuration loaded', {
            serverCount,
            source,
            component: 'config-loader',
        });
    }

    configError(error: Error | unknown, source?: string): void {
        this.error('Configuration error', error, {
            source,
            component: 'config-loader',
        });
    }

    // Application lifecycle
    appStarting(port: number, host: string): void {
        this.info('Application starting', {
            port,
            host,
            component: 'application',
        });
    }

    appStarted(port: number, host: string): void {
        this.info('Application started successfully', {
            port,
            host,
            component: 'application',
        });
    }

    appShutdown(signal: string): void {
        this.info('Application shutting down', {
            signal,
            component: 'application',
        });
    }

    private getVersion(): string {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs');
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const path = require('path');
            const pkg = JSON.parse(
                fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
            );
            return pkg.version || 'unknown';
        } catch {
            return 'unknown';
        }
    }
}

// Default logger instance
let defaultLogger: Logger;

export function getLogger(context?: LoggerContext): Logger {
    if (!defaultLogger) {
        defaultLogger = new Logger();
    }

    if (context) {
        return defaultLogger.child(context);
    }

    return defaultLogger;
}

export function initialiseLogger(config: Partial<LoggingConfig>): void {
    defaultLogger = new Logger(config);
}

// Convenience functions
export function createRequestLogger(requestId: string): Logger {
    return getLogger({ requestId, component: 'http' });
}

export function createServerLogger(serverName: string, port?: number): Logger {
    const context: LoggerContext = { serverName, component: 'server' };
    if (port !== undefined) {
        context.port = port;
    }
    return getLogger(context);
}

export function createComponentLogger(component: string): Logger {
    return getLogger({ component });
}
