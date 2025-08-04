import { z } from 'zod';

export const HealthCheckSchema = z.object({
    interval: z.number().min(1).default(30),
    timeout: z.number().min(1).default(10),
    retries: z.number().min(0).default(3),
});

export const ServerConfigSchema = z.object({
    name: z.string().min(1),
    protocol: z.enum(['stdio', 'http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    env: z.record(z.string()).optional(),
    restart: z.boolean().default(true),
    healthCheck: HealthCheckSchema.optional(),
});

export const ProxyConfigSchema = z.object({
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('0.0.0.0'),
    http2: z.boolean().default(true),
    cors: z
        .object({
            origin: z.string().default('*'),
            methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
            allowedHeaders: z
                .array(z.string())
                .default(['Content-Type', 'Authorization', 'X-MCP-Session']),
        })
        .optional(),
    rateLimit: z
        .object({
            windowMs: z.number().default(60000),
            max: z.number().default(1000),
        })
        .optional(),
});

export const LoggingConfigSchema = z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('json'),
    output: z.enum(['stdout', 'file']).default('stdout'),
    file: z.string().optional(),
});

export const ConfigSchema = z.object({
    servers: z.array(ServerConfigSchema),
    proxy: ProxyConfigSchema.optional(),
    logging: LoggingConfigSchema.optional(),
});

export type HealthCheckConfig = z.infer<typeof HealthCheckSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
