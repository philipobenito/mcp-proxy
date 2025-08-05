---
sidebar_position: 2
---

# Configuration

## Environment Configuration

The proxy requires minimal configuration. Create a `.env` file in your project root:

```env
# Basic configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# MCP server port range
MCP_PORT_START=3001
MCP_PORT_END=3099

# Optional features (all enabled by default except auth)
ENABLE_CORS=true
ENABLE_METRICS=true
ENABLE_AUTH=false

# Authentication (when ENABLE_AUTH=true)
# Configure your authentication method as needed
```

## Server Configuration

MCP Proxy supports two methods for configuring your MCP servers:

### Method 1: servers.json (Recommended)

Create a `servers.json` file in your project root. This file is gitignored, allowing you to maintain your personal server configuration without affecting the repository.

```json
{
    "filesystem": {
        "command": "docker run -i --rm --mount type=bind,src=${PWD}/data,dst=/projects mcp/filesystem",
        "description": "File system operations server"
    },
    "memory": {
        "command": "npx -y @modelcontextprotocol/server-memory",
        "env": {
            "MEMORY_FILE_PATH": "./data/memory.json"
        }
    },
    "git": {
        "command": "docker run -i --rm --mount type=bind,src=${PWD}/repos,dst=/workspace mcp/git"
    },
    "time": {
        "command": "docker run -i --rm -e LOCAL_TIMEZONE=Europe/London mcp/time"
    }
}
```

### Method 2: Directory-based Servers

Alternatively, you can create individual server directories in `./servers/`. Each directory must contain a `package.json` with appropriate start scripts.

#### Docker Server Example

```json
// servers/filesystem/package.json
{
    "name": "filesystem-server",
    "scripts": {
        "start": "docker run -i --rm --mount type=bind,src=${PWD}/data,dst=/projects mcp/filesystem"
    }
}
```

#### NPX Server Example

```json
// servers/memory/package.json
{
    "name": "memory-server",
    "scripts": {
        "start": "npx -y @modelcontextprotocol/server-memory"
    }
}
```

#### Custom HTTP Server Example

```json
// servers/custom/package.json
{
    "name": "my-custom-server",
    "type": "module",
    "scripts": {
        "start": "tsx src/index.ts",
        "build": "tsc"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "^0.5.0"
    }
}
```

## Server Types

The proxy automatically detects and handles different server types:

- **Docker servers**: Commands starting with `docker run`
- **NPX servers**: Commands starting with `npx`
- **HTTP servers**: Custom scripts that accept a `PORT` environment variable

## Configuration Validation

On startup, the proxy will:

1. Scan for servers in both `servers.json` and `./servers/` directory
2. Validate each server configuration
3. Assign random ports (3001-3099) to each server
4. Start servers according to their type
5. Create routing paths based on server names

## Example Setup

With the configuration above, your servers will be available at:

- `http://localhost:3000/filesystem/*` → Docker filesystem server
- `http://localhost:3000/memory/*` → NPX memory server
- `http://localhost:3000/git/*` → Docker git server
- `http://localhost:3000/time/*` → Docker time server
