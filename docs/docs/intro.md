---
sidebar_position: 1
---

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

## Getting Started

Choose your path based on your experience level:

- **[Installation Guide](./getting-started/installation)** - Get up and running in 5 minutes
- **[Configuration Guide](./getting-started/configuration)** - Set up your MCP servers
- **[API Reference](./api/http-api)** - Detailed API documentation
