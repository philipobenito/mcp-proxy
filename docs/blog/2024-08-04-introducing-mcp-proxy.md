---
slug: introducing-mcp-proxy
title: Introducing MCP Proxy
authors: [admin]
tags: [mcp, proxy, self-hosted, ai]
---

# Introducing MCP Proxy: Self-Hosted MCP Server Orchestration

We're excited to introduce **MCP Proxy**, a self-hosted conductor service that orchestrates and exposes multiple Model Context Protocol (MCP) servers through a unified HTTP interface.

## The Problem

As AI tools and platforms increasingly adopt the Model Context Protocol, developers face several challenges:

- **Network Access Requirements**: Many AI platforms require network-accessible MCP endpoints rather than local implementations
- **Credential Security**: Sharing API keys with third-party MCP hosting services compromises security
- **Management Complexity**: Running multiple standalone MCP servers becomes unwieldy
- **Development Friction**: Setting up and testing MCP integrations is time-consuming

## Our Solution

MCP Proxy addresses these challenges by providing:

### 🔒 **Complete Credential Control**
Keep your API keys, credentials, and sensitive data under your control. No need to share secrets with third-party services.

### 🌐 **Network-Accessible Endpoints**
Expose your local MCP servers over HTTP, making them compatible with Gemini Gems, Claude Projects, and other AI platforms.

### 🔧 **Zero-Config Discovery**
Automatically discovers and configures MCP servers through simple JSON configuration or directory scanning.

### 🐳 **Docker-First Architecture**
Built for modern containerised deployments with multi-stage builds and production-ready configurations.

### 🚀 **Modern Technology Stack**
- Node.js 22+ with native ES modules
- TypeScript 5.6+ with strict type safety
- Vitest for next-generation testing
- pnpm for efficient package management

## Getting Started

Installation is straightforward with Docker:

```bash
git clone https://github.com/philipobenito/mcp-proxy.git
cd mcp-proxy
docker-compose up -d --build
```

Configure your servers in `servers.json`:

```json
{
    "filesystem": {
        "command": "docker run -i --rm mcp/filesystem",
        "description": "File system operations"
    },
    "memory": {
        "command": "npx -y @modelcontextprotocol/server-memory",
        "env": {
            "MEMORY_FILE_PATH": "./data/memory.json"
        }
    }
}
```

Your servers are now available at:
- `http://localhost:3000/filesystem/*`
- `http://localhost:3000/memory/*`

## Architecture

MCP Proxy acts as a front controller, automatically:

1. **Discovering** MCP servers from configuration
2. **Assigning** isolated ports (3001-3099)
3. **Bridging** stdio servers to HTTP
4. **Routing** requests to appropriate servers
5. **Monitoring** server health and performance

```
┌─────────────────────────────────────────┐
│           MCP Proxy                     │
│              (Port 3000)                │
├─────────────────────────────────────────┤
│  /filesystem  →  MCP Server (3001)      │
│  /memory      →  MCP Server (3002)      │
│  /custom      →  MCP Server (3003)      │
└─────────────────────────────────────────┘
```

## Use Cases

**AI Platform Integration**: Connect Gemini Gems, Claude Projects, and other AI tools to your self-hosted MCP servers.

**Development & Testing**: Rapidly prototype and test MCP integrations without complex setup.

**Production Deployments**: Run production-ready MCP infrastructure with proper logging, monitoring, and scalability.

**Learning & Experimentation**: Understand MCP architecture and build custom integrations.

## What's Next?

We're actively developing MCP Proxy with exciting features planned:

- Enhanced monitoring and metrics
- Automatic server scaling
- Advanced routing capabilities
- Plugin ecosystem
- Performance optimisations

## Get Involved

- **Documentation**: [View the docs](https://philipobenito.github.io/mcp-proxy/)
- **Source Code**: [GitHub Repository](https://github.com/philipobenito/mcp-proxy)
- **Issues & Feature Requests**: [GitHub Issues](https://github.com/philipobenito/mcp-proxy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/philipobenito/mcp-proxy/discussions)

MCP Proxy represents our commitment to developer-friendly, self-hosted AI infrastructure. We believe you should maintain complete control over your data, credentials, and AI integrations.

Try MCP Proxy today and experience the simplicity of unified MCP server management!
