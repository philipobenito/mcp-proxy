# MCP Proxy

A self-hosted conductor service that orchestrates and exposes multiple Model Context Protocol (MCP) servers through a unified HTTP interface. This platform allows you to manage multiple MCP implementations whilst maintaining full control over your credentials and data.

**Note**: This platform is designed for self-hosted environments where you maintain full control over your data and credentials. It is not intended as a public service.

## Why Does This Exist?

The MCP Proxy addresses several key challenges when working with Model Context Protocol servers in production environments:

**Network-Accessible MCP Servers**: Many AI tools and platforms (Gemini Gems, Claude Projects, custom integrations) require network-accessible MCP endpoints rather than local implementations. This platform bridges that gap by exposing local MCP servers over HTTP.

**Credential Security & Control**: Rather than sharing API keys with third-party MCP hosting services, this platform allows you to maintain complete control over your credentials, API keys, and sensitive data whilst still providing network access to AI tools.

**Unified Management**: Instead of managing multiple standalone MCP servers, this conductor provides a single entry point with automatic discovery, health monitoring, and unified logging across all your MCP implementations.

**Development & Learning**: This project serves as both a practical tool and a learning platform for understanding MCP architecture, server orchestration, and building production-ready API gateways.

**Scalable Architecture**: The modular design allows you to easily add new MCP server types through git submodules or local implementations without modifying the core conductor logic.

## Overview

The MCP Proxy acts as a front controller that automatically discovers, configures, and proxies requests to individual MCP servers. Each server runs on its own isolated port (3001-3099) whilst the main conductor exposes them through clean URL paths on port 3000.

### Architecture

```
┌─────────────────────────────────────────┐
│           MCP Proxy                     │
│              (Port 3000)                │
├─────────────────────────────────────────┤
│  /gdrive  →  MCP GDrive Server (3001)   │
│  /steam   →  MCP Steam Server (3002)    │
│  /custom  →  Additional servers...      │
└─────────────────────────────────────────┘
```

## Key Features

- **Zero-Config Discovery**: Automatically discovers any server in `./servers/` directory
- **Multi-Protocol Support**: Supports both HTTP and stdio MCP servers seamlessly
- **Dynamic Port Assignment**: Auto-assigns random ports (3001-3099) to discovered servers
- **Stdio-to-HTTP Bridge**: Automatically wraps stdio servers for network access
- **Unified Routing**: Clean URL paths (`mcp.example.com/servername`) route to appropriate servers
- **Credential Isolation**: Each server manages its own credentials independently
- **Health Monitoring**: Monitors server health and handles failures gracefully
- **Development Mode**: Hot-reload capabilities for development
- **Production Ready**: Process management and logging for production deployment

## Modern Technology Stack

This project leverages bleeding-edge technologies for optimal performance and developer experience:

### Core Technologies

- **Node.js 22+**: Latest LTS with native ES modules, top-level await, and performance improvements
- **TypeScript 5.6+**: Strict type safety with latest language features and improved inference
- **ESM (ES Modules)**: Native module system with tree-shaking and better performance
- **pnpm**: Fast, disk-efficient package manager with workspace support

### Development Tooling

- **Vitest**: Next-generation testing framework with native TypeScript support
- **ESLint 9**: Flat configuration with TypeScript-aware rules
- **Prettier**: Opinionated code formatting
- **tsx**: Ultra-fast TypeScript execution and hot reload
- **Biome**: Optional Rust-based linter and formatter for maximum speed

### Runtime & Deployment

- **Docker Compose V2**: Modern container orchestration
- **Multi-stage Docker builds**: Optimised production images
- **HTTP/2 Support**: Modern protocol with multiplexing and server push
- **WebSocket Health Checks**: Real-time monitoring capabilities
- **Structured JSON Logging**: Machine-readable logs for observability

### Code Quality

- **Strict TypeScript**: `strict: true` with additional compiler checks
- **Import/Export Maps**: Modern module resolution
- **Zero-config TypeScript**: Minimal setup with maximum type safety
- **Fast Refresh**: Sub-second hot reload during development

## Quick Start

### Prerequisites

- Node.js 22 or higher (latest LTS recommended)
- TypeScript 5.6+ (for type safety and modern language features)
- pnpm (fast, disk space efficient package manager)
- Git (for managing MCP server repositories)
- Docker and Docker Compose V2 (for containerised deployment)

### Installation

#### Option 1: Docker (Recommended)

```bash
git clone https://github.com/philipobenito/mcp-proxy.git
cd mcp-proxy

# Development environment
docker-compose -f docker-compose.dev.yml up --build

# Production environment
cp .env.docker .env.production
# Edit .env.production with your settings
docker-compose up -d --build
```

#### Option 2: Local Installation

```bash
git clone https://github.com/philipobenito/mcp-proxy.git
cd mcp-proxy
pnpm install
pnpm setup
```

### Configuration

The proxy requires minimal configuration. Create a `.env` file:

```env
# Basic configuration
NODE_ENV=production
PORT=3000
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-secure-password-here

# Optional: Custom port range for servers
PORT_RANGE_START=3001
PORT_RANGE_END=3099
```

**Server Configuration**: Create a `servers.json` file (gitignored) for your personal server setup:

```json
// servers.json (this file is gitignored)
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

**Note**: The `servers.json` file is gitignored, allowing you to maintain your personal server configuration without affecting the repository.

### Running

#### Docker Deployment

```bash
# Development mode
pnpm docker:dev
# or
docker compose -f docker-compose.dev.yml up

# Production mode
pnpm docker:prod
# or
docker compose up -d

# View logs
pnpm docker:logs
# or
docker compose logs -f mcp-proxy

# Stop services
pnpm docker:stop
# or
docker compose down
```

#### Local Deployment

```bash
# Production mode
pnpm start

# Development mode with auto-reload
pnpm dev
```

The platform will be available at `http://localhost:3000`

See [DOCKER.md](DOCKER.md) for comprehensive Docker deployment guide.

## Server Discovery and Management

### Automatic Discovery

The platform uses a hybrid discovery mechanism for maximum flexibility. On startup, it:

1. **Scans `./servers/` directory** for any subdirectories (traditional method)
2. **Reads `servers.json`** for user-defined server configurations (recommended)
3. **Validates configurations** to confirm they're valid MCP servers
4. **Detects server type**:
    - **Docker servers**: Have `docker run` commands
    - **NPX servers**: Have `npx` commands
    - **HTTP servers**: Have custom scripts that accept PORT
5. **Starts servers appropriately**:
    - **Docker servers**: Runs containers with stdio-to-HTTP adapter
    - **NPX servers**: Executes packages with stdio-to-HTTP adapter
    - **HTTP servers**: Started directly with assigned port
6. **Exposes via proxy** using the server name as the route path

**Example**: With servers defined in `servers.json` and `./servers/custom/`, they'll all be available:

- `http://localhost:3000/filesystem/*` → Docker container from `servers.json`
- `http://localhost:3000/memory/*` → NPX package from `servers.json`
- `http://localhost:3000/custom/*` → Directory-based server

### Server Requirements

The proxy supports two configuration methods:

#### Configuration-Based Servers (Recommended)

Define servers in a `servers.json` file:

```json
{
    "server-name": {
        "command": "docker run -i --rm mcp/filesystem",
        "env": {
            "ENV_VAR": "value"
        },
        "description": "Optional description"
    }
}
```

#### Directory-Based Servers (Traditional)

Each server directory in `./servers/` must contain:

- `package.json` - Node.js project configuration
- **For Docker servers**: `start` script that runs a Docker container
- **For NPX servers**: `start` script that uses `npx` to run a package
- **For HTTP servers**: `start` script that accepts `PORT` environment variable
- `.env` (optional) - Server-specific credentials and configuration

**Docker Server Example** (Most Common):

```json
// package.json
{
    "name": "filesystem-server",
    "scripts": {
        "start": "docker run -i --rm --mount type=bind,src=${PWD}/data,dst=/projects mcp/filesystem"
    }
}
```

**NPX Server Example**:

```json
// package.json
{
    "name": "memory-server",
    "scripts": {
        "start": "npx -y @modelcontextprotocol/server-memory"
    }
}
```

**Custom HTTP Server Example**:

```json
// package.json
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

The proxy automatically detects the server type and handles stdio-to-HTTP adaptation when needed.

Example server structure:

```
mcp-proxy/
├── servers.json           # User config (gitignored)
├── servers.example.json   # Example configuration
├── servers/               # Optional directory-based servers
│   ├── custom-server/     # Custom implementation
│   │   ├── package.json
│   │   └── src/index.ts
│   └── legacy-server/     # Legacy server setup
│       └── package.json
├── data/                  # Server data directories
│   ├── filesystem/
│   ├── memory/
│   └── repos/
└── logs/                  # Server logs
```

**servers.json** provides a cleaner approach:

```json
{
    "filesystem": {
        "command": "docker run -i --rm --mount type=bind,src=${PWD}/data/filesystem,dst=/projects mcp/filesystem"
    },
    "memory": {
        "command": "npx -y @modelcontextprotocol/server-memory",
        "env": {
            "MEMORY_FILE_PATH": "./data/memory/memory.json"
        }
    },
    "git": {
        "command": "docker run -i --rm --mount type=bind,src=${PWD}/data/repos,dst=/workspace mcp/git"
    }
}
```

### Credential Isolation

Each server maintains its own `.env` file for credentials and configuration:

```bash
servers/
├── gdrive/
│   ├── .env               # Google Drive API credentials
│   └── src/index.ts       # Server implementation
├── steam/
│   ├── .env               # Steam API credentials
│   └── src/index.ts       # Server implementation
└── database/
    ├── .env               # Database connection strings
    └── src/index.ts       # Server implementation
```

The proxy automatically passes environment variables to each server, ensuring complete isolation.

### Adding New Servers

Adding a new MCP server is as simple as creating a directory in `./servers/` or adding it to your personal configuration:

#### Method 1: Directory-Based (Traditional)

1. **Create Server Directory**:

    ```bash
    mkdir servers/my-new-server
    cd servers/my-new-server
    ```

2. **Initialize Project**:

    ```bash
    # For official MCP servers (easiest)
    echo '{"scripts":{"start":"docker run -i --rm mcp/filesystem"}}' > package.json

    # For NPX servers
    echo '{"scripts":{"start":"npx -y @modelcontextprotocol/server-memory"}}' > package.json

    # For custom servers
    pnpm create @latest/typescript-package
    ```

#### Method 2: Configuration-Based (Recommended)

1. **Create/Edit User Config**:

    ```bash
    # Create your personal server configuration (gitignored)
    cp servers.example.json servers.json
    ```

2. **Add Servers to Config**:

    ```json
    // servers.json (gitignored)
    {
        "filesystem": {
            "command": "docker run -i --rm --mount type=bind,src=${PWD}/data,dst=/projects mcp/filesystem",
            "env": {
                "CUSTOM_VAR": "value"
            }
        },
        "memory": {
            "command": "npx -y @modelcontextprotocol/server-memory"
        },
        "my-custom-server": {
            "command": "tsx ./custom-servers/my-server.ts"
        }
    }
    ```

3. **Restart MCP Proxy**: Servers are automatically discovered from both directories and configuration

**Benefits of Configuration-Based Approach**:

- No need to create multiple directories
- Easier to manage and version control your personal setup
- Clean separation between project code and user preferences
- Simple JSON configuration instead of individual `package.json` files

**That's it!** No configuration files to edit, no environment variables to manage. The proxy will automatically:

- Detect the new server on next startup
- Assign it an available port
- Make it accessible via `/my-new-server/*` routes

### Server Types and Protocol Support

The MCP Proxy supports the most common server deployment patterns in the MCP ecosystem:

#### Docker MCP Servers (Most Common)

The majority of MCP servers are distributed as Docker containers:

```json
// package.json
{
    "scripts": {
        "start": "docker run -i --rm mcp/filesystem"
    }
}
```

- Uses pre-built Docker images from the MCP ecosystem
- Automatic stdio-to-HTTP wrapping by the proxy
- No local dependencies or complex setup required
- Perfect for production deployments

#### NPX/Package Servers

Servers distributed via npm that can be run directly:

```json
// package.json
{
    "scripts": {
        "start": "npx -y @modelcontextprotocol/server-memory"
    }
}
```

- Directly executable npm packages
- Automatic dependency management
- Good for development and lightweight deployments

#### Custom HTTP Servers

Traditional web servers for custom implementations:

```json
// package.json
{
    "scripts": {
        "start": "tsx src/index.ts" // Custom HTTP server
    }
}
```

- Full control over implementation
- Direct HTTP communication
- Best for custom integrations

#### Common Docker Examples

Most servers from the official MCP ecosystem use Docker:

```bash
# Filesystem server
docker run -i --rm --mount type=bind,src=/path,dst=/projects mcp/filesystem

# Git server
docker run -i --rm --mount type=bind,src=/repo,dst=/workspace mcp/git

# Memory server
docker run -i --rm -v claude-memory:/app/dist mcp/memory

# Time server
docker run -i --rm -e LOCAL_TIMEZONE mcp/time
```

The proxy automatically detects Docker commands and handles stdio-to-HTTP adaptation.

## API Usage

### Base URL Structure

```
https://mcp.example.com/<server-name>/<endpoint>
```

### Example Requests

All servers, regardless of their underlying technology, are accessible via the same HTTP interface:

```bash
# Docker MCP servers (stdio-to-HTTP adapted)
curl https://mcp.example.com/filesystem/files
curl https://mcp.example.com/git/status

# NPX MCP servers (stdio-to-HTTP adapted)
curl https://mcp.example.com/memory/query
curl https://mcp.example.com/time/current

# Custom HTTP servers (native HTTP)
curl https://mcp.example.com/my-api/endpoint

# Health checks work for all server types
curl https://mcp.example.com/health
curl https://mcp.example.com/filesystem/health
curl https://mcp.example.com/memory/health
```

### Authentication

Authentication is handled by individual MCP servers. The conductor passes through all headers and authentication tokens.

## Development

### Project Structure

```
mcp-proxy/
├── src/
│   ├── conductor/          # Main conductor service (TypeScript)
│   ├── discovery/          # Server discovery logic
│   ├── proxy/             # Request proxying with modern HTTP/2 support
│   ├── health/            # Health monitoring with WebSockets
│   ├── types/             # Shared TypeScript type definitions
│   └── utils/             # Utility functions and helpers
├── servers/               # Optional directory-based servers
├── servers.json           # User server configuration (gitignored)
├── servers.example.json   # Example server configuration
├── data/                  # Server data directories (gitignored)
├── tests/                 # Comprehensive test suite (Vitest)
├── docker/               # Modern multi-stage Docker builds
├── dist/                 # Compiled TypeScript output
├── .env.example
├── tsconfig.json         # Strict TypeScript configuration
├── vitest.config.ts      # Modern testing framework
├── eslint.config.js      # Flat ESLint configuration
└── README.md
```

### Local Development

```bash
# Install dependencies with pnpm
pnpm install

# Start in development mode with hot reload
pnpm dev

# Run comprehensive test suite
pnpm test

# Type checking
pnpm typecheck

# Lint with modern ESLint flat config
pnpm lint

# Format with Prettier
pnpm format

# Build TypeScript to JavaScript
pnpm build
```

### Adding a New Server Type

Adding a new server is extremely simple with the configuration-based approach:

1. **Edit Configuration**: Add to `servers.json`

    ```json
    {
        "my-new-server": {
            "command": "docker run -i --rm mcp/my-server",
            "env": {
                "API_KEY": "your-key-here"
            }
        }
    }
    ```

2. **Restart Proxy**: Server is automatically discovered and added

For directory-based approach:

1. **Create Directory**: `mkdir servers/my-server`
2. **Add Implementation**: Create `package.json` and implementation files
3. **Restart Proxy**: Server is automatically discovered and added

No configuration files to edit in the main project, clean separation of concerns!

## Production Deployment

### Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
    mcp-proxy:
        build:
            context: .
            dockerfile: Dockerfile
            target: production
        ports:
            - '3000:3000'
        environment:
            - NODE_ENV=production
            - NODE_OPTIONS=--experimental-loader ts-node/esm
        env_file:
            - .env
        volumes:
            - ./servers:/app/servers:ro
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
            interval: 30s
            timeout: 10s
            retries: 3
```

### Reverse Proxy Configuration

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Security Considerations

- **Credential Isolation**: Each MCP server manages its own credentials
- **Network Isolation**: Servers run on localhost-only ports
- **Input Validation**: All requests are validated before proxying
- **Rate Limiting**: Configurable rate limiting per server
- **Audit Logging**: Comprehensive request/response logging

## Monitoring and Logging

### Health Endpoints

- `GET /health` - Overall platform health
- `GET /{server}/health` - Individual server health
- `GET /metrics` - Prometheus metrics (optional)

### Logging

The platform provides structured logging with configurable levels:

```bash
# View logs in development
pnpm logs

# Production logging with structured JSON logs
tail -f logs/conductor.log
tail -f logs/servers.log
```

## Troubleshooting

### Common Issues

**Server Not Starting**

- Check the server path in `.env`
- Verify the server's `package.json` and entry point
- Check port availability (3001-3099)

**Connection Refused**

- Ensure the target server is running
- Check firewall settings
- Verify port configuration

**Authentication Failures**

- Verify server-specific credentials in `.env`
- Check that credentials are properly passed through

### Debug Mode

```bash
DEBUG=mcp:* pnpm dev
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [MIT](https://opensource.org/licenses/MIT) file for details.

## Acknowledgements

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- MCP server implementations from the community
- Contributors and maintainers

---

**Note**: This platform is designed for self-hosted environments where you maintain full control over your data and credentials. It is not intended as a public service.
