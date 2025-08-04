---
sidebar_position: 3
---

# Running MCP Proxy

## Docker Deployment

### Development Mode

```bash
# Start development environment
pnpm docker:dev
# or
docker compose -f docker-compose.dev.yml up

# View logs
pnpm docker:logs
# or
docker compose logs -f mcp-proxy
```

### Production Mode

```bash
# Start production environment
pnpm docker:prod
# or
docker compose up -d

# View logs
docker compose logs -f mcp-proxy

# Stop services
pnpm docker:stop
# or
docker compose down
```

## Local Deployment

### Production Mode

```bash
# Build the project
pnpm build

# Start the proxy
pnpm start
```

### Development Mode

```bash
# Start with auto-reload
pnpm dev
```

## Accessing Your Proxy

Once running, the MCP Proxy will be available at:

- **Main interface**: `http://localhost:3000`
- **Health check**: `http://localhost:3000/health`
- **Server routes**: `http://localhost:3000/{server-name}/*`

## Monitoring

### Health Checks

The proxy provides health monitoring endpoints:

- `GET /health` - Overall proxy health
- `GET /health/servers` - Individual server health status

### Logs

#### Docker Logs

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f mcp-proxy

# Follow logs from specific time
docker compose logs -f --since "2024-01-01T00:00:00Z"
```

#### Local Logs

When running locally, logs are output to the console with structured JSON logging for production environments.

## Process Management

### Docker

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Restart services
docker compose restart

# View running containers
docker compose ps
```

### Local

The proxy automatically manages MCP server processes. When you stop the main proxy, all child server processes are gracefully terminated.

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000-3099 are available
2. **Docker permissions**: Ensure Docker daemon is running and accessible
3. **Server startup failures**: Check individual server logs for configuration issues

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

### Server Status

Check which servers are running:

```bash
# Via health endpoint
curl http://localhost:3000/health/servers

# Via Docker
docker compose ps

# Via process list (local)
ps aux | grep mcp
```
