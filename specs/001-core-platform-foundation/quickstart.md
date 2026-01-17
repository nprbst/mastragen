# Quickstart: Phase 1 Development Setup

## Prerequisites

- **Bun**: v1.0+ (runtime for TypeScript)
- **Docker**: v24+ with Docker Compose v2
- **Node.js**: v20+ (for some container images)

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### Verify Docker

```bash
docker --version    # Should be 24+
docker compose version  # Should be v2+
```

## Quick Start

### 1. Clone and Install

```bash
git clone git@github.com:nprbst/mastragen-001-core-platform-foundation.git
cd mastragen-001-core-platform-foundation
bun install
```

### 2. Start the Platform

```bash
docker compose up -d
```

This starts:
- **Orchestrator API** on `http://localhost:3000`

### 3. Create a Session

```bash
# Seed a test project first (one-time setup)
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-project",
    "githubRepo": "local/test",
    "mastraPath": ".",
    "uiSandboxPath": null
  }'

# Create environment
curl -X POST http://localhost:3000/projects/test-project/environments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev",
    "envVars": {}
  }'

# Create session
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project",
    "artifactName": "my-feature",
    "environment": "dev"
  }'
```

### 4. Access Services

After session creation, access:

| Service | URL | Description |
|---------|-----|-------------|
| Orchestrator | http://localhost:3000 | API for session management |
| cui | http://localhost:3001 | Claude chat interface |
| Mastra | http://localhost:4111 | Tool/agent testing studio |
| VS Code | http://localhost:8080 | Full IDE |
| Astro | http://localhost:4321 | UI sandbox (if configured) |

## Development Workflow

### Running Tests

```bash
# Unit tests
cd orchestrator && bun test

# Integration tests (requires Docker)
bun test:integration

# Watch mode
bun test --watch
```

### Project Structure

```
mastragen-001-core-platform-foundation/
├── orchestrator/           # Hono API service
│   ├── src/
│   │   ├── index.ts       # App entry point
│   │   ├── db/            # Database (Kysely + SQLite)
│   │   ├── repositories/  # Data access layer
│   │   ├── services/      # Business logic
│   │   └── routes/        # API routes
│   └── tests/
├── sandbox/               # Container images
│   ├── cui/
│   ├── mastra/
│   ├── astro/
│   └── code-server/
├── fixtures/              # Test fixtures
│   └── test-project/
├── docker-compose.yml
└── specs/                 # Feature specifications
```

### Common Tasks

#### Rebuild containers after changes

```bash
docker compose build
docker compose up -d
```

#### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f orchestrator
```

#### Reset database

```bash
rm -f data/mastragen.db
docker compose restart orchestrator
```

#### Stop everything

```bash
docker compose down
```

## Environment Variables

Create a `.env` file for local development:

```bash
# GitHub (required for private repos)
GITHUB_TOKEN=ghp_...

# Claude API (choose one)
ANTHROPIC_API_KEY=sk-ant-...

# OR AWS Bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## Troubleshooting

### Port conflicts

If ports are already in use:

```bash
# Check what's using a port
lsof -i :3000

# Or use different ports in docker-compose.override.yml
```

### Container not starting

```bash
# Check container logs
docker logs mastragen-orchestrator-1

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### Database issues

```bash
# Reset database
rm -f data/mastragen.db
docker compose restart orchestrator
```
