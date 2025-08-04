---
sidebar_position: 1
---

# Installation

## Prerequisites

Before installing MCP Proxy, ensure you have the following installed:

- **Node.js 22 or higher** (latest LTS recommended)
- **TypeScript 5.6+** (for type safety and modern language features)
- **pnpm** (fast, disk space efficient package manager)
- **Git** (for managing MCP server repositories)
- **Docker and Docker Compose V2** (for containerised deployment)

## Installation Options

### Option 1: Docker (Recommended)

The easiest way to get started with MCP Proxy is using Docker:

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

### Option 2: Local Installation

For development or custom deployments:

```bash
git clone https://github.com/philipobenito/mcp-proxy.git
cd mcp-proxy
pnpm install
pnpm setup
```

## Next Steps

After installation, you'll need to:

1. [Configure your environment](./configuration)
2. [Set up your MCP servers](./configuration#server-configuration)
3. [Start the proxy](./running)

## Verification

Once installed, verify your installation by checking the version:

```bash
# For Docker installation
docker-compose exec mcp-proxy node --version

# For local installation
node --version
pnpm --version
```

Both should return version 22 or higher for Node.js and 9 or higher for pnpm.
