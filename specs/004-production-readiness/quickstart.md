# Quickstart: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Created**: 2026-01-21

## Prerequisites

- **Bun**: v1.0.0+ (this is a Bun project, NOT npm/yarn)
- **Docker**: For local container orchestration
- **Docker Compose**: For running the full stack
- **Node.js**: v20+ (for compatibility with some tools)
- **Git**: For version control

## Repository Structure

```
mastragen-004-production-readiness/
├── web/                    # Astro + React frontend (port 3000)
├── orchestrator/           # Hono API backend (port 4000)
├── sandbox/                # Docker container definitions
├── cli/                    # Command-line interface
├── specs/                  # Feature specifications
│   └── 004-production-readiness/
│       ├── spec.md         # Feature specification
│       ├── plan.md         # Implementation plan
│       ├── research.md     # Research findings
│       ├── data-model.md   # Data model changes
│       ├── quickstart.md   # This file
│       └── contracts/      # API contracts
└── docs/                   # Documentation (created in this phase)
```

## Installation

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repo-url>
cd mastragen-004-production-readiness

# Install orchestrator dependencies
cd orchestrator && bun install

# Install web dependencies
cd ../web && bun install

# Return to root
cd ..
```

### 2. Environment Setup

Create `.env` files for each service:

**orchestrator/.env**:
```env
# Database
DATABASE_PATH=./data/mastragen.db

# Server
PORT=4000
HOST=0.0.0.0

# Authentication
JWT_SECRET=your-jwt-secret-here

# GitHub App
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_CLIENT_ID=your-client-id
GITHUB_APP_CLIENT_SECRET=your-client-secret
GITHUB_REDIRECT_URI=http://localhost:4000/api/auth/callback

# External APIs
ANTHROPIC_API_KEY=your-anthropic-key

# Tailscale (for session isolation)
TAILSCALE_AUTH_KEY=tskey-auth-xxx
```

**web/.env**:
```env
PUBLIC_API_URL=http://localhost:4000
```

### 3. Database Setup

```bash
cd orchestrator

# Run migrations
bun run db:migrate

# (Optional) Seed with test data
bun run db:seed
```

## Development Commands

### Orchestrator (Backend)

```bash
cd orchestrator

# Start development server with hot reload
bun run dev

# Run tests
bun test

# Run specific test suite
bun test tests/unit
bun test tests/integration

# Type check
bun run typecheck

# Build for production
bun run build
```

### Web (Frontend)

```bash
cd web

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

### Full Stack (Docker Compose)

```bash
# Start all services
docker-compose up

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Phase 4 Specific Development

### Working on Idle Auto-Suspend

Key files:
- `orchestrator/src/jobs/idle-suspend.ts` - Background job (to create)
- `orchestrator/src/services/session-service.ts` - Session operations
- `orchestrator/src/db/schema.ts` - Database schema

Test the idle detection:
```bash
cd orchestrator
bun test tests/unit/jobs/idle-suspend.test.ts
```

### Working on Monitoring

Key files:
- `orchestrator/src/services/metrics-service.ts` - Metrics collection (to create)
- `orchestrator/src/routes/metrics.ts` - Metrics endpoint (to create)

Test metrics endpoint:
```bash
# Start the server
cd orchestrator && bun run dev

# In another terminal
curl http://localhost:4000/metrics
```

### Working on Alerting

Key files:
- `orchestrator/src/services/alert-service.ts` - Alert logic (to create)
- `orchestrator/src/routes/alerts.ts` - Alert API (to create)
- `orchestrator/src/jobs/alert-checker.ts` - Alert condition checker (to create)

Test alerts:
```bash
cd orchestrator
bun test tests/unit/services/alert-service.test.ts
bun test tests/integration/alerts.test.ts
```

### Working on Kubernetes Deployment

Key files:
- `helm/mastragen/` - Helm chart directory (to create)
- `helm/mastragen/values.yaml` - Default values
- `.github/workflows/docker-publish.yml` - CI for image builds (to create)

Test Helm chart locally:
```bash
# Start minikube
minikube start

# Build local images
docker build -t mastragen-orchestrator:local ./orchestrator
docker build -t mastragen-sandbox:local ./sandbox

# Load images into minikube
minikube image load mastragen-orchestrator:local
minikube image load mastragen-sandbox:local

# Install chart
helm install mastragen ./helm/mastragen -f ./helm/mastragen/values/development.yaml

# Verify
kubectl get pods -n mastragen
```

## Testing Strategy

### Unit Tests
```bash
cd orchestrator
bun test tests/unit
```

### Integration Tests
```bash
cd orchestrator
bun test tests/integration
```

### End-to-End Tests
```bash
cd orchestrator
bun test tests/e2e
```

### Test Coverage
```bash
cd orchestrator
bun test --coverage
```

## Common Tasks

### Add a Database Migration

```bash
cd orchestrator
# Create migration file manually in src/db/migrations/
# File naming: XXX_description.ts (e.g., 006_add_suspension_reason.ts)
```

### Run Linting

```bash
cd orchestrator && bun run lint
cd web && bun run lint
```

### Format Code

```bash
cd orchestrator && bun run format
cd web && bun run format
```

## Troubleshooting

### Database Issues

```bash
# Reset database (development only!)
cd orchestrator
rm -rf data/mastragen.db
bun run db:migrate
bun run db:seed
```

### Docker Issues

```bash
# Clean up containers
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Check container logs
docker-compose logs orchestrator
docker-compose logs web
```

### Port Conflicts

Default ports:
- Web: 3000
- Orchestrator: 4000
- Sandbox services: 3001, 4111, 4321, 8080

Check for conflicts:
```bash
lsof -i :3000
lsof -i :4000
```

## References

- [Spec](./spec.md) - Feature specification
- [Research](./research.md) - Technology decisions
- [Data Model](./data-model.md) - Database schema changes
- [Constitution](../../.speck/memory/constitution.md) - Project principles
