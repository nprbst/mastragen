# Research: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Created**: 2026-01-21
**Status**: Complete

## Overview

Research findings for Phase 4 production readiness features: session sharing refinement, idle auto-suspend, platform monitoring, alerting, documentation, and Kubernetes deployment.

---

## 1. Session Sharing Refinement

### Current State Analysis

Session sharing infrastructure is ~80% implemented:
- `session_shares` table exists with proper schema
- API endpoints: POST `/share`, GET `/shares`, DELETE `/shares/:shareId`
- Tailscale integration via `tailscaleService.grantSessionAccess()` / `revokeSessionAccess()`
- Audit logging for share events

### Remaining Work

**Decision**: Extend existing implementation rather than rebuild
**Rationale**: Core infrastructure is solid; only refinements needed

**Remaining items**:
1. Dashboard UI: "Shared with me" section in session list
2. Session detail UI: Display current shares with revoke buttons
3. Warning notifications when shared user is active during suspend
4. Graceful disconnect handling on revoke

**Alternatives Considered**:
- Full rewrite with WebSocket-based real-time sharing → Rejected (over-engineering, violates Simplicity First)
- Separate sharing microservice → Rejected (violates Simplicity First)

---

## 2. Idle Auto-Suspend

### Technology Decision

**Decision**: Background job using Bun's `setInterval` with database polling
**Rationale**: Simple, uses existing patterns (SessionCleanupJob), no external dependencies

### Design Details

- **Polling interval**: 5 minutes (matches FR-010)
- **Default timeout**: 30 minutes (configurable via FR-012)
- **Activity tracking**: `last_activity_at` already exists in sessions table
- **Warning mechanism**: 5 minutes before suspension (FR-013)

### Implementation Approach

1. Create `IdleSuspendJob` class following `SessionCleanupJob` pattern
2. Query sessions where `state = 'active'` AND `last_activity_at < (now - timeout)`
3. Send warnings for sessions approaching timeout (5 minutes before)
4. Auto-suspend sessions that exceed timeout
5. Record suspension reason as "auto" (new field: `suspension_reason`)

**Alternatives Considered**:
- Redis-based tracking → Rejected (adds external dependency, violates Simplicity First)
- Event-driven with message queue → Rejected (over-engineering for this scale)
- WebSocket heartbeat → Rejected (more complex, clients may not support)

---

## 3. Platform Monitoring

### Metrics Format Decision

**Decision**: Prometheus text exposition format (`text/plain; version=0.0.4`)
**Rationale**: Industry standard, supported by all major monitoring systems, simple text format

### Metrics to Expose

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `mastragen_sessions_total` | Gauge | `project`, `state` | Current session count |
| `mastragen_session_creations_total` | Counter | `project` | Total sessions created |
| `mastragen_session_suspensions_total` | Counter | `project`, `reason` | Total suspensions (manual/auto) |
| `mastragen_api_requests_total` | Counter | `endpoint`, `status` | HTTP request count |
| `mastragen_api_request_duration_seconds` | Histogram | `endpoint` | Request latency |
| `mastragen_pod_cpu_usage` | Gauge | `session_id` | Pod CPU utilization |
| `mastragen_pod_memory_bytes` | Gauge | `session_id` | Pod memory usage |
| `mastragen_alerts_fired_total` | Counter | `type` | Alerts generated |

### Implementation Approach

1. Create `MetricsService` to collect and format metrics
2. Add middleware to track request metrics
3. Expose `/metrics` endpoint (separate from `/api` routes)
4. Use prom-client library for Prometheus format

**Alternatives Considered**:
- OpenTelemetry → Future consideration, not needed for initial release
- StatsD → Less common, Prometheus more widely supported
- Custom JSON format → Non-standard, requires custom adapters

---

## 4. Alerting System

### Architecture Decision

**Decision**: Database-backed alert rules with webhook/email delivery
**Rationale**: Simple, inspectable, no external dependencies required

### Alert Types (from spec)

| Alert | Condition | Severity |
|-------|-----------|----------|
| Pod Creation Failed | Docker API error during session create | Error |
| Tailscale Timeout | Registration > 60 seconds | Warning |
| Database Connection Failed | Health check fails | Critical |
| Orphaned Pod | Pod exists > 10 minutes without session | Warning |

### Implementation Approach

1. Create `alert_rules` table for configurable conditions
2. Create `alert_events` table for triggered alerts
3. Create `AlertService` with:
   - `checkCondition(type)` - Evaluate alert condition
   - `fireAlert(rule, context)` - Create event and dispatch
   - `deliverAlert(event)` - Send via webhook/email
4. Background job polls for conditions
5. Alert delivery with retry (3 attempts, exponential backoff)

**Alternatives Considered**:
- AlertManager (Prometheus) → Adds infrastructure complexity
- PagerDuty native integration → Limits flexibility, vendor lock-in
- CloudWatch Alarms → AWS-specific, limits portability

---

## 5. Documentation Strategy

### Hosting Decision

**Decision**: Markdown files in repository, rendered via GitHub Pages or project web UI
**Rationale**: Simple, versioned with code, no extra infrastructure

### Documentation Structure

```
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
```

### Content Strategy

- User docs: Task-oriented with examples
- Operator docs: Step-by-step procedures with verification
- API docs: Auto-generated from TypeScript types where possible

**Alternatives Considered**:
- Docusaurus/GitBook → Adds build complexity
- OpenAPI/Swagger → Good for API, not for user guides
- Wiki → Disconnected from codebase, harder to version

---

## 6. Kubernetes Deployment

### Helm Chart Decision

**Decision**: Single Helm chart with subcharts for orchestrator and sandbox
**Rationale**: Industry standard, configurable, supports multiple environments

### Chart Structure

```
helm/mastragen/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── orchestrator/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── serviceaccount.yaml
│   ├── sandbox/
│   │   ├── deployment-template.yaml  # Template for dynamic pods
│   │   └── pvc.yaml
│   ├── secrets.yaml  # Reference external secrets
│   └── rbac.yaml
└── values/
    ├── development.yaml
    ├── staging.yaml
    └── production.yaml
```

### Key Configuration Values

| Value | Default | Description |
|-------|---------|-------------|
| `orchestrator.replicas` | 1 | Orchestrator pod replicas |
| `orchestrator.resources.requests.cpu` | 250m | CPU request |
| `orchestrator.resources.requests.memory` | 512Mi | Memory request |
| `sandbox.idleTimeout` | 30m | Default idle timeout |
| `sandbox.resources.limits.cpu` | 2 | Sandbox CPU limit |
| `sandbox.resources.limits.memory` | 4Gi | Sandbox memory limit |
| `image.registry` | ghcr.io | Container registry |
| `tailscale.authKey` | (secret ref) | Tailscale auth key |

### Minikube Testing

- Use `imagePullPolicy: Never` for local images
- Create test namespace: `mastragen-test`
- Integration test: helm install → health check → create session → verify Tailscale

**Alternatives Considered**:
- Kustomize → Less configurable than Helm
- Raw manifests → Hard to parameterize
- Operator pattern → Over-engineering for current scale

---

## 7. Container Registry Strategy

### Decision

**Decision**: GitHub Container Registry (ghcr.io) as default, pluggable for alternatives
**Rationale**: Free for public repos, integrates with GitHub Actions, simple auth

### CI/CD Pipeline

1. On push to main: build and push `:latest` tag
2. On tag: build and push versioned tag (`:v1.0.0`)
3. Images: `ghcr.io/org/mastragen-orchestrator`, `ghcr.io/org/mastragen-sandbox`

### Alternative Registries

- AWS ECR: Override `image.registry` and `image.pullSecret` in values
- Self-hosted: Override `image.registry` with internal registry URL

---

## 8. Secrets Management

### Initial Implementation

**Decision**: Kubernetes Secrets with manual creation
**Rationale**: Native, simple, sufficient for initial deployment

### Required Secrets

| Secret Name | Keys | Description |
|-------------|------|-------------|
| `mastragen-auth` | `jwt-secret` | JWT signing key |
| `mastragen-github` | `app-id`, `private-key`, `client-id`, `client-secret` | GitHub App credentials |
| `mastragen-tailscale` | `auth-key` | Tailscale auth key |
| `mastragen-anthropic` | `api-key` | Anthropic API key |

### Future Enhancement Path

- External Secrets Operator integration (documented in plan)
- AWS Secrets Manager support (documented reference architecture)
- HashiCorp Vault support (out of scope for Phase 4)

---

## Summary of Key Decisions

| Area | Decision | Key Rationale |
|------|----------|---------------|
| Idle Detection | Database polling | Simple, uses existing patterns |
| Metrics Format | Prometheus | Industry standard |
| Alert Delivery | Webhook + Email | Simple, flexible |
| Documentation | Markdown in repo | Versioned with code |
| Deployment | Helm charts | Configurable, standard |
| Registry | ghcr.io | Free, GitHub integration |
| Secrets | K8s Secrets | Native, simple |

All decisions align with Constitution principle V (Simplicity First).
