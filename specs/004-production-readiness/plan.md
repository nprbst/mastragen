# Implementation Plan: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Spec**: [spec.md](./spec.md)
**Status**: Ready for Implementation
**Created**: 2026-01-21

## Executive Summary

Phase 4 transforms Mastragen from a functional development platform into a production-ready system. Building on the existing foundation from Phases 1-3, this phase adds:

1. **Session Sharing Refinement** - Complete the ~80% implemented sharing feature with UI and edge case handling
2. **Idle Auto-Suspend** - Automatic resource conservation with configurable timeouts and warnings
3. **Platform Monitoring** - Prometheus-compatible metrics endpoint for operational visibility
4. **Alerting System** - Configurable alerts for critical conditions with webhook/email delivery
5. **Documentation** - Comprehensive user and operator guides
6. **Kubernetes Deployment** - Helm charts for production deployment with Tailscale integration

## Technical Context

**Language/Runtime**: TypeScript 5.x, Bun 1.0+
**Primary Dependencies**: Hono 4.6, Kysely 0.27, Valibot 1.2, Dockerode 4.0
**Storage**: SQLite (development), PostgreSQL (production scale)
**Testing**: Bun test runner
**Target Platform**: Linux server (Docker/Kubernetes)
**Project Type**: Web application (orchestrator backend + Astro frontend)
**Performance Goals**: 100+ concurrent sessions, <500ms metrics response, <60s alert generation
**Constraints**: Tailscale for networking, GitHub for authentication, single-region deployment
**Scale/Scope**: Team-scale deployment (~10-50 users)

## Constitution Check

*GATE: Verified against [constitution.md](../../.speck/memory/constitution.md)*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Git-Native Persistence | ✅ Pass | Session state remains in git; no changes to persistence model |
| II. Session Isolation | ✅ Pass | Tailscale ACLs enforced; sharing uses existing access control |
| III. Multi-Service Architecture | ✅ Pass | Port-based routing preserved; monitoring doesn't alter service topology |
| IV. Project-First Configuration | ✅ Pass | Idle timeout is per-project configurable |
| V. Simplicity First | ✅ Pass | All decisions use existing tools (Prometheus, K8s Secrets, Helm) |

**Technology Stack Compliance**:
- ✅ Orchestrator: Hono + Kysely (no changes)
- ✅ Database: SQLite/PostgreSQL (no changes)
- ✅ Frontend: Astro with React (no Next.js)
- ✅ Containers: Kubernetes with Tailscale sidecar

**No constitution violations detected.**

## Project Structure

### Documentation (this feature)

```
specs/004-production-readiness/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technology decisions and rationale
├── data-model.md        # Database schema changes
├── quickstart.md        # Developer setup instructions
├── contracts/           # API contracts
│   ├── metrics.md       # GET /metrics endpoint
│   ├── alerts.md        # Alerts CRUD API
│   ├── idle-config.md   # Idle configuration API
│   └── session-activity.md  # Activity recording API
└── checklists/
    └── requirements.md  # Spec validation checklist
```

### Source Code (repository root)

```
orchestrator/
├── src/
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 006_add_suspension_reason.ts    # New migration
│   │   │   ├── 007_create_alert_tables.ts      # New migration
│   │   │   └── 008_create_idle_config.ts       # New migration
│   │   └── schema.ts                           # Updated types
│   ├── jobs/
│   │   ├── idle-suspend.ts                     # New: Idle detection job
│   │   ├── alert-checker.ts                    # New: Alert condition checker
│   │   └── session-cleanup.ts                  # Existing
│   ├── services/
│   │   ├── metrics-service.ts                  # New: Metrics collection
│   │   ├── alert-service.ts                    # New: Alert management
│   │   ├── idle-config-service.ts              # New: Idle config management
│   │   └── ...existing services
│   ├── routes/
│   │   ├── metrics.ts                          # New: /metrics endpoint
│   │   ├── alerts.ts                           # New: /api/alerts/* endpoints
│   │   └── ...existing routes
│   └── middleware/
│       └── metrics-middleware.ts               # New: Request tracking
└── tests/
    ├── unit/
    │   ├── jobs/idle-suspend.test.ts           # New
    │   ├── services/alert-service.test.ts      # New
    │   └── services/metrics-service.test.ts    # New
    ├── integration/
    │   ├── alerts.test.ts                      # New
    │   └── idle-suspend.test.ts                # New
    └── e2e/
        └── monitoring.test.ts                  # New

web/
├── src/
│   ├── components/
│   │   ├── SessionShareList.tsx                # New: Display shares on session
│   │   ├── SharedWithMeSection.tsx             # New: Dashboard section
│   │   └── IdleWarningBanner.tsx               # New: Idle timeout warning
│   └── pages/
│       └── admin/
│           ├── alerts.astro                    # New: Alert management UI
│           └── monitoring.astro                # New: Basic metrics dashboard
└── tests/
    └── components/
        ├── SessionShareList.test.tsx           # New
        └── SharedWithMeSection.test.tsx        # New

helm/
└── mastragen/
    ├── Chart.yaml
    ├── values.yaml
    ├── templates/
    │   ├── orchestrator/
    │   │   ├── deployment.yaml
    │   │   ├── service.yaml
    │   │   ├── configmap.yaml
    │   │   └── serviceaccount.yaml
    │   ├── sandbox/
    │   │   └── pvc.yaml
    │   ├── secrets.yaml
    │   └── rbac.yaml
    └── values/
        ├── development.yaml
        ├── staging.yaml
        └── production.yaml

docs/
├── user/
│   ├── getting-started.md
│   ├── project-configuration.md
│   ├── claude-commands.md
│   └── troubleshooting.md
├── operator/
│   ├── deployment-kubernetes.md
│   ├── deployment-docker-compose.md
│   ├── github-app-setup.md
│   ├── tailscale-configuration.md
│   └── database-migration.md
└── api/
    └── reference.md

.github/
└── workflows/
    └── docker-publish.yml                      # New: Image build CI
```

**Structure Decision**: Web application pattern with shared orchestrator backend and Astro frontend. Helm charts added at root level for Kubernetes deployment.

## Implementation Phases

### Phase 1: Database & Core Infrastructure (P1)

**Scope**: Migrations, background jobs, core services

1. **Database migrations** (FR-005, FR-008, FR-012, FR-014)
   - `006_add_suspension_reason.ts`: Add `suspension_reason` to sessions
   - `007_create_alert_tables.ts`: Create `alert_rules`, `alert_events`
   - `008_create_idle_config.ts`: Create `idle_config` with global default

2. **Idle auto-suspend job** (FR-009, FR-010, FR-011, FR-013)
   - Create `IdleSuspendJob` class following `SessionCleanupJob` pattern
   - Query active sessions with `last_activity_at < threshold`
   - Send warnings 5 minutes before suspension
   - Auto-suspend and record `suspension_reason = 'auto'`

**Warning Notification Delivery**:
- IdleSuspendJob sets `warning_issued = true` on session 5 minutes before timeout
- IdleWarningBanner component polls `GET /api/sessions/:id/idle-status` every 30 seconds
- When `warningIssued: true` in response, banner displays countdown
- No WebSocket required; polling is sufficient for 5-minute warning window

3. **Activity recording endpoint** (FR-009)
   - Enhance `POST /api/sessions/:id/activity` with activity types
   - Add `GET /api/sessions/:id/idle-status` endpoint

### Phase 2: Monitoring & Alerting (P1-P2)

**Scope**: Metrics endpoint, alert system

1. **Metrics service and endpoint** (FR-015 to FR-020)
   - Create `MetricsService` to collect Prometheus metrics
   - Add middleware to track request metrics
   - Expose `GET /metrics` endpoint

2. **Alert service** (FR-021 to FR-026)
   - Create `AlertService` with condition checking
   - Create `AlertCheckerJob` background job
   - Implement webhook and email delivery with retry

3. **Alert API** (FR-025, FR-026)
   - CRUD for alert rules
   - List/acknowledge alert events

### Phase 3: Session Sharing Refinement (P1)

**Scope**: UI components, edge cases

**Existing Implementation (from Phases 1-3)**:
- `session_shares` database table with share/revoke tracking
- `/share @username` and `/unshare @username` Claude commands
- Tailscale ACL updates on share/revoke
- Basic access control enforcement

**Phase 4 Additions**:

1. **Dashboard UI updates** (FR-006, FR-007)
   - "Shared with me" section in session list
   - Display shares on session detail with revoke buttons

2. **Edge case handling** (from spec)
   - Warning notification when shared user active during suspend
   - Graceful disconnect on access revoke

### Phase 4: Kubernetes Deployment (P1)

**Scope**: Helm charts, CI/CD

1. **Helm charts** (FR-035 to FR-040)
   - Create chart structure with orchestrator deployment
   - Add configurable values for resources, replicas
   - Include probes, PVCs, RBAC

2. **Container registry CI** (FR-045, FR-046)
   - GitHub Actions workflow for image builds
   - Push to ghcr.io on merge to main

3. **Tailscale operational readiness** (FR-041 to FR-044)
   - Readiness probe for Tailscale connectivity
   - ACL configuration via Helm values
   - Token rotation support

4. **Minikube testing** (FR-040)
   - Local image loading
   - Integration test: install → health → session → Tailscale

### Phase 5: Documentation (P2)

**Scope**: User and operator guides

1. **User documentation** (FR-027 to FR-030)
   - Getting started guide
   - Project configuration reference
   - Claude commands reference
   - Troubleshooting guide

2. **Operator documentation** (FR-031 to FR-034)
   - Kubernetes deployment guide
   - Docker Compose deployment guide
   - GitHub App setup instructions
   - Tailscale configuration guide
   - Database migration procedures

## Dependencies Between Phases

```
Phase 1 (Database & Core)
    │
    ├──▶ Phase 2 (Monitoring & Alerting)
    │         │
    │         └──▶ Phase 5 (Documentation) [operator docs need monitoring info]
    │
    ├──▶ Phase 3 (Session Sharing)
    │
    └──▶ Phase 4 (Kubernetes)
              │
              └──▶ Phase 5 (Documentation) [deployment guides need Helm charts]
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tailscale API changes | Pin to specific API version; document fallback procedures |
| Alert delivery failures | Implement retry with exponential backoff; log all failures |
| Idle detection false positives | Allow per-project override; monitor false positive rate |
| Helm chart complexity | Start simple; use well-tested patterns from community |

## Success Criteria Mapping

| Criterion | Implementation | Verification |
|-----------|----------------|--------------|
| SC-001: Share <10s | Existing implementation | Integration test |
| SC-002: Revoke <5s | Existing implementation | Integration test |
| SC-003: Auto-suspend <2min | `IdleSuspendJob` 5-min poll | Integration test |
| SC-004: Warning 4min before | Warning at `timeout - 5min` | Unit test |
| SC-005: Metrics <500ms | `MetricsService` caching | Load test |
| SC-006: Alert <60s | `AlertCheckerJob` 1-min poll | Integration test |
| SC-007: Delivery <30s | Async delivery with timeout | Integration test |
| SC-008: User onboard <15min | Getting started guide | Manual verification |
| SC-009: Operator deploy <60min | Deployment guides | Manual verification |
| SC-010: 100 concurrent sessions | Load test | Performance test |
| SC-011: <1% false positives | Activity tracking accuracy | Monitoring |
| SC-012: 100% doc coverage | Complete docs directory | Checklist |
| SC-013: Minikube test passes | CI workflow | Automated test |

## Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Research | [research.md](./research.md) | Technology decisions |
| Data Model | [data-model.md](./data-model.md) | Schema changes |
| Quickstart | [quickstart.md](./quickstart.md) | Developer setup |
| Metrics API | [contracts/metrics.md](./contracts/metrics.md) | Metrics endpoint contract |
| Alerts API | [contracts/alerts.md](./contracts/alerts.md) | Alerts endpoint contracts |
| Idle Config API | [contracts/idle-config.md](./contracts/idle-config.md) | Idle config contracts |
| Activity API | [contracts/session-activity.md](./contracts/session-activity.md) | Activity tracking contract |

## Next Steps

1. **Run `/speck:tasks`** to generate detailed task breakdown with dependencies
2. **Begin Phase 1** with database migrations
3. **TDD approach**: Write tests first for each service

---

*Plan generated by /speck:plan on 2026-01-21*
