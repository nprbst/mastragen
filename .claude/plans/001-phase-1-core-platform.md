# Phase 1: Core Platform Foundation - Implementation Plan

## Overview

Get a single Mastragen sandbox running locally with all four services (cui, Mastra, Astro, VS Code), database schema, orchestrator API, container images, and Docker Compose for local development.

## Project Structure

```
mastragen/
├── package.json                    # Root workspace config (bun workspaces)
├── tsconfig.json                   # Base TypeScript config
├── docker-compose.yml              # Local development setup
├── docker-compose.override.yml     # Local overrides
│
├── orchestrator/                   # Hono API service
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Hono app entry
│   │   ├── routes/
│   │   │   ├── sessions.ts        # Session CRUD endpoints
│   │   │   └── health.ts          # Health check
│   │   ├── db/
│   │   │   ├── types.ts           # Kysely type definitions
│   │   │   ├── index.ts           # Database connection
│   │   │   └── migrations/
│   │   │       └── 001_initial.ts # Initial schema
│   │   ├── repositories/
│   │   │   ├── projects.ts        # Project data access
│   │   │   └── sessions.ts        # Session data access
│   │   └── services/
│   │       └── sandbox.ts         # Docker container management
│   └── tests/
│       ├── db.test.ts
│       ├── sessions.test.ts
│       └── sandbox.test.ts
│
├── sandbox/                        # Container images
│   ├── Dockerfile                  # Main sandbox image (cui + scripts)
│   ├── scripts/
│   │   ├── entrypoint.sh          # cui startup
│   │   └── suspend.sh             # Commit and save state
│   └── code-server/
│       ├── Dockerfile             # Lazy-start VS Code
│       └── lazy-start.sh          # Wrapper script
│
└── docs/                           # Architecture docs (existing)
```

## Implementation Order (TDD)

### Step 1: Database Schema + Repositories
**Files to create:**
- `orchestrator/package.json` - dependencies: hono, kysely, better-sqlite3, nanoid
- `orchestrator/src/db/types.ts` - Kysely type definitions
- `orchestrator/src/db/index.ts` - SQLite connection
- `orchestrator/src/db/migrations/001_initial.ts` - Schema migration
- `orchestrator/src/repositories/projects.ts`
- `orchestrator/src/repositories/sessions.ts`
- `orchestrator/tests/db.test.ts`
- `orchestrator/tests/repositories/*.test.ts`

**Tables (Phase 1 minimal):**
- `projects` - id, name, github_repo, default_branch, branch_prefix, mastra_path, ui_sandbox_path
- `project_environments` - id, project_id, name, env_vars (JSON)
- `sessions` - id, project_id, user_id, artifact_name, branch_name, state, environment, container_id

### Step 2: Orchestrator API
**Files to create:**
- `orchestrator/src/index.ts` - Hono app
- `orchestrator/src/routes/sessions.ts`
- `orchestrator/src/routes/health.ts`
- `orchestrator/tests/routes/*.test.ts`

**Endpoints:**
```
POST /sessions              - Create session, start sandbox
GET  /sessions              - List user's sessions (filter by state)
GET  /sessions/:id          - Get session details
POST /sessions/:id/suspend  - Suspend session
POST /sessions/:id/resume   - Resume session
GET  /health                - Health check
```

### Step 3: Sandbox Container Images
**Files to create:**
- `sandbox/Dockerfile` - Base image with bun, cui-server, git
- `sandbox/scripts/entrypoint.sh` - Start cui, configure environment
- `sandbox/scripts/suspend.sh` - Commit state to git
- `sandbox/code-server/Dockerfile` - Lazy-start VS Code
- `sandbox/code-server/lazy-start.sh`

**Services per sandbox:**
| Port | Service | Description |
|------|---------|-------------|
| 3001 | cui | Claude chat interface via cui-server |
| 4111 | Mastra | `bun run mastra dev` |
| 4321 | Astro | UI sandbox (optional) |
| 8080 | VS Code | code-server (lazy-start) |

### Step 4: Docker Compose
**Files to create:**
- `docker-compose.yml` - orchestrator + sandbox services
- `docker-compose.override.yml` - local secrets, volumes

**Services (separate containers per service):**
```yaml
services:
  orchestrator:     # Hono API on :3000
  cui:              # cui-server on :3001
  mastra:           # bun run mastra dev on :4111
  astro:            # Optional UI sandbox on :4321
  code-server:      # Lazy-start VS Code on :8080
```

All sandbox services share a `/workspace` volume for file synchronization.

### Step 5: Sandbox Orchestration Service
**Files to create:**
- `orchestrator/src/services/sandbox.ts` - Docker container lifecycle
- `orchestrator/tests/sandbox.test.ts`

### Step 6: E2E Tests + Polish
- Full session lifecycle tests
- Success criteria validation
- Documentation updates

## What's Deferred to Later Phases

| Component | Phase | Reason |
|-----------|-------|--------|
| Kubernetes templates | 2 | Docker Compose sufficient for local dev |
| Git branch creation | 2 | Local git only for Phase 1 |
| Tailscale networking | 2 | Localhost for local dev |
| GitHub App integration | 2 | Not needed for local dev |
| Landing page UI | 3 | API-first approach |
| cui config injection | 3 | Default config for Phase 1 |
| Custom commands/skills | 3 | Built-in functionality first |
| Session sharing | 4 | Single-user local dev first |
| Auth/JWT | 2 | Can skip for local dev |

## Success Criteria (from spec)

- [ ] Session creation responds within 90 seconds with sandbox URLs
- [ ] All four services start and respond to health checks
- [ ] File changes in one service visible in others within 5 seconds
- [ ] Suspended session can resume with work intact
- [ ] Platform runs on standard dev machine (16GB RAM, 4 cores)

## Key Technical Decisions

1. **Runtime**: bun for all TypeScript (faster than node)
2. **Database**: SQLite with Kysely (simplicity first, PostgreSQL migration path)
3. **API Framework**: Hono (lightweight, TypeScript-native)
4. **Container Management**: Docker SDK (dockerode) for local dev
5. **cui Interface**: cui-server package (`npx cui-server`)

## Critical Reference Files

- [mastragen-architecture-v4.md](docs/mastragen-architecture-v4.md) - API specs, container configs
- [spec.md](specs/001-core-platform-foundation/spec.md) - User stories, acceptance criteria
- [constitution.md](.speck/memory/constitution.md) - Governance principles

## Architectural Decisions (Confirmed)

1. **Authentication**: Skip auth for Phase 1 local dev - add in Phase 2
2. **Container Architecture**: Separate containers per service (cui, mastra, astro, code-server) - closer to K8s architecture
3. **Test Fixtures**: Both - minimal test fixture in repo for CI, plus reference example project for manual testing
4. **Claude API**: Configurable - support both `ANTHROPIC_API_KEY` (direct) and AWS Bedrock via environment variables

## Verification Plan

### Unit Tests
```bash
cd orchestrator && bun test
```
- Database migrations create all tables
- Repositories CRUD operations work correctly
- API routes return correct responses

### Integration Tests
```bash
# Build and test containers
docker compose build
docker compose up -d
bun test:integration
```
- Orchestrator connects to SQLite
- Session creation starts containers
- Health endpoints respond

### End-to-End Verification
```bash
# Start the platform
docker compose up -d

# 1. Create a session
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"projectId": "test", "artifactName": "my-feature", "environment": "dev"}'

# 2. Verify services are accessible
curl http://localhost:3001/  # cui
curl http://localhost:4111/  # Mastra
curl http://localhost:4321/  # Astro (if configured)
curl http://localhost:8080/  # VS Code

# 3. Test file synchronization
# Create file via cui, verify visible in Mastra within 5 seconds

# 4. Test suspend/resume
curl -X POST http://localhost:3000/sessions/{id}/suspend
curl -X POST http://localhost:3000/sessions/{id}/resume
```

### Success Criteria Checklist
- [ ] Session creation < 90 seconds
- [ ] All 4 services respond to health checks
- [ ] File changes sync within 5 seconds
- [ ] Suspend/resume preserves work
- [ ] Memory usage < 8GB total (fits on 16GB machine)
