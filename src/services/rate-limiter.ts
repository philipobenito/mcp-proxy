import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { getLogger } from '../utils/index.js';

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    keyGenerator: (req: IncomingMessage) => string;
    message: string;
    statusCode: number;
}

export interface RateLimitInfo {
    limit: number;
    remaining: number;
    resetTime: Date;
    totalHits: number;
}

export interface RequestRecord {
    count: number;
    resetTime: number;
    firstRequest: number;
}

export class RateLimiterService extends EventEmitter {
    private readonly configs = new Map<string, RateLimitConfig>();
    private readonly store = new Map<string, RequestRecord>();
    private readonly logger = getLogger({ component: 'rate-limiter' });
    private cleanupInterval?: NodeJS.Timeout;

    constructor() {
        super();
        
        // Clean up expired records every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredRecords();
        }, 60000);
    }

    configureServerLimits(serverName: string, config: Partial<RateLimitConfig>): void {
        const fullConfig: RateLimitConfig = {
            windowMs: config.windowMs || 60000, // 1 minute
            maxRequests: config.maxRequests || 100,
            skipSuccessfulRequests: config.skipSuccessfulRequests || false,
            skipFailedRequests: config.skipFailedRequests || false,
            keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
            message: config.message || 'Too many requests',
            statusCode: config.statusCode || 429,
        };

        this.configs.set(serverName, fullConfig);
        
        this.logger.info('Configured rate limits for server', {
            serverName,
            windowMs: fullConfig.windowMs,
            maxRequests: fullConfig.maxRequests,
        });
    }

    async checkRateLimit(
        serverName: string,
        req: IncomingMessage
    ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
        const config = this.configs.get(serverName);
        if (!config) {
            // No rate limiting configured for this server
            return {
                allowed: true,
                info: {
                    limit: Infinity,
                    remaining: Infinity,
                    resetTime: new Date(Date.now() + 3600000), // 1 hour from now
                    totalHits: 0,
                },
            };
        }

        const key = this.generateKey(serverName, req, config);
        const now = Date.now();
        
        let record = this.store.get(key);
        
        if (!record || now > record.resetTime) {
            // Create new record or reset expired one
            record = {
                count: 0,
                resetTime: now + config.windowMs,
                firstRequest: now,
            };
        }

        record.count++;
        this.store.set(key, record);

        const remaining = Math.max(0, config.maxRequests - record.count);
        const allowed = record.count <= config.maxRequests;
        
        const info: RateLimitInfo = {
            limit: config.maxRequests,
            remaining,
            resetTime: new Date(record.resetTime),
            totalHits: record.count,
        };

        if (!allowed) {
            this.logger.warn('Rate limit exceeded', {
                serverName,
                key: this.sanitiseKey(key),
                count: record.count,
                limit: config.maxRequests,
                windowMs: config.windowMs,
            });

            this.emit('rateLimitExceeded', {
                serverName,
                key,
                info,
                config,
            });
        }

        return { allowed, info };
    }

    recordRequest(serverName: string, req: IncomingMessage, success: boolean): void {
        const config = this.configs.get(serverName);
        if (!config) {
            return;
        }

        // Skip recording based on configuration
        if ((success && config.skipSuccessfulRequests) || 
            (!success && config.skipFailedRequests)) {
            return;
        }

        // The request was already recorded in checkRateLimit
        // This method could be used for additional tracking if needed
    }

    getRateLimitInfo(serverName: string, req: IncomingMessage): RateLimitInfo | null {
        const config = this.configs.get(serverName);
        if (!config) {
            return null;
        }

        const key = this.generateKey(serverName, req, config);
        const record = this.store.get(key);
        
        if (!record) {
            return {
                limit: config.maxRequests,
                remaining: config.maxRequests,
                resetTime: new Date(Date.now() + config.windowMs),
                totalHits: 0,
            };
        }

        const remaining = Math.max(0, config.maxRequests - record.count);
        
        return {
            limit: config.maxRequests,
            remaining,
            resetTime: new Date(record.resetTime),
            totalHits: record.count,
        };
    }

    getServerConfig(serverName: string): RateLimitConfig | undefined {
        return this.configs.get(serverName);
    }

    getAllConfigs(): Map<string, RateLimitConfig> {
        return new Map(this.configs);
    }

    resetServer(serverName: string): void {
        // Remove all records for this server
        const keysToDelete: string[] = [];
        
        for (const [key] of this.store) {
            if (key.startsWith(`${serverName}:`)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.store.delete(key);
        }

        this.logger.info('Reset rate limits for server', { serverName });
    }

    resetAll(): void {
        this.store.clear();
        this.logger.info('Reset all rate limits');
    }

    getStats(): {
        totalConfigs: number;
        totalRecords: number;
        servers: Array<{
            name: string;
            config: RateLimitConfig;
            activeRecords: number;
        }>;
    } {
        const servers: Array<{
            name: string;
            config: RateLimitConfig;
            activeRecords: number;
        }> = [];

        for (const [serverName, config] of this.configs) {
            const activeRecords = Array.from(this.store.keys())
                .filter(key => key.startsWith(`${serverName}:`))
                .length;

            servers.push({
                name: serverName,
                config,
                activeRecords,
            });
        }

        return {
            totalConfigs: this.configs.size,
            totalRecords: this.store.size,
            servers,
        };
    }

    private generateKey(serverName: string, req: IncomingMessage, config: RateLimitConfig): string {
        const identifier = config.keyGenerator(req);
        return `${serverName}:${identifier}`;
    }

    private defaultKeyGenerator(req: IncomingMessage): string {
        // Use IP as default identifier
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded 
            ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
            : req.socket.remoteAddress || 'unknown';
        
        return ip;
    }

    private sanitiseKey(key: string): string {
        // Remove potential sensitive information for logging
        return key.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, 'xxx.xxx.xxx.xxx');
    }

    private cleanupExpiredRecords(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, record] of this.store) {
            if (now > record.resetTime) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.store.delete(key);
        }

        if (keysToDelete.length > 0) {
            this.logger.debug('Cleaned up expired rate limit records', {
                cleaned: keysToDelete.length,
                remaining: this.store.size,
            });
        }
    }

    cleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
        this.configs.clear();
        this.removeAllListeners();
    }
}