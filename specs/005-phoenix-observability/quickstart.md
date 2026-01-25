# Quickstart: Phoenix Observability Development

**Feature**: 005-phoenix-observability
**Created**: 2026-01-23

## Prerequisites

- Bun runtime installed (`bun --version`)
- Docker and Docker Compose (`docker compose version`)
- Mastragen repository cloned and dependencies installed

## Quick Setup

### 1. Start Phoenix with Docker Compose

```bash
# Start Mastragen services with Phoenix profile
docker compose --profile phoenix up -d

# Verify Phoenix is running
curl http://localhost:6006/health
# Should return: {"status":"ok"}

# Access Phoenix UI
open http://localhost:6006
```

### 2. Enable Phoenix for a Project Environment

```bash
# Via API (adjust project/environment IDs)
curl -X PATCH http://localhost:4000/api/projects/{projectId}/environments/{envName} \
  -H "Content-Type: application/json" \
  -d '{"phoenix_enabled": true}'
```

Or directly in SQLite:

```bash
cd orchestrator
bun run db:studio
# Update project_environments set phoenix_enabled = 1 where name = 'development'
```

### 3. Create a Session with Phoenix

```bash
# Create session for Phoenix-enabled environment
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "environment": "development",
    "artifactName": "test-with-phoenix"
  }'
```

Verify Phoenix container started:

```bash
docker ps | grep phoenix
```

### 4. Verify Traces

1. Open Phoenix UI at http://localhost:6006
2. Trigger a Mastra agent call (via Studio or HTTP)
3. Traces should appear within 30 seconds

---

## Project Structure

```
orchestrator/
├── src/
│   ├── db/
│   │   └── migrations/
│   │       └── 010_add_phoenix_config.ts  # Database migration
│   ├── services/
│   │   ├── sandbox.ts           # Docker container orchestration
│   │   └── k8s-sandbox.ts       # Kubernetes pod management
│   └── repositories/
│       └── projects.ts          # Phoenix config queries
└── k8s/phoenix/                 # Kubernetes manifests
    ├── deployment.yaml
    ├── service.yaml
    └── pvc.yaml

sandbox/
└── mastra/
    └── entrypoint.sh            # Telemetry configuration

experiments/                     # Experiment framework (template)
├── package.json
├── lib/
│   ├── mastra.ts                # Mastra HTTP client
│   ├── runner.ts                # Experiment orchestration
│   └── types.ts                 # Type definitions
├── tasks/                       # Task implementations
├── evaluators/                  # Evaluator implementations
├── personas/                    # Persona definitions
└── cli.ts                       # CLI entry point
```

---

## Development Commands

### Orchestrator

```bash
cd orchestrator

# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Start development server
bun run dev

# Run tests
bun test

# Run Phoenix-specific tests
bun test --grep phoenix
```

### Docker Compose

```bash
# Start all services with Phoenix
docker compose --profile phoenix up -d

# View Phoenix logs
docker compose logs phoenix

# Stop all services
docker compose down

# Rebuild and restart Phoenix
docker compose --profile phoenix up -d --build phoenix
```

### Experiment Framework

```bash
cd experiments

# Install dependencies
bun install

# List datasets
bun run cli.ts --list-datasets

# List available tasks
bun run cli.ts --list-tasks

# Run experiment
bun run cli.ts \
  --dataset "test-cases" \
  --task "example-workflow" \
  --name "my-experiment"

# View experiment results
bun run cli.ts --results <experiment-id>

# Generate synthetic data
bun run cli.ts generate-synthetic \
  --personas ./personas/test.ts \
  --artifact ../src/mastra/agents/test.ts \
  --name "synthetic-v1" \
  --count 50

# Run error analysis
bun run cli.ts analyze-errors \
  --experiment <experiment-id> \
  --output ./analysis/errors.md

# Export handoff package
bun run cli.ts export-handoff \
  --experiment <experiment-id> \
  --output ./handoff
```

---

## Common Tasks

### View Phoenix Container Logs

```bash
# Docker Compose
docker compose logs -f phoenix

# Kubernetes
kubectl logs -f deployment/phoenix -n mastragen-<workspace-id>
```

### Access Phoenix SQLite Database

```bash
# Docker: exec into container
docker compose exec phoenix sh
sqlite3 /data/phoenix/phoenix.db ".tables"

# View recent traces
sqlite3 /data/phoenix/phoenix.db "SELECT * FROM traces ORDER BY created_at DESC LIMIT 5"
```

### Reset Phoenix Data

```bash
# Docker: Remove volume
docker compose down
docker volume rm mastragen_phoenix-data
docker compose --profile phoenix up -d

# The database will be recreated on startup
```

### Test Telemetry Connection

```bash
# From Mastra container, send test trace
docker compose exec mastra curl -X POST http://phoenix:6006/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Check Environment Variables in Mastra

```bash
docker compose exec mastra env | grep PHOENIX
# Expected output:
# PHOENIX_ENABLED=true
# PHOENIX_ENDPOINT=http://phoenix:6006/v1/traces
# PHOENIX_PROJECT_NAME=mastragen-experiments
```

---

## Troubleshooting

### Phoenix Container Won't Start

```bash
# Check Docker logs
docker compose logs phoenix

# Common issues:
# - Port 6006 already in use: stop conflicting service
# - SQLite permission error: check volume mount
```

### No Traces Appearing

1. Verify `PHOENIX_ENABLED=true` in Mastra container
2. Check Mastra is running via `mastra dev` (not direct script)
3. Verify network connectivity: `docker compose exec mastra curl http://phoenix:6006/health`
4. Check Phoenix logs for ingestion errors

### Experiment CLI Errors

```bash
# "Dataset not found"
bun run cli.ts --list-datasets  # Verify dataset exists

# "Mastra workflow error"
curl http://localhost:4111/health  # Verify Mastra is running

# "Anthropic API error" (synthetic generation)
echo $ANTHROPIC_API_KEY  # Verify API key is set
```

### Kubernetes Pod Issues

```bash
# Check pod status
kubectl get pods -n mastragen-<workspace-id>

# Describe pod for events
kubectl describe pod phoenix-xxx -n mastragen-<workspace-id>

# Check PVC is bound
kubectl get pvc phoenix-data -n mastragen-<workspace-id>
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PHOENIX_ENABLED` | `false` | Master switch for Phoenix |
| `PHOENIX_ENDPOINT` | `http://phoenix:6006/v1/traces` | Trace collector URL |
| `PHOENIX_PROJECT_NAME` | `mastragen-experiments` | Project name in Phoenix |
| `PHOENIX_API_KEY` | - | Optional auth key |
| `MASTRA_URL` | `http://mastra:4111` | Mastra HTTP API |
| `ANTHROPIC_API_KEY` | - | For synthetic generation |

---

## Related Documentation

- [Feature Spec](./spec.md)
- [Implementation Plan](./plan.md)
- [Research Findings](./research.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/)
- [Tech Spec](../../docs/phoenix-mastragen-spec.md)
