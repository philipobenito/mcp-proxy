---
sidebar_position: 3
---

# Docker Deployment

Comprehensive guide for deploying MCP Proxy using Docker in various environments.

## Overview

MCP Proxy provides Docker configurations for different deployment scenarios:

- **Development**: Hot-reload, debugging, local development
- **Production**: Optimised builds, security hardening, scalability
- **Testing**: Isolated environments for CI/CD

## Development Deployment

### Quick Start

```bash
# Clone the repository
git clone https://github.com/philipobenito/mcp-proxy.git
cd mcp-proxy

# Start development environment
docker-compose -f docker-compose.dev.yml up --build
```

### Development Configuration

The development setup includes:

- Hot-reload for source code changes
- Debug logging enabled
- Volume mounts for local development
- All development dependencies

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
    mcp-proxy:
        build:
            context: .
            dockerfile: Dockerfile.dev
        ports:
            - '3000:3000'
        volumes:
            - ./src:/app/src
            - ./servers:/app/servers
            - /var/run/docker.sock:/var/run/docker.sock
        environment:
            - NODE_ENV=development
            - LOG_LEVEL=debug
```

## Production Deployment

### Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- Sufficient system resources (2GB RAM minimum)

### Configuration

Create your production environment file:

```bash
cp .env.docker .env.production
```

Edit `.env.production`:

```env
NODE_ENV=production
PORT=3000
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-secure-password-here

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Security
TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16

# Performance
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT=30000
```

### Production Start

```bash
# Start production services
docker-compose up -d --build

# Verify deployment
docker-compose ps
docker-compose logs -f mcp-proxy
```

## Multi-Stage Dockerfile

The production Dockerfile uses multi-stage builds for optimisation:

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/servers ./servers

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Set ownership
RUN chown -R mcp:nodejs /app
USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

## Service Configuration

### Docker Compose Production

```yaml
version: '3.8'

services:
    mcp-proxy:
        build:
            context: .
            dockerfile: Dockerfile
            target: production
        restart: unless-stopped
        ports:
            - '3000:3000'
        volumes:
            - ./data:/app/data
            - /var/run/docker.sock:/var/run/docker.sock:ro
        environment:
            - NODE_ENV=production
        env_file:
            - .env.production
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
            interval: 30s
            timeout: 10s
            retries: 3
            start_period: 40s
        deploy:
            resources:
                limits:
                    memory: 1G
                reservations:
                    memory: 512M
        logging:
            driver: 'json-file'
            options:
                max-size: '10m'
                max-file: '3'

    # Optional: Redis for caching
    redis:
        image: redis:7-alpine
        restart: unless-stopped
        volumes:
            - redis_data:/data
        command: redis-server --appendonly yes

volumes:
    redis_data:
```

## Networking

### Reverse Proxy Setup

#### Nginx

```nginx
upstream mcp_proxy {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name mcp.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://mcp_proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Traefik

```yaml
# docker-compose.yml with Traefik
version: '3.8'

services:
    mcp-proxy:
        # ... previous configuration
        labels:
            - 'traefik.enable=true'
            - 'traefik.http.routers.mcp.rule=Host(`mcp.example.com`)'
            - 'traefik.http.routers.mcp.tls=true'
            - 'traefik.http.routers.mcp.tls.certresolver=letsencrypt'
            - 'traefik.http.services.mcp.loadbalancer.server.port=3000'

networks:
    default:
        external:
            name: traefik
```

## Monitoring and Logging

### Health Monitoring

```bash
# Basic health check
curl -f http://localhost:3000/health

# Detailed server status
curl -f http://localhost:3000/health/servers

# Docker health check
docker-compose ps
```

### Log Management

#### Structured Logging

Configure structured JSON logging for production:

```env
LOG_FORMAT=json
LOG_LEVEL=info
```

#### Log Aggregation

Example with ELK stack:

```yaml
# docker-compose.logging.yml
version: '3.8'

services:
    mcp-proxy:
        # ... existing configuration
        logging:
            driver: 'fluentd'
            options:
                fluentd-address: localhost:24224
                tag: mcp.proxy

    fluentd:
        image: fluent/fluentd:v1.16-1
        volumes:
            - ./fluentd:/fluentd/etc
        ports:
            - '24224:24224'
```

## Security

### Container Security

```dockerfile
# Security hardening in Dockerfile
FROM node:22-alpine

# Update packages
RUN apk update && apk upgrade

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Remove unnecessary packages
RUN apk del --purge

# Set security options
USER mcp
```

### Secrets Management

Use Docker secrets for sensitive data:

```yaml
version: '3.8'

services:
    mcp-proxy:
        secrets:
            - basic_auth_password
        environment:
            - BASIC_AUTH_PASSWORD_FILE=/run/secrets/basic_auth_password

secrets:
    basic_auth_password:
        file: ./secrets/basic_auth_password.txt
```

## Scaling

### Horizontal Scaling

```yaml
version: '3.8'

services:
    mcp-proxy:
        # ... existing configuration
        deploy:
            replicas: 3
            update_config:
                parallelism: 1
                delay: 10s
            restart_policy:
                condition: on-failure

    load-balancer:
        image: nginx:alpine
        ports:
            - '80:80'
        volumes:
            - ./nginx.conf:/etc/nginx/nginx.conf
        depends_on:
            - mcp-proxy
```

### Resource Limits

```yaml
services:
    mcp-proxy:
        deploy:
            resources:
                limits:
                    cpus: '1.0'
                    memory: 1G
                reservations:
                    cpus: '0.5'
                    memory: 512M
```

## Troubleshooting

### Common Issues

#### Port Conflicts

```bash
# Check port usage
netstat -tulpn | grep 3000

# Stop conflicting services
docker-compose down
```

#### Permission Issues

```bash
# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Or add user to docker group
sudo usermod -aG docker $USER
```

#### Container Startup Issues

```bash
# View container logs
docker-compose logs mcp-proxy

# Inspect container
docker-compose exec mcp-proxy sh

# Check container resources
docker stats
```

### Debug Mode

Enable debug mode for troubleshooting:

```env
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=mcp:*
```

## Backup and Recovery

### Data Backup

```bash
# Backup data directory
tar -czf mcp-proxy-backup-$(date +%Y%m%d).tar.gz data/

# Backup configuration
cp servers.json servers.json.backup
cp .env.production .env.production.backup
```

### Recovery

```bash
# Restore data
tar -xzf mcp-proxy-backup-20240101.tar.gz

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```
