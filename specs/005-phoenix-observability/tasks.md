# Tasks: Phoenix Observability for Mastragen

**Feature Branch**: `005-phoenix-observability`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Generated**: 2026-01-23

## Summary

7 user stories (2 P1, 2 P2, 3 P3) across 10 phases, 70 total tasks.

---

## Phase 1: Setup

**Goal**: Project initialization and dependency setup

- [ ] T001 Install @arizeai/phoenix-client dependency in experiments/package.json
- [ ] T002 [P] Install @mastra/arize dependency in sandbox/mastra/package.json
- [ ] T003 [P] Install @anthropic-ai/sdk dependency for experiments in experiments/package.json
- [ ] T004 Create experiments/ directory structure per plan.md in experiments/

---

## Phase 2: Foundational

**Goal**: Config file parser and configuration (blocking prerequisites for all user stories)

- [ ] T005 Create Valibot schema for `.mastragen/config.yaml` in orchestrator/src/lib/project-config.schema.ts
- [ ] T006 Implement config file parser with fallback to defaults in orchestrator/src/lib/project-config.ts
- [ ] T007 Add Phoenix environment variables to config.ts (phoenixEnabled, phoenixEndpoint) in orchestrator/src/config.ts
- [ ] T008 Add phoenix field to ServiceUrls interface in orchestrator/src/services/sandbox.ts
- [ ] T009 Write unit tests for config file parser in orchestrator/tests/lib/project-config.test.ts
- [ ] T010 [P] Create `.mastragen/config.yaml` template documentation in docs/config-file.md

---

## Phase 3: User Story 1 - View Agent Traces in Phoenix UI (P1)

**Goal**: Enable trace visibility into Mastra agents via Phoenix

**Independent Test**: Enable Phoenix on a session, run a Mastra agent, verify trace appears in Phoenix UI within 30 seconds.

**Acceptance Criteria**:
1. Trace appears in Phoenix UI within 30 seconds of agent execution
2. Trace shows LLM prompts, responses, tool calls, and timing
3. When Phoenix is disabled, no traces are sent and performance is unaffected

### Tasks

- [ ] T012 [US1] Add Phoenix service configuration to docker-compose.yml with phoenix profile in docker-compose.yml
- [ ] T013 [US1] Configure Phoenix volume for SQLite persistence in docker-compose.yml
- [ ] T014 [US1] Add Phoenix healthcheck to docker-compose.yml in docker-compose.yml
- [ ] T014a [US1] Configure PHOENIX_TRACE_RETENTION_DAYS=30 in docker-compose.yml and K8s manifests for FR-020
- [ ] T015 [P] [US1] Create Phoenix Kubernetes deployment manifest in orchestrator/k8s/phoenix/deployment.yaml
- [ ] T016 [P] [US1] Create Phoenix Kubernetes service manifest in orchestrator/k8s/phoenix/service.yaml
- [ ] T017 [P] [US1] Create Phoenix Kubernetes PVC manifest in orchestrator/k8s/phoenix/pvc.yaml
- [ ] T018 [US1] Update Mastra entrypoint.sh to configure OTEL exporter when PHOENIX_ENABLED=true in sandbox/mastra/entrypoint.sh
- [ ] T019 [US1] Create Mastra telemetry configuration template in experiments/lib/mastra-telemetry.ts
- [ ] T020 [US1] Write unit tests for telemetry configuration in experiments/lib/mastra-telemetry.test.ts

---

## Phase 4: User Story 2 - Enable/Disable Phoenix Per Session (P1)

**Goal**: Per-session Phoenix enablement via project environment configuration

**Independent Test**: Create two sessions - one with Phoenix enabled, one without - verify correct container behavior.

**Acceptance Criteria**:
1. Phoenix container starts when phoenix_enabled=true for environment
2. No Phoenix container when Phoenix not enabled
3. Phoenix UI accessible for enabled sessions

### Tasks

- [ ] T021 [US2] Modify SandboxService to read .mastragen/config.yaml and check components.phoenix.enabled in orchestrator/src/services/sandbox.ts
- [ ] T022 [US2] Add Phoenix container to containers array when enabled in SandboxService in orchestrator/src/services/sandbox.ts
- [ ] T023 [US2] Inject PHOENIX_ENABLED and PHOENIX_ENDPOINT into Mastra container in orchestrator/src/services/sandbox.ts
- [ ] T024 [US2] Populate phoenix URL in ServiceUrls when Phoenix enabled in orchestrator/src/services/sandbox.ts
- [ ] T025 [P] [US2] Modify K8sSandboxService to read .mastragen/config.yaml and add Phoenix container when enabled in orchestrator/src/services/k8s-sandbox.ts
- [ ] T026 [P] [US2] Add Caddyfile entry for Phoenix port 6006 with Tailscale TLS in orchestrator/src/services/k8s-sandbox.ts
- [ ] T027 [US2] Write unit tests for SandboxService Phoenix integration in orchestrator/tests/unit/services/sandbox-phoenix.test.ts
- [ ] T028 [P] [US2] Write unit tests for K8sSandboxService Phoenix integration in orchestrator/tests/unit/services/k8s-sandbox-phoenix.test.ts
- [ ] T029 [US2] Write integration tests for session lifecycle with Phoenix in orchestrator/tests/integration/phoenix-session.test.ts

---

## Phase 5: User Story 3 - Run Experiments Against Datasets (P2)

**Goal**: Systematic testing of Mastra agents via experiment framework

**Independent Test**: Create dataset in Phoenix, run experiment via CLI, view results in Phoenix UI.

**Acceptance Criteria**:
1. Experiments execute each test case against specified Mastra agent
2. Results show pass/fail status, evaluator scores, and trace links
3. Scores are aggregated for comparison

### Tasks

- [ ] T030 [US3] Create Phoenix client wrapper in experiments/lib/phoenix.ts
- [ ] T031 [US3] Create Mastra HTTP client for agents, workflows, tools in experiments/lib/mastra.ts
- [ ] T032 [US3] Create core types (DatasetExample, EvaluationResult, Task, Evaluator) in experiments/lib/types.ts
- [ ] T033 [US3] Implement experiment runner orchestration in experiments/lib/runner.ts
- [ ] T034 [US3] Create accuracy evaluator template in experiments/evaluators/accuracy.ts
- [ ] T035 [P] [US3] Create relevance evaluator template in experiments/evaluators/relevance.ts
- [ ] T036 [US3] Create example workflow task in experiments/tasks/example-workflow.ts
- [ ] T037 [US3] Implement CLI with --list-datasets, --list-tasks, --dataset, --task flags in experiments/cli.ts
- [ ] T038 [US3] Implement CLI --results flag for experiment results in experiments/cli.ts
- [ ] T039 [US3] Create experiments/package.json with dependencies and scripts in experiments/package.json
- [ ] T040 [P] [US3] Create experiments/tsconfig.json in experiments/tsconfig.json
- [ ] T041 [US3] Write unit tests for experiment runner in experiments/lib/runner.test.ts
- [ ] T042 [P] [US3] Write unit tests for Mastra HTTP client in experiments/lib/mastra.test.ts

---

## Phase 6: User Story 4 - Manage Prompts with Version Control (P2)

**Goal**: Versioned prompt management with Phoenix and local fallback

**Independent Test**: Create prompt in Phoenix, tag version, verify agent retrieves tagged version.

**Acceptance Criteria**:
1. New versions created on prompt updates, previous versions accessible
2. Agents retrieve prompts by tag (e.g., "production")
3. Graceful fallback to local file when Phoenix unavailable

### Tasks

- [ ] T043 [US4] Implement prompt client with fetchPrompt(name, tag, localFallback) in experiments/lib/prompt-client.ts
- [ ] T044 [US4] Add Phoenix unavailable fallback logic to prompt client in experiments/lib/prompt-client.ts
- [ ] T045 [US4] Write unit tests for prompt client including fallback scenarios in experiments/lib/prompt-client.test.ts

---

## Phase 7: User Story 5 - Generate Synthetic Test Data (P3)

**Goal**: Generate diverse test cases from personas and Mastra artifact metadata

**Independent Test**: Author personas, run generator, verify dataset created with diverse examples.

**Acceptance Criteria**:
1. Dataset created with examples distributed across personas
2. Each example includes persona ID and rationale
3. Distribution: ~50% normal, ~30% edge, ~20% stress cases

### Tasks

- [ ] T046 [US5] Implement Mastra artifact metadata extractor in experiments/lib/artifact-extractor.ts
- [ ] T047 [US5] Implement synthetic data generator using Claude Opus in experiments/lib/synthetic-generator.ts
- [ ] T048 [US5] Create persona index and types in experiments/personas/index.ts
- [ ] T049 [P] [US5] Create personas README with authoring guidelines in experiments/personas/README.md
- [ ] T050 [US5] Add generate-synthetic CLI command with --personas, --artifact, --name, --count flags in experiments/cli.ts
- [ ] T051 [US5] Write unit tests for artifact extractor in experiments/lib/artifact-extractor.test.ts
- [ ] T052 [P] [US5] Write unit tests for synthetic generator in experiments/lib/synthetic-generator.test.ts

---

## Phase 8: User Story 6 - Analyze Experiment Failures (P3)

**Goal**: Transform experiment failures into actionable insights via grounded theory analysis

**Independent Test**: Run error analysis on completed experiment, verify taxonomy and improvement plan generated.

**Acceptance Criteria**:
1. Open coding produces descriptive observations for each failure
2. Axial coding groups observations into 5-10 thematic categories
3. Improvement plan ranks categories by impact with suggested fixes

### Tasks

- [ ] T053 [US6] Implement open coding phase (failure -> descriptive observation) in experiments/lib/error-analysis.ts
- [ ] T054 [US6] Implement axial coding phase (observations -> thematic categories) in experiments/lib/error-analysis.ts
- [ ] T055 [US6] Implement improvement plan generation (categories -> prioritized fixes) in experiments/lib/error-analysis.ts
- [ ] T056 [US6] Add analyze-errors CLI command with --experiment, --output flags in experiments/cli.ts
- [ ] T057 [US6] Write unit tests for error analysis workflow in experiments/lib/error-analysis.test.ts

---

## Phase 9: User Story 7 - Export Handoff Artifacts (P3)

**Goal**: Export complete package for engineering handoff

**Independent Test**: Run export command, verify all expected files present with correct content.

**Acceptance Criteria**:
1. Export includes experiment metadata, run results, dataset, and prompts
2. If synthetic data used, includes persona definitions and generation metadata
3. If error analysis performed, includes taxonomy and improvement plan

### Tasks

- [ ] T058 [US7] Implement handoff export with experiment, dataset, prompt data in experiments/lib/handoff-export.ts
- [ ] T059 [US7] Add export-handoff CLI command with --experiment, --output flags in experiments/cli.ts
- [ ] T060 [US7] Generate README.md with package summary in export in experiments/lib/handoff-export.ts
- [ ] T061 [US7] Write unit tests for handoff export in experiments/lib/handoff-export.test.ts

---

## Phase 10: Polish & Cross-Cutting Concerns

**Goal**: Documentation, final integration, and cross-cutting tests

- [ ] T062 Update orchestrator README with Phoenix setup instructions in orchestrator/README.md
- [ ] T063 [P] Create experiments README with usage guide in experiments/README.md
- [ ] T064 Add Phoenix-related environment variables to .env.example in orchestrator/.env.example
- [ ] T065 Write end-to-end integration test for Phoenix session lifecycle in orchestrator/tests/integration/phoenix-e2e.test.ts
- [ ] T065a Write integration test for graceful degradation when Phoenix fails to start in orchestrator/tests/integration/phoenix-degradation.test.ts
- [ ] T065b [P] Write integration test for experiment continuation when Phoenix unreachable mid-run in experiments/tests/integration/phoenix-unreachable.test.ts
- [ ] T066 [P] Write end-to-end integration test for experiment workflow in experiments/tests/integration/experiment-e2e.test.ts
- [ ] T067 Run preflight checks and fix any type errors

---

## Dependencies

### User Story Completion Order

```
Phase 2 (Foundational)
        │
        ▼
┌───────┴───────┐
│               │
▼               ▼
US1 (P1)       US2 (P1)    ← Can be parallel after Phase 2
Traces         Session
│               │
└───────┬───────┘
        │
        ▼
┌───────┴───────┐
│               │
▼               ▼
US3 (P2)       US4 (P2)    ← Can be parallel after US1+US2
Experiments    Prompts
│               │
└───────┬───────┘
        │
        ▼
┌───────┼───────┐
│       │       │
▼       ▼       ▼
US5    US6     US7         ← Can be parallel after US3+US4
Synth  Errors  Export
```

### Task Dependencies

- T005-T010 (Foundational) blocks all user story phases
- US1 (T012-T020) and US2 (T021-T029) can run in parallel after Foundational
- US3 (T030-T042) requires US1 and US2 complete
- US4 (T043-T045) requires US1 complete
- US5 (T046-T052) requires US3 complete (uses experiment framework)
- US6 (T053-T057) requires US3 complete (analyzes experiment results)
- US7 (T058-T061) requires US3 complete (exports experiment data)
- Phase 10 (T062-T067) runs after all user stories

---

## Parallel Execution Opportunities

### Phase 2 (Foundational)
- T009 and T010 can run in parallel (independent: tests vs docs)

### Phase 3 (US1)
- T015, T016, T017 can run in parallel (independent K8s manifests)

### Phase 4 (US2)
- T025+T026 can run in parallel with T021-T024 (K8s vs Docker paths)
- T027 and T028 can run in parallel (independent test files)

### Phase 5 (US3)
- T034 and T035 can run in parallel (independent evaluators)
- T040 can run in parallel with other tasks
- T041 and T042 can run in parallel (independent test files)

### Phase 7 (US5)
- T049 can run in parallel with T046-T048
- T051 and T052 can run in parallel (independent test files)

### Phase 10 (Polish)
- T062 and T063 can run in parallel (independent docs)
- T065 and T066 can run in parallel (independent test files)

---

## Implementation Strategy

### MVP Scope (Sprint 1)

**Minimum viable Phoenix integration**:
- Phase 1: Setup
- Phase 2: Foundational
- Phase 3: US1 (Traces)
- Phase 4: US2 (Session enablement)

**Deliverables**: Trace visibility in Phoenix UI for Phoenix-enabled sessions.

### Sprint 2

- Phase 5: US3 (Experiments)
- Phase 6: US4 (Prompts)

**Deliverables**: Experiment framework, prompt versioning with fallback.

### Sprint 3

- Phase 7: US5 (Synthetic data)
- Phase 8: US6 (Error analysis)
- Phase 9: US7 (Handoff export)
- Phase 10: Polish

**Deliverables**: Complete feature set with documentation.

---

## Verification Checklist

### Per-Phase Verification

| Phase | Verification |
|-------|-------------|
| 2 | Run config parser tests, verify schema validates sample config |
| 3 | Start Phoenix with docker compose --profile phoenix, access UI at :6006 |
| 4 | Create session with .mastragen/config.yaml phoenix enabled, verify Phoenix container runs |
| 5 | Create dataset, run experiment, view results in Phoenix |
| 6 | Store prompt in Phoenix, retrieve by tag, verify fallback |
| 7 | Generate synthetic dataset, verify persona distribution |
| 8 | Run error analysis, review taxonomy and improvement plan |
| 9 | Export handoff, verify all files present |
| 10 | Run preflight, all tests pass |

### Success Criteria (from spec.md)

- [ ] SC-001: Traces visible within 30 seconds
- [ ] SC-002: Session creation <5s overhead with Phoenix
- [ ] SC-003: 100 test case experiments complete <10 minutes
- [ ] SC-004: 95% prompt retrieval <500ms when healthy
- [ ] SC-005: Synthetic data matches persona distribution (±10%)
- [ ] SC-006: 90%+ failures categorized (error analysis)
- [ ] SC-007: Handoff export <60 seconds for 1000 runs
- [ ] SC-008: Phoenix uses <512MB memory, <1 CPU
- [ ] SC-009: No performance degradation when Phoenix disabled
- [ ] SC-010: Retention policies clean old traces
