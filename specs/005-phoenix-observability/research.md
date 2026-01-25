# Research: Phoenix Observability for Mastragen

**Feature**: 005-phoenix-observability
**Created**: 2026-01-23
**Status**: Complete

## Overview

This document captures research findings that informed the implementation plan for adding Arize Phoenix observability to Mastragen.

---

## 1. Arize Phoenix Architecture

### Decision: Self-hosted Phoenix with SQLite backend

**Rationale**:
- Aligns with Constitution principle "Simplicity First" (SQLite default)
- No external cloud dependencies required
- Data stays within Mastragen's boundary (data locality principle)
- SQLite sufficient for single-session workloads per tech spec assumptions

**Alternatives Considered**:
- Phoenix Cloud (Arize hosted): Rejected - adds external dependency, data leaves boundary
- PostgreSQL backend: Out of scope per spec assumptions; can migrate later if needed

### Key Phoenix Components

| Component | Port | Purpose |
|-----------|------|---------|
| Phoenix Server | 6006 | UI, REST API, trace ingestion |
| OTLP gRPC | 4317 | OpenTelemetry trace ingestion (alternative) |
| SQLite | - | Persistence for traces, prompts, datasets, experiments |

### Phoenix Docker Image

- **Image**: `arizephoenix/phoenix:latest`
- **Environment Variables**:
  - `PHOENIX_SQL_DATABASE_URL=sqlite:////data/phoenix/phoenix.db`
  - `PHOENIX_WORKING_DIR=/data/phoenix`
  - `PHOENIX_TRACE_RETENTION_DAYS=30` (optional)
- **Health Check**: `curl -f http://localhost:6006/health`
- **Resource Requirements**: 512Mi-2Gi memory, 250m-1 CPU per instance

---

## 2. Mastra Telemetry Integration

### Decision: Use @mastra/arize with ArizeExporter

**Rationale**:
- Official Mastra package for Arize/Phoenix integration
- Supports OpenTelemetry trace export
- Conditional enablement via environment variables

**Pattern**:
```typescript
const observabilityConfig = process.env.PHOENIX_ENABLED === "true"
  ? {
      configs: {
        arize: {
          serviceName: process.env.PHOENIX_PROJECT_NAME,
          exporter: new ArizeExporter({
            endpoint: process.env.PHOENIX_ENDPOINT,
          }),
        },
      },
    }
  : undefined;
```

### Critical Constraint: Telemetry requires `mastra dev`

Telemetry only works when running via `mastra dev` - direct script execution (e.g., `bun run agent.ts`) does not generate traces. This means:
- Experiment runner must call Mastra via HTTP API, not import code directly
- All task executions go through Mastra server to ensure traces are captured

---

## 3. Experiment Runner Architecture

### Decision: Experiment runner lives in VSCode container, calls Mastra HTTP API

**Rationale**:
- Claude's home base with direct file access
- Can iterate on runner code in workspace
- HTTP calls ensure telemetry is captured via Mastra server

**Alternatives Considered**:
- Runner in Mastra container: Rejected - Claude would need SSH/exec, less natural workflow
- Separate experiment container: Rejected - overkill, adds complexity

### Experiment Workflow

1. Resolve dataset from Phoenix (`GET /v1/datasets`)
2. Create experiment record (`POST /v1/datasets/{id}/experiments`)
3. For each example: execute task via Mastra HTTP API
4. Run evaluators on task output
5. Post results to Phoenix (`POST /v1/experiments/{id}/runs`)

### Mastra HTTP API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents/{name}/generate` | POST | Execute agent with messages |
| `/api/workflows/{name}/execute` | POST | Execute workflow with triggerData |
| `/api/tools/{name}/execute` | POST | Execute tool with input |

---

## 4. Prompt Management

### Decision: Phoenix prompt storage with local file fallback

**Rationale**:
- Phoenix provides versioning and tagging (experiment, staging, production)
- Local fallback ensures graceful degradation when Phoenix unavailable
- FR-012 requires fallback capability

**Pattern**:
```typescript
async function fetchPrompt(name: string, tag: string, localFallback: string): Promise<string> {
  if (process.env.PHOENIX_ENABLED !== "true") {
    return fs.readFileSync(localFallback, "utf-8");
  }
  try {
    const prompt = await getPrompt({ name, tag });
    return prompt.template_messages[0].content;
  } catch (err) {
    console.warn(`Phoenix unavailable, using local fallback`);
    return fs.readFileSync(localFallback, "utf-8");
  }
}
```

---

## 5. Synthetic Data Generation

### Decision: Claude Opus + personas + Mastra artifact extraction

**Rationale**:
- High-quality generation requires Claude Opus (per spec assumption)
- Personas provide diversity across user archetypes
- Mastra artifact extraction gives context about agent capabilities

**Generation Distribution** (per tech spec):
- ~50% normal/typical cases
- ~30% edge cases (ambiguous, incomplete, unusual)
- ~20% stress cases (difficult scenarios, emotional, multi-part)

### Persona Schema

Key fields: id, name, role, context (demographics, techLevel, situation), communication (style, behaviors, quirks), goals, edgeCases, domainAttributes

---

## 6. Error Analysis Workflow

### Decision: Grounded theory approach (open coding -> axial coding -> prioritization)

**Rationale**:
- Transforms raw failures into actionable insights
- Human review expected for axial coding output (not fully automated)
- Prioritization uses impact/effort scoring

### Phases

1. **Open Coding**: Claude Sonnet analyzes each failure, produces descriptive observation
   - Severity: minor, moderate, severe
   - Avoids generic labels ("hallucination") in favor of specific descriptions

2. **Axial Coding**: Groups observations into 5-10 thematic categories
   - Output marked `reviewStatus: "pending"` for human review
   - Categories should be actionable (engineer knows what to fix)

3. **Prioritization**:
   - Impact score = count × severity weight (severe=10, moderate=3, minor=1)
   - Priority = impact / effort (low=1×, medium=0.5×, high=0.25×)
   - Levels: critical, high, medium, low

---

## 7. Container Orchestration Patterns

### Existing Pattern in Codebase

The codebase already supports conditional container startup:
- Chrome DevTools: `chrome_mode` flag in sessions table
- Astro sandbox: `uiSandboxPath` configuration check
- Docker profiles: `--profile sandbox` for optional services

### Phoenix Pattern (follows existing)

- Database: `phoenix_enabled` column in `project_environments`
- Docker: `--profile phoenix` for conditional startup
- K8s: Conditional resource rendering via Helm `{{- if .Values.phoenix.enabled }}`
- Environment injection: `PHOENIX_ENABLED`, `PHOENIX_ENDPOINT` into Mastra container

---

## 8. Tailscale Access

### Decision: Phoenix UI exposed via existing Tailscale ingress pattern

**Rationale**:
- Constitution requires Tailscale for secure access
- Existing Caddyfile pattern for port-based TLS termination
- No additional authentication layer required (network-gated per spec clarification)

**Caddyfile Entry**:
```caddy
https://${hostname}:6006 {
  tls { get_certificate tailscale }
  reverse_proxy localhost:6006
}
```

---

## 9. Data Retention

### Decision: 30-day default for traces, configurable

**Rationale**:
- Per spec clarification: 30 days default for traces
- Container volumes cleaned up with session lifecycle
- Phoenix supports `PHOENIX_TRACE_RETENTION_DAYS` environment variable

---

## 10. Package Dependencies

### New Dependencies Required

| Package | Purpose | Version |
|---------|---------|---------|
| `@arizeai/phoenix-client` | Phoenix SDK (datasets, experiments, prompts) | ^1.0.0 |
| `@mastra/arize` | Mastra telemetry exporter | Latest |
| `@anthropic-ai/sdk` | Claude for synthetic data and error analysis | ^0.32.0 |

### Docker Image

| Image | Purpose |
|-------|---------|
| `arizephoenix/phoenix:latest` | Phoenix server |

---

## References

- Tech Spec: `docs/phoenix-mastragen-spec.md`
- Feature Spec: `specs/005-phoenix-observability/spec.md`
- Constitution: `.speck/memory/constitution.md`
- Arize Phoenix Docs: https://docs.arize.com/phoenix
- Mastra Observability: https://mastra.ai/docs/observability
