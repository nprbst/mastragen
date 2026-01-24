# Docker Compose Deployment Guide

This guide covers deploying Mastragen using Docker Compose for development and small-scale deployments.

## Prerequisites

- Docker 24.0+
- Docker Compose 2.20+
- Tailscale account
- GitHub App configured

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/mastragen.git
cd mastragen

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start services
docker-compose up -d
```

## Configuration

### Environment File

Create `.env` in the project root:

```bash
# Mastragen Configuration
MASTRAGEN_ENV=development
HOST=0.0.0.0
PORT=4000

# GitHub App
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY_PATH=/app/secrets/github-private-key.pem
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Tailscale
TAILSCALE_AUTHKEY=tskey-auth-XXXXXXXX
TAILSCALE_TAILNET=your-tailnet

# Database
DATABASE_PATH=/app/data/mastragen.db
```

### Docker Compose File

The default `docker-compose.yml`:

```yaml
version: "3.8"

services:
  orchestrator:
    build:
      context: ./orchestrator
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      - HOST=0.0.0.0
      - PORT=4000
      - DATABASE_PATH=/app/data/mastragen.db
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_PRIVATE_KEY_PATH=/app/secrets/github-private-key.pem
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
    volumes:
      - orchestrator-data:/app/data
      - ./secrets:/app/secrets:ro
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - tailscale

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    environment:
      - PUBLIC_API_URL=http://orchestrator:4000
    depends_on:
      - orchestrator

  tailscale:
    image: tailscale/tailscale:latest
    hostname: mastragen-${MASTRAGEN_ENV}
    environment:
      - TS_AUTHKEY=${TAILSCALE_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - tailscale-state:/var/lib/tailscale
    cap_add:
      - NET_ADMIN
    network_mode: host

volumes:
  orchestrator-data:
  tailscale-state:
```

## Step-by-Step Setup

### 1. Configure GitHub App

Create a GitHub App and save the credentials:

```bash
mkdir -p secrets
# Save your private key as secrets/github-private-key.pem
```

### 2. Configure Tailscale

1. Create an auth key at [Tailscale Admin](https://login.tailscale.com/admin/settings/keys)
2. Add to your `.env` file

### 3. Build and Start

```bash
# Build images
docker-compose build

# Start in background
docker-compose up -d

# Check logs
docker-compose logs -f orchestrator
```

### 4. Verify Deployment

```bash
# Check service health
curl http://localhost:4000/health

# Check Tailscale
docker-compose exec tailscale tailscale status
```

## Development Mode

For local development with hot-reload:

```yaml
# docker-compose.override.yml
version: "3.8"

services:
  orchestrator:
    build:
      target: development
    volumes:
      - ./orchestrator/src:/app/src:ro
    command: ["bun", "run", "dev"]

  web:
    build:
      target: development
    volumes:
      - ./web/src:/app/src:ro
    command: ["bun", "run", "dev"]
```

Then run:

```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml up
```

## Production Considerations

### Using External Database

For production, use PostgreSQL instead of SQLite:

```yaml
services:
  orchestrator:
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/mastragen

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=mastragen
      - POSTGRES_PASSWORD=your-secure-password
      - POSTGRES_DB=mastragen
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

### Reverse Proxy (without Tailscale)

If not using Tailscale for public access:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - orchestrator
      - web
```

### Resource Limits

```yaml
services:
  orchestrator:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Managing Services

### Start/Stop

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f orchestrator
```

### Update Images

```bash
# Pull latest images
docker-compose pull

# Rebuild and restart
docker-compose up -d --build
```

### Run Migrations

```bash
docker-compose exec orchestrator bun run db:migrate
```

## Troubleshooting

### Container Won't Start

```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs orchestrator

# Check for port conflicts
netstat -tulpn | grep 4000
```

### Tailscale Issues

```bash
# Check Tailscale status
docker-compose exec tailscale tailscale status

# Restart Tailscale
docker-compose restart tailscale
```

### Database Issues

```bash
# Check database file
docker-compose exec orchestrator ls -la /app/data/

# Reset database (development only!)
docker-compose down -v
docker-compose up -d
```

## Backup and Restore

### Backup

```bash
# Backup database
docker-compose exec orchestrator cp /app/data/mastragen.db /app/data/mastragen.db.backup

# Copy to host
docker cp mastragen-orchestrator-1:/app/data/mastragen.db ./backup/
```

### Restore

```bash
# Copy backup to container
docker cp ./backup/mastragen.db mastragen-orchestrator-1:/app/data/

# Restart to apply
docker-compose restart orchestrator
```
