# Research: Phase 1 Core Platform Foundation

**Created**: 2026-01-17
**Status**: Resolved

## Technical Decisions

### 1. cui-server Package

**Decision**: Use cui-server (npx cui-server) from github.com/wbopan/cui

**Rationale**:
- Provides web UI for Claude Code agents
- Runs on port 3001
- Works with Claude Code configurations in `~/.claude/`
- Supports resume from history

**Confirmation**: Nathan confirmed cui-server and wbopan/cui are the same package.

### 2. Mastra Dev Server

**Decision**: Use `bun mastra dev` which runs on port 4111

**Rationale**:
- The cloned repository will already have Mastra setup
- No need to install Mastra separately in sandbox containers
- Standard Mastra development command

**Confirmation**: Nathan confirmed cloned repos will have Mastra configured.

### 3. Local Git Initialization

**Decision**: Initialize git in /workspace for local commits

**Rationale**:
- Prepares for Phase 2 branch workflow
- Allows local commits during development
- No remote push in Phase 1

**Trade-offs Considered**:
- Option A: No git (pure filesystem) - Simpler but no history
- Option B: Git init only (chosen) - Balance of simplicity and Phase 2 preparation

### 4. Claude API Configuration

**Decision**: Support both ANTHROPIC_API_KEY (direct) and AWS Bedrock

**Rationale**:
- Flexibility for different deployment scenarios
- Direct API simpler for local development
- Bedrock matches production environment

**Implementation**:
- Environment variable `ANTHROPIC_API_KEY` for direct API
- Environment variables `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` for Bedrock
- cui-server will auto-detect based on available credentials

### 5. Container Architecture

**Decision**: Separate containers per service (not single multi-service container)

**Rationale**:
- Closer to production Kubernetes architecture
- Independent scaling and lifecycle per service
- Easier debugging and logging
- Aligns with Constitution Principle II (Session Isolation)

**Services**:
| Port | Container | Image Base |
|------|-----------|------------|
| 3001 | cui | bun:1-slim + cui-server |
| 4111 | mastra | bun:1-slim |
| 4321 | astro | node:20-slim |
| 8080 | code-server | codercom/code-server |

### 6. Database Choice

**Decision**: SQLite with Kysely ORM

**Rationale**:
- Constitution Principle V: Simplicity First
- No external database service for local development
- Kysely provides type-safe SQL with PostgreSQL migration path
- better-sqlite3 for synchronous API in tests

**Migration Path**: Switch to PostgreSQL by changing Kysely dialect and connection string.

### 7. API Framework

**Decision**: Hono

**Rationale**:
- Lightweight and fast
- TypeScript-native
- Works well with Bun runtime
- Simple middleware system

**Alternatives Considered**:
- Express: Heavier, more dependencies
- Fastify: Good alternative but Hono is simpler
- Elysia: Bun-native but less mature ecosystem

### 8. Container Management

**Decision**: dockerode (Docker SDK for Node.js)

**Rationale**:
- Programmatic control over Docker API
- Dynamic container creation per session
- No need for static docker-compose services

**Implementation Details**:
- Mount Docker socket in orchestrator container
- Create network + volume per session
- Use container labels for session tracking
