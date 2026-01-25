# Implementation Plan: Phoenix Observability for Mastragen

**Feature Branch**: `005-phoenix-observability`
**Spec**: [spec.md](./spec.md)
**Status**: Ready for implementation
**Created**: 2026-01-23

## Summary

Add Arize Phoenix as an optional observability component to Mastragen, enabling trace visibility into Mastra agents, prompt management with versioning, systematic experimentation against datasets, synthetic data generation from personas, and error analysis workflows. Phoenix will be conditionally started per environment, with SQLite persistence and Tailscale-secured access.

## Technical Context

**Language/Version**: TypeScript (Bun runtime)
**Primary Dependencies**: @arizeai/phoenix-client, @mastra/arize, @anthropic-ai/sdk
**Storage**: SQLite (Phoenix-managed), Mastragen's existing SQLite/Kysely
**Testing**: Bun test (unit), integration tests with Docker
**Target Platform**: Docker Compose (local), Kubernetes (production)
**Project Type**: Multi-service monorepo (orchestrator, web, sandbox containers)
**Performance Goals**: Traces visible within 30s, experiments with 100 cases complete in <10 min
**Constraints**: <512MB memory per Phoenix instance, port-based routing only

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Git-Native Persistence | PASS | Phoenix data in SQLite volumes, cleaned with session lifecycle |
| Session Isolation | PASS | One Phoenix container per session when enabled |
| Multi-Service Architecture | PASS | Phoenix on port 6006, fits existing port-based routing |
| Project-First Configuration | PASS | Config in `.mastragen/config.yaml` (static) + database (secrets) |
| Simplicity First | PASS | SQLite backend, existing patterns for conditional services |
| Technology Stack | PASS | Astro frontend, Hono orchestrator, no forbidden tech |

## Project Structure

### Documentation (this feature)

```text
specs/005-phoenix-observability/
├── plan.md              # This file
├── research.md          # Phase 0: Technical research findings
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/           # Phase 1: API contracts
│   ├── phoenix-config.ts
│   └── experiment-runner.ts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code Changes

```text
orchestrator/
├── src/
│   ├── lib/
│   │   ├── project-config.ts           # Config file parser
│   │   └── project-config.schema.ts    # Valibot schema for .mastragen/config.yaml
│   ├── services/
│   │   ├── sandbox.ts                  # Conditional Phoenix container (lines 976-1139)
│   │   └── k8s-sandbox.ts              # K8s Phoenix pod/service (lines 250-506)
│   └── config.ts                       # Phoenix environment variables
├── k8s/phoenix/                        # New: K8s manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   └── pvc.yaml
└── tests/
    ├── unit/services/
    │   ├── sandbox-phoenix.test.ts     # New
    │   └── k8s-sandbox-phoenix.test.ts # New
    └── integration/
        └── phoenix-session.test.ts     # New

sandbox/
└── mastra/
    └── entrypoint.sh                   # Telemetry configuration

docker-compose.yml                      # Phoenix service with profile

# Template files for user workspaces (scaffolded on session create)
experiments/                            # New: Experiment framework
├── package.json
├── tsconfig.json
├── lib/
│   ├── phoenix.ts
│   ├── mastra.ts
│   ├── runner.ts
│   ├── types.ts
│   ├── prompt-client.ts
│   ├── artifact-extractor.ts
│   ├── synthetic-generator.ts
│   └── error-analysis.ts
├── tasks/
│   └── example-workflow.ts
├── evaluators/
│   ├── accuracy.ts
│   └── relevance.ts
├── personas/
│   ├── index.ts
│   └── README.md
└── cli.ts
```

## Implementation Phases

### Phase 1: Infrastructure (P1 Stories: US-1, US-2)

**Goal**: Config file parser, Docker Compose, Kubernetes manifests

1. **Project Config Parser** (`orchestrator/src/lib/project-config.ts`)
   - Valibot schema for `.mastragen/config.yaml`
   - Read config from workspace path at session start
   - Fallback to defaults when file missing

2. **Docker Compose Phoenix Service**
   ```yaml
   phoenix:
     image: arizephoenix/phoenix:latest
     profiles: [phoenix]
     ports: ["6006:6006"]
     environment:
       - PHOENIX_SQL_DATABASE_URL=sqlite:////data/phoenix/phoenix.db
     volumes: [phoenix-data:/data/phoenix]
     healthcheck: curl -f http://localhost:6006/health
   ```

3. **Kubernetes Manifests** (`orchestrator/k8s/phoenix/`)
   - Deployment: 512Mi-2Gi memory, 250m-1 CPU
   - Service: ClusterIP on ports 6006, 4317
   - PVC: 10Gi for SQLite

4. **Config Extension** (config.ts)
   - `phoenixEnabled: boolean` from `PHOENIX_ENABLED`
   - `phoenixEndpoint: string` default `http://phoenix:6006/v1/traces`

### Phase 2: Container Orchestration (P1 Stories)

**Goal**: Conditional Phoenix startup in SandboxService and K8sSandboxService

1. **SandboxService Modifications** (sandbox.ts)
   - Read `.mastragen/config.yaml` from workspace path using project-config parser
   - Check `components.phoenix.enabled` from parsed config
   - Add Phoenix container to containers array when enabled
   - Inject `PHOENIX_ENABLED=true` and `PHOENIX_ENDPOINT` into Mastra container

3. **K8sSandboxService Modifications** (k8s-sandbox.ts)
   - Add Phoenix container to pod spec when enabled
   - Add Caddyfile entry for port 6006 with Tailscale TLS

4. **ServiceUrls Extension**
   - Add optional `phoenix: string | null` field

### Phase 3: Mastra Integration (P1, P2 Stories: US-1, US-4)

**Goal**: Telemetry configuration and prompt retrieval

1. **Mastra Entrypoint Enhancement** (entrypoint.sh)
   - Configure `OTEL_EXPORTER_OTLP_ENDPOINT` when `PHOENIX_ENABLED=true`

2. **Telemetry Template** (experiments/lib/mastra-telemetry.ts)
   - ArizeExporter configuration for @mastra/arize

3. **Prompt Client Template** (experiments/lib/prompt-client.ts)
   - `fetchPrompt(name, tag, localFallback)` with Phoenix/local fallback

### Phase 4: Experiment Framework (P2 Story: US-3)

**Goal**: Complete experiment runner with CLI

1. **Core Libraries**
   - `mastra.ts`: HTTP client for Mastra API (agents, workflows, tools)
   - `runner.ts`: Experiment orchestration (dataset -> task -> evaluators -> Phoenix)
   - `types.ts`: DatasetExample, EvaluationResult, Task, Evaluator interfaces

2. **CLI** (cli.ts)
   - `--list-datasets`: List Phoenix datasets
   - `--list-tasks`: List registered tasks
   - `--dataset <name> --task <name>`: Run experiment
   - `--results <id>`: Get experiment results

3. **Sample Task/Evaluator Templates**
   - `tasks/example-workflow.ts`
   - `evaluators/accuracy.ts`, `evaluators/relevance.ts`

### Phase 5: Advanced Features (P3 Stories: US-5, US-6, US-7)

**Goal**: Synthetic data, error analysis, handoff export

1. **Synthetic Data Generation**
   - `artifact-extractor.ts`: Extract Mastra agent/workflow metadata
   - `synthetic-generator.ts`: Claude Opus + personas -> Phoenix dataset
   - CLI: `generate-synthetic --personas <path> --artifact <path> --name <name>`

2. **Error Analysis Workflow**
   - `error-analysis.ts`: Open coding -> Axial coding -> Improvement plan
   - CLI: `analyze-errors --experiment <id> --output <path>`

3. **Handoff Export**
   - Export experiment results, datasets, prompts, analysis to package
   - CLI: `export-handoff --experiment <id> --output <dir>`

## Critical Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `orchestrator/src/lib/project-config.ts` | New | Config file parser |
| `orchestrator/src/lib/project-config.schema.ts` | New | Valibot schema for `.mastragen/config.yaml` |
| `orchestrator/src/services/sandbox.ts` | Edit | Conditional Phoenix container (reads config file) |
| `orchestrator/src/services/k8s-sandbox.ts` | Edit | K8s Phoenix support (reads config file) |
| `docker-compose.yml` | Edit | Add Phoenix service |
| `sandbox/mastra/entrypoint.sh` | Edit | Telemetry config |

## Test Strategy

| Layer | Test Type | Files |
|-------|-----------|-------|
| Config Parser | Unit | `tests/lib/project-config.test.ts` |
| SandboxService | Unit | `tests/unit/services/sandbox-phoenix.test.ts` |
| K8sSandboxService | Unit | `tests/unit/services/k8s-sandbox-phoenix.test.ts` |
| Session Lifecycle | Integration | `tests/integration/phoenix-session.test.ts` |
| Experiments | Unit | Within experiments/ package |

## Verification Plan

### P1 Verification (Phase 1-2)
1. Create project with `.mastragen/config.yaml` containing `components.phoenix.enabled: true`
2. Create session for that project
3. Verify Phoenix container started: `docker ps | grep phoenix`
4. Access Phoenix UI at `http://localhost:6006`
5. Trigger Mastra agent execution via HTTP
6. Verify trace appears in Phoenix within 30 seconds

### P2 Verification (Phase 3-4)
1. Create dataset in Phoenix UI with test cases
2. Run: `bun run cli.ts --dataset "test-cases" --task "example-workflow"`
3. Verify experiment results in Phoenix UI
4. Store prompt in Phoenix, verify agent retrieves tagged version
5. Verify local fallback when Phoenix unavailable

### P3 Verification (Phase 5)
1. Author personas in `experiments/personas/`
2. Run: `bun run cli.ts generate-synthetic --personas ./personas/test.ts --artifact ../src/mastra/agents/test.ts --name "synthetic-v1" --count 50`
3. Verify dataset created with correct persona distribution
4. Run experiment on synthetic dataset
5. Run: `bun run cli.ts analyze-errors --experiment <id>`
6. Verify taxonomy and improvement plan generated
7. Run: `bun run cli.ts export-handoff --experiment <id> --output ./handoff`
8. Verify all expected files present

## Dependencies

- `@arizeai/phoenix-client` - Phoenix SDK for datasets, experiments, prompts
- `@mastra/arize` - Mastra telemetry exporter
- `@anthropic-ai/sdk` - Claude for synthetic data and error analysis
- Docker image: `arizephoenix/phoenix:latest`

## Delivery Order

| Sprint | Stories | Phases | Deliverables |
|--------|---------|--------|--------------|
| 1 | US-1, US-2 (P1) | 1, 2 | Trace visibility, per-session Phoenix |
| 2 | US-3, US-4 (P2) | 3, 4 | Experiments, prompt management |
| 3 | US-5, US-6, US-7 (P3) | 5 | Synthetic data, error analysis, handoff |
