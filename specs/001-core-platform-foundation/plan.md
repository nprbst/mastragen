# Phase 1: Core Platform Foundation - Implementation Plan

**Feature Branch**: `001-core-platform-foundation`
**Spec**: [spec.md](spec.md)
**Status**: Ready for Implementation
**Created**: 2026-01-17

## Executive Summary

Phase 1 establishes Mastragen's foundation: a single sandbox running locally with all four services (cui, Mastra, Astro, VS Code), orchestrator API, database schema, and Docker Compose for local development. This is a green-field implementation using TDD principles.

## Constitution Check

| Principle | Phase 1 Alignment | Notes |
|-----------|-------------------|-------|
| I. Git-Native Persistence | PARTIAL | Local git init only; branch/push deferred to Phase 2 |
| II. Session Isolation | COMPLIANT | Separate containers per service, shared workspace volume |
| III. Multi-Service Architecture | COMPLIANT | 4 ports (3001, 4111, 4321, 8080), shared /workspace |
| IV. Project-First Configuration | COMPLIANT | Schema supports per-project config |
| V. Simplicity First | COMPLIANT | SQLite, Docker Compose, Hono, no auth |

**Gate Status**: All principles satisfied or explicitly deferred with justification.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Faster than Node, TypeScript-native |
| Database | SQLite + Kysely | Simplicity first, PostgreSQL migration path |
| API Framework | Hono | Lightweight, TypeScript-native |
| Container Management | dockerode | Docker SDK for dynamic container creation |
| cui Interface | cui-server (npx cui-server) | github.com/wbopan/cui |
| Mastra Dev Server | bun mastra dev | Assumes cloned repo has Mastra setup |
| Auth | Skip for Phase 1 | Local dev only |
| Local Git | Initialize in /workspace | Prepares for Phase 2 branch workflow |
| Claude API | Support both | ANTHROPIC_API_KEY or AWS Bedrock via env vars |

## Implementation Order (TDD)

### Step 1: Database Schema + Repositories

**Files**:
- `orchestrator/package.json`
- `orchestrator/tsconfig.json`
- `orchestrator/src/db/types.ts`
- `orchestrator/src/db/index.ts`
- `orchestrator/src/db/migrations/001_initial.ts`
- `orchestrator/src/repositories/projects.ts`
- `orchestrator/src/repositories/sessions.ts`
- `orchestrator/tests/db/migrations.test.ts`
- `orchestrator/tests/repositories/projects.test.ts`
- `orchestrator/tests/repositories/sessions.test.ts`

### Step 2: Orchestrator API Routes

**Files**:
- `orchestrator/src/index.ts`
- `orchestrator/src/config.ts`
- `orchestrator/src/routes/health.ts`
- `orchestrator/src/routes/sessions.ts`
- `orchestrator/tests/routes/health.test.ts`
- `orchestrator/tests/routes/sessions.test.ts`

### Step 3: Sandbox Service

**Files**:
- `orchestrator/src/services/sandbox.ts`
- `orchestrator/src/services/health.ts`
- `orchestrator/tests/services/sandbox.test.ts`

### Step 4: Container Images

**Files**:
- `sandbox/cui/Dockerfile`
- `sandbox/cui/entrypoint.sh`
- `sandbox/mastra/Dockerfile`
- `sandbox/mastra/entrypoint.sh`
- `sandbox/astro/Dockerfile`
- `sandbox/astro/entrypoint.sh`
- `sandbox/code-server/Dockerfile`
- `sandbox/code-server/lazy-start.sh`

### Step 5: Docker Compose Integration

**Files**:
- `docker-compose.yml`
- `docker-compose.override.yml`
- `fixtures/test-project/`

### Step 6: E2E Tests

**Files**:
- `orchestrator/tests/integration/sandbox-images.test.ts`
- `orchestrator/tests/integration/docker-compose.test.ts`
- `orchestrator/tests/e2e/session-lifecycle.test.ts`

## Success Criteria

- [ ] SC-001: Session creation < 2 minutes
- [ ] SC-002: All 4 services respond to health checks
- [ ] SC-003: File changes sync within 5 seconds
- [ ] SC-004: Suspend/resume preserves work
- [ ] SC-005: Memory usage < 8GB
- [ ] SC-006: Session creation API < 90 seconds

## References

- [Spec](spec.md)
- [Data Model](data-model.md)
- [API Contract](contracts/sessions.yaml)
- [Research](research.md)
- [Quickstart](quickstart.md)
