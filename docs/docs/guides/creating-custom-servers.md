---
sidebar_position: 2
---

# Creating Custom Servers

Learn how to create and integrate custom MCP servers with the proxy.

## Overview

MCP Proxy supports three types of custom servers:

1. **HTTP-based servers** - Native HTTP servers that accept a PORT environment variable
2. **Stdio-based servers** - Traditional MCP servers using stdin/stdout communication
3. **Docker-based servers** - Containerised servers for isolation and deployment

## HTTP-Based Servers

HTTP servers are the most flexible option and integrate seamlessly with the proxy.

### Basic Structure

```typescript
// src/index.ts
import { FastifyInstance } from 'fastify';
import { createMCPServer } from '@modelcontextprotocol/sdk';

const port = parseInt(process.env.PORT || '3001');

const server = createMCPServer({
    name: 'my-custom-server',
    version: '1.0.0',
});

// Add your MCP tools and resources here
server.addTool(
    'example-tool',
    {
        description: 'An example tool',
        inputSchema: {
            type: 'object',
            properties: {
                input: { type: 'string' },
            },
        },
    },
    async args => {
        return { result: `Processed: ${args.input}` };
    }
);

// Start HTTP server
server.listen(port, () => {
    console.log(`Custom MCP server running on port ${port}`);
});
```

### Package Configuration

```json
{
    "name": "my-custom-server",
    "version": "1.0.0",
    "type": "module",
    "main": "dist/index.js",
    "scripts": {
        "start": "node dist/index.js",
        "dev": "tsx --watch src/index.ts",
        "build": "tsc"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "^1.0.0",
        "fastify": "^4.0.0"
    },
    "devDependencies": {
        "@types/node": "^22.0.0",
        "tsx": "^4.0.0",
        "typescript": "^5.6.0"
    }
}
```

### Integration

Add to your `servers.json`:

```json
{
    "my-custom-server": {
        "command": "cd ./servers/my-custom-server && npm start",
        "description": "My custom MCP server",
        "env": {
            "NODE_ENV": "production"
        }
    }
}
```

## Stdio-Based Servers

Traditional MCP servers using stdin/stdout communication.

### Basic Structure

```typescript
// src/index.ts
import { MCPServer } from '@modelcontextprotocol/sdk';

const server = new MCPServer({
    name: 'stdio-custom-server',
    version: '1.0.0',
});

// Add tools
server.addTool(
    'process-data',
    {
        description: 'Process data with custom logic',
        inputSchema: {
            type: 'object',
            properties: {
                data: { type: 'string' },
                operation: { type: 'string', enum: ['transform', 'validate'] },
            },
            required: ['data', 'operation'],
        },
    },
    async args => {
        switch (args.operation) {
            case 'transform':
                return { result: args.data.toUpperCase() };
            case 'validate':
                return { valid: args.data.length > 0 };
            default:
                throw new Error(`Unknown operation: ${args.operation}`);
        }
    }
);

// Start stdio server
server.connect();
```

### Integration

The proxy automatically wraps stdio servers with an HTTP bridge:

```json
{
    "stdio-custom": {
        "command": "node ./servers/stdio-custom/dist/index.js",
        "description": "Custom stdio-based MCP server"
    }
}
```

## Docker-Based Servers

Containerised servers for maximum isolation and portability.

### Dockerfile

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001
USER mcp

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Build and Integration

```bash
# Build the Docker image
docker build -t mcp/my-custom-server .
```

Add to `servers.json`:

```json
{
    "docker-custom": {
        "command": "docker run -i --rm mcp/my-custom-server",
        "description": "Dockerised custom MCP server"
    }
}
```

## Advanced Features

### Environment Variables

Pass configuration through environment variables:

```json
{
    "advanced-server": {
        "command": "node ./servers/advanced/dist/index.js",
        "env": {
            "API_KEY": "your-api-key",
            "DEBUG": "true",
            "CACHE_SIZE": "1000"
        }
    }
}
```

### Health Checks

Implement health check endpoints:

```typescript
// For HTTP servers
server.get('/health', async (request, reply) => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
});

// For stdio servers, respond to ping messages
server.addTool(
    'health-check',
    {
        description: 'Health check endpoint',
        inputSchema: { type: 'object', properties: {} },
    },
    async () => {
        return { status: 'healthy', timestamp: new Date().toISOString() };
    }
);
```

### Error Handling

Implement robust error handling:

```typescript
server.addTool(
    'robust-tool',
    {
        description: 'Tool with error handling',
        inputSchema: {
            type: 'object',
            properties: {
                input: { type: 'string' },
            },
        },
    },
    async args => {
        try {
            // Your tool logic here
            const result = processInput(args.input);
            return { success: true, result };
        } catch (error) {
            // Log error for debugging
            console.error('Tool error:', error);

            // Return structured error response
            return {
                success: false,
                error: error.message,
                code: 'PROCESSING_ERROR',
            };
        }
    }
);
```

## Testing

### Unit Testing

```typescript
// tests/server.test.ts
import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers';

describe('Custom MCP Server', () => {
    it('should process data correctly', async () => {
        const server = createTestServer();
        const result = await server.callTool('process-data', {
            data: 'hello',
            operation: 'transform',
        });

        expect(result.result).toBe('HELLO');
    });
});
```

### Integration Testing

```typescript
// tests/integration.test.ts
import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';

describe('Server Integration', () => {
    it('should be accessible via proxy', async () => {
        const response = await fetch('http://localhost:3000/my-custom-server/health');
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe('healthy');
    });
});
```

## Best Practices

### Configuration

- Use environment variables for sensitive data
- Provide sensible defaults for optional configuration
- Validate configuration on startup

### Performance

- Implement caching where appropriate
- Use streaming for large data sets
- Set appropriate timeouts

### Security

- Validate all inputs
- Sanitise outputs
- Use least-privilege principles for Docker containers
- Never log sensitive information

### Monitoring

- Implement structured logging
- Include request IDs for tracing
- Monitor resource usage
- Implement graceful shutdown handling

### Documentation

- Document all tools and their schemas
- Provide usage examples
- Include troubleshooting guides
- Maintain version compatibility notes
