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

Authentication is optional and can be enabled via environment variables. When enabled, MCP Proxy supports multiple authentication methods:

- **Bearer Token Authentication**
- **Basic Authentication** 
- **API Key Authentication**

Configure authentication in your `.env` file:

```env
ENABLE_AUTH=true
# Configure your authentication method as needed
```

## Content Types

All endpoints accept and return JSON:

```
Content-Type: application/json
Accept: application/json
```

## Core Endpoints

### GET /

Returns general information about the MCP Proxy instance.

**Response:**

```json
{
    "name": "MCP Proxy",
    "version": "1.0.0",
    "description": "HTTP proxy and request management system for MCP servers",
    "endpoints": {
        "root": "/",
        "health": "/health",
        "servers": "/servers",
        "ports": "/ports",
        "stats": "/stats",
        "metrics": "/metrics"
    },
    "servers": [
        {
            "name": "filesystem",
            "type": "docker",
            "protocol": "stdio",
            "url": "/filesystem/*"
        }
    ],
    "features": {
        "cors": true,
        "metrics": true,
        "auth": false
    }
}
```

### GET /health

Returns the overall health status of the proxy and managed servers.

**Response:**

```json
{
    "status": "healthy",
    "timestamp": "2024-08-04T10:30:00.000Z",
    "uptime": 3600,
    "servers": {
        "total": 3,
        "running": 3,
        "failed": 0
    },
    "memory": {
        "rss": 45678592,
        "heapTotal": 29360128,
        "heapUsed": 18234567,
        "external": 1234567,
        "arrayBuffers": 123456
    }
}
```

### GET /servers

List all configured MCP servers with their current status.

**Response:**

```json
{
    "servers": [
        {
            "name": "filesystem",
            "type": "docker",
            "protocol": "stdio",
            "url": null,
            "command": "docker run -i --rm mcp/filesystem",
            "args": ["-i", "--rm", "mcp/filesystem"],
            "capabilities": {
                "requiresStdio": true
            },
            "port": 3001,
            "status": "running",
            "pid": 12345,
            "restartCount": 0,
            "startedAt": "2024-08-04T09:30:00.000Z"
        },
        {
            "name": "memory",
            "type": "npx",
            "protocol": "stdio",
            "url": null,
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-memory"],
            "capabilities": {
                "requiresStdio": true
            },
            "port": 3002,
            "status": "running",
            "pid": 12346,
            "restartCount": 1,
            "startedAt": "2024-08-04T09:32:00.000Z"
        }
    ],
    "count": 2,
    "timestamp": "2024-08-04T10:30:00.000Z"
}
```

### GET /ports

Get information about port allocations and availability.

**Response:**

```json
{
    "range": {
        "start": 3001,
        "end": 3099,
        "total": 99,
        "allocated": 2,
        "available": 97
    },
    "allocations": [
        {
            "serverName": "filesystem",
            "port": 3001,
            "allocatedAt": "2024-08-04T09:30:00.000Z"
        },
        {
            "serverName": "memory", 
            "port": 3002,
            "allocatedAt": "2024-08-04T09:30:00.000Z"
        }
    ],
    "reserved": [],
    "timestamp": "2024-08-04T10:30:00.000Z"
}
```

### GET /stats

Get basic application statistics.

**Response:**

```json
{
    "application": {
        "uptime": 3600,
        "memory": {
            "rss": 45678592,
            "heapTotal": 29360128, 
            "heapUsed": 18234567,
            "external": 1234567,
            "arrayBuffers": 123456
        },
        "version": "1.0.0"
    },
    "servers": 2,
    "activeConnections": 0,
    "timestamp": "2024-08-04T10:30:00.000Z"
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

### GET /metrics

Get detailed metrics and statistics (when metrics are enabled).

**Response:**

```json
{
    "proxy": {
        "totalRequests": 1250,
        "successfulRequests": 1200,
        "failedRequests": 50,
        "averageResponseTime": 150
    },
    "routing": {
        "registeredServers": 2,
        "totalRoutes": 2,
        "routingErrors": 0
    },
    "processes": {
        "total": 2,
        "running": 2,
        "failed": 0
    },
    "ports": {
        "start": 3001,
        "end": 3099,
        "total": 99,
        "allocated": 2,
        "available": 97
    },
    "auth": null,
    "timestamp": "2024-08-04T10:30:00.000Z"
}
```

## Error Responses

All error responses follow a consistent format:

```json
{
    "error": "Not Found",
    "statusCode": 404,
    "timestamp": "2024-08-04T10:30:00.000Z",
    "message": "No server found for path /unknown",
    "availableServers": ["filesystem", "memory"]
}
```

### Common HTTP Status Codes

- **200**: Success
- **404**: Server or endpoint not found  
- **500**: Internal server error
- **503**: Service unavailable (server unhealthy)

### CORS Support

When CORS is enabled (default), the proxy automatically handles preflight OPTIONS requests and includes appropriate CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```
