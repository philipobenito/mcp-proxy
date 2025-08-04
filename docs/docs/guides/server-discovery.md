---
sidebar_position: 1
---

# Server Discovery

MCP Proxy uses a hybrid discovery mechanism that supports both configuration-based and directory-based server management.

## Discovery Process

On startup, the proxy performs the following steps:

1. **Scans `./servers/` directory** for subdirectories (traditional method)
2. **Reads `servers.json`** for user-defined server configurations (recommended)
3. **Validates configurations** to confirm they're valid MCP servers
4. **Detects server type** (Docker, NPX, or HTTP)
5. **Starts servers appropriately** based on their type
6. **Exposes via proxy** using the server name as the route path

## Configuration-Based Discovery (Recommended)

Define servers in `servers.json`:

```json
{
    "filesystem": {
        "command": "docker run -i --rm --mount type=bind,src=${PWD}/data,dst=/projects mcp/filesystem",
        "description": "File system operations server",
        "env": {
            "DEBUG": "true"
        }
    },
    "memory": {
        "command": "npx -y @modelcontextprotocol/server-memory",
        "env": {
            "MEMORY_FILE_PATH": "./data/memory.json"
        }
    }
}
```

### Configuration Schema

Each server configuration supports:

- **command** (required): The command to start the server
- **description** (optional): Human-readable description
- **env** (optional): Environment variables for the server

## Directory-Based Discovery

Create server directories in `./servers/`:

```
servers/
├── filesystem/
│   ├── package.json
│   └── .env
├── memory/
│   ├── package.json
│   └── data/
└── custom/
    ├── package.json
    ├── src/
    └── .env
```

Each directory must contain a `package.json` with a `start` script.

## Server Type Detection

The proxy automatically detects server types based on the start command:

### Docker Servers

Commands starting with `docker run`:

```json
{
    "scripts": {
        "start": "docker run -i --rm mcp/filesystem"
    }
}
```

**Behaviour**: Proxy starts the Docker container and creates a stdio-to-HTTP bridge.

### NPX Servers

Commands starting with `npx`:

```json
{
    "scripts": {
        "start": "npx -y @modelcontextprotocol/server-memory"
    }
}
```

**Behaviour**: Proxy executes the NPX command and creates a stdio-to-HTTP bridge.

### HTTP Servers

Custom scripts that accept a `PORT` environment variable:

```json
{
    "scripts": {
        "start": "tsx src/index.ts"
    }
}
```

**Behaviour**: Proxy starts the server directly with an assigned port.

## Port Assignment

The proxy automatically assigns ports in the range 3001-3099:

- Each discovered server gets a unique random port
- Ports are managed to avoid conflicts
- Failed servers release their ports for reuse

## Route Creation

Server routes are created based on the server name:

- Server name `filesystem` → `http://localhost:3000/filesystem/*`
- Server name `memory` → `http://localhost:3000/memory/*`
- Server name `my-custom-server` → `http://localhost:3000/my-custom-server/*`

## Validation

During discovery, the proxy validates:

1. **Configuration syntax** (valid JSON for `servers.json`)
2. **Required fields** (command for config-based, package.json for directory-based)
3. **Command accessibility** (Docker available, NPX packages accessible)
4. **Port availability** (within the configured range)

## Error Handling

If a server fails to start:

- The proxy logs the error with context
- Other servers continue to operate normally
- The failed server's route returns a 503 Service Unavailable
- The server can be restarted without affecting others

## Development Tips

### Hot Reload

In development mode (`pnpm dev`), the proxy watches for:

- Changes to `servers.json`
- New directories in `./servers/`
- Changes to existing server `package.json` files

### Debugging Discovery

Enable debug logging to see the discovery process:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

This will show:

- Which servers are discovered
- Port assignments
- Server start commands
- Route registrations
