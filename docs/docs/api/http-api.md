---
sidebar_position: 1
---

# HTTP API

MCP Proxy exposes a RESTful HTTP API for managing and interacting with MCP servers.

## Base URL

All API endpoints are relative to your MCP Proxy instance:

```
http://localhost:3000
```

## Authentication

MCP Proxy uses HTTP Basic Authentication:

```bash
curl -u username:password http://localhost:3000/api/endpoint
```

Configure credentials in your `.env` file:

```env
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-secure-password
```

## Content Types

All endpoints accept and return JSON:

```
Content-Type: application/json
Accept: application/json
```

## Health Endpoints

### GET /health

Returns the overall health status of the proxy.

**Response:**

```json
{
    "status": "healthy",
    "timestamp": "2024-08-04T10:30:00.000Z",
    "uptime": 3600,
    "version": "1.0.0"
}
```

### GET /health/servers

Returns the health status of all managed MCP servers.

**Response:**

```json
{
    "status": "healthy",
    "servers": {
        "filesystem": {
            "status": "healthy",
            "port": 3001,
            "uptime": 3600,
            "lastCheck": "2024-08-04T10:30:00.000Z"
        },
        "memory": {
            "status": "healthy",
            "port": 3002,
            "uptime": 3580,
            "lastCheck": "2024-08-04T10:30:00.000Z"
        }
    }
}
```

## Server Management

### GET /api/servers

List all configured MCP servers.

**Response:**

```json
{
    "servers": [
        {
            "name": "filesystem",
            "description": "File system operations server",
            "status": "running",
            "port": 3001,
            "type": "docker",
            "command": "docker run -i --rm mcp/filesystem"
        },
        {
            "name": "memory",
            "description": "Memory operations server",
            "status": "running",
            "port": 3002,
            "type": "npx",
            "command": "npx -y @modelcontextprotocol/server-memory"
        }
    ]
}
```

### GET /api/servers/\{name\}

Get details for a specific server.

**Parameters:**

- `name` (string, required): Server name

**Response:**

```json
{
    "name": "filesystem",
    "description": "File system operations server",
    "status": "running",
    "port": 3001,
    "type": "docker",
    "command": "docker run -i --rm mcp/filesystem",
    "uptime": 3600,
    "startedAt": "2024-08-04T09:30:00.000Z",
    "env": {
        "DEBUG": "true"
    }
}
```

### POST /api/servers/\{name\}/restart

Restart a specific server.

**Parameters:**

- `name` (string, required): Server name

**Response:**

```json
{
    "success": true,
    "message": "Server 'filesystem' restarted successfully",
    "server": {
        "name": "filesystem",
        "status": "starting",
        "port": 3001
    }
}
```

### POST /api/servers/\{name\}/stop

Stop a specific server.

**Parameters:**

- `name` (string, required): Server name

**Response:**

```json
{
    "success": true,
    "message": "Server 'filesystem' stopped successfully",
    "server": {
        "name": "filesystem",
        "status": "stopped"
    }
}
```

### POST /api/servers/\{name\}/start

Start a specific server.

**Parameters:**

- `name` (string, required): Server name

**Response:**

```json
{
    "success": true,
    "message": "Server 'filesystem' started successfully",
    "server": {
        "name": "filesystem",
        "status": "running",
        "port": 3001
    }
}
```

## MCP Server Proxying

All requests to `/\{server-name\}/*` are proxied to the corresponding MCP server.

### MCP Tool Execution

**POST /\{server-name\}/tools/\{tool-name\}**

Execute a tool on the specified MCP server.

**Parameters:**

- `server-name` (string, required): Name of the MCP server
- `tool-name` (string, required): Name of the tool to execute

**Request Body:**

```json
{
    "arguments": {
        "param1": "value1",
        "param2": "value2"
    }
}
```

**Response:**

```json
{
    "success": true,
    "result": {
        "output": "Tool execution result"
    },
    "executionTime": 150
}
```

### MCP Resource Access

**GET /\{server-name\}/resources/\{resource-path\}**

Access a resource from the specified MCP server.

**Parameters:**

- `server-name` (string, required): Name of the MCP server
- `resource-path` (string, required): Path to the resource

**Response:**

```json
{
    "uri": "file:///path/to/resource",
    "mimeType": "text/plain",
    "content": "Resource content here"
}
```

## Configuration

### GET /api/config

Get current proxy configuration.

**Response:**

```json
{
    "version": "1.0.0",
    "nodeEnv": "production",
    "port": 3000,
    "portRange": {
        "start": 3001,
        "end": 3099
    },
    "logging": {
        "level": "info",
        "format": "json"
    },
    "serversConfigPath": "servers.json",
    "serversDirectoryPath": "servers/"
}
```

## Metrics

### GET /api/metrics

Get proxy metrics and statistics.

**Response:**

```json
{
    "requests": {
        "total": 1250,
        "success": 1200,
        "errors": 50,
        "rate": 2.1
    },
    "servers": {
        "total": 3,
        "running": 3,
        "stopped": 0,
        "failed": 0
    },
    "system": {
        "uptime": 86400,
        "memory": {
            "used": 256,
            "total": 1024
        },
        "cpu": 15.5
    }
}
```

## Error Responses

All error responses follow a consistent format:

```json
{
    "success": false,
    "error": {
        "code": "SERVER_NOT_FOUND",
        "message": "Server 'unknown' not found",
        "details": {
            "serverName": "unknown",
            "availableServers": ["filesystem", "memory"]
        }
    },
    "timestamp": "2024-08-04T10:30:00.000Z"
}
```

### Common Error Codes

- `SERVER_NOT_FOUND`: Requested server does not exist
- `SERVER_NOT_RUNNING`: Server exists but is not currently running
- `TOOL_NOT_FOUND`: Requested tool does not exist on the server
- `VALIDATION_ERROR`: Request validation failed
- `INTERNAL_ERROR`: Internal server error
- `AUTHENTICATION_REQUIRED`: Basic auth credentials required
- `RATE_LIMIT_EXCEEDED`: Too many requests

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default limit**: 100 requests per minute per IP
- **Headers included in response**:
    - `X-RateLimit-Limit`: Request limit per window
    - `X-RateLimit-Remaining`: Requests remaining in current window
    - `X-RateLimit-Reset`: Time when rate limit resets

When rate limit is exceeded:

```json
{
    "success": false,
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "Too many requests. Please try again later.",
        "retryAfter": 60
    }
}
```

## WebSocket API

For real-time communication with MCP servers:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/\{server-name\}');

ws.onopen = () => {
    // Send MCP messages directly
    ws.send(
        JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1,
        })
    );
};

ws.onmessage = event => {
    const response = JSON.parse(event.data);
    console.log('MCP Response:', response);
};
```
