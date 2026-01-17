# Tasks: Core Platform Foundation (Phase 1)

**Input**: Design documents from `/specs/001-core-platform-foundation/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/sessions.yaml, research.md

**Tests**: Following TDD principles - write tests FIRST, ensure they FAIL, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
```
mastragen-001-core-platform-foundation/
├── orchestrator/           # Hono API service
│   ├── src/
│   │   ├── index.ts       # App entry point
│   │   ├── config.ts      # Configuration
│   │   ├── db/            # Database (Kysely + SQLite)
│   │   ├── repositories/  # Data access layer
│   │   ├── services/      # Business logic
│   │   └── routes/        # API routes
│   └── tests/
├── sandbox/               # Container images
│   ├── cui/
│   ├── mastra/
│   ├── astro/
│   └── code-server/
├── fixtures/              # Test fixtures
│   └── test-project/
└── docker-compose.yml
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project directory structure per plan.md layout
- [ ] T002 Initialize Bun project with package.json in orchestrator/package.json
- [ ] T003 [P] Configure TypeScript with strict mode in orchestrator/tsconfig.json
- [ ] T004 [P] Install dependencies: hono, kysely, better-sqlite3, dockerode, nanoid in orchestrator/
- [ ] T005 [P] Install dev dependencies: bun-types, @types/better-sqlite3, @types/dockerode in orchestrator/
- [ ] T006 [P] Configure ESLint and Prettier in orchestrator/
- [ ] T007 Create .env.example with GITHUB_TOKEN, ANTHROPIC_API_KEY, and AWS_* placeholders in project root
- [ ] T008 Create .gitignore with node_modules, data/*.db, .env patterns

---

## Phase 2: Foundational (Database Layer)

**Purpose**: Core database infrastructure that MUST be complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

### Tests for Database Layer

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] Write migration tests for initial schema in orchestrator/tests/db/migrations.test.ts
- [ ] T010 [P] Write unit tests for projects repository in orchestrator/tests/repositories/projects.test.ts
- [ ] T011 [P] Write unit tests for sessions repository in orchestrator/tests/repositories/sessions.test.ts

### Implementation for Database Layer

- [ ] T012 Define Database, ProjectsTable, ProjectEnvironmentsTable, SessionsTable types in orchestrator/src/db/types.ts
- [ ] T013 [P] Create Kysely database connection factory in orchestrator/src/db/index.ts
- [ ] T014 Create initial migration with projects, project_environments, sessions tables in orchestrator/src/db/migrations/001_initial.ts
- [ ] T015 [P] Implement ProjectsRepository with CRUD operations in orchestrator/src/repositories/projects.ts
- [ ] T016 [P] Implement SessionsRepository with CRUD and state transitions in orchestrator/src/repositories/sessions.ts
- [ ] T017 Create repository barrel export in orchestrator/src/repositories/index.ts
- [ ] T018 Create configuration module with env vars and defaults in orchestrator/src/config.ts
- [ ] T019 Run tests to verify database layer (T009-T011 should now pass)

**Checkpoint**: Database layer complete - API implementation can begin

---

## Phase 3: User Story 1 - Create Development Session (Priority: P1)

**Goal**: Developer can create a new session and receive sandbox URLs

**Independent Test**: POST /sessions creates a session, starts sandbox containers, returns service URLs

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T020 [P] [US1] Write contract test for POST /sessions in orchestrator/tests/routes/sessions.test.ts
- [ ] T021 [P] [US1] Write unit tests for SandboxService.create() in orchestrator/tests/services/sandbox.test.ts
- [ ] T022 [P] [US1] Write health route tests in orchestrator/tests/routes/health.test.ts

### Implementation for User Story 1 - API Layer

- [ ] T023 [US1] Create Hono app entry point in orchestrator/src/index.ts
- [ ] T024 [P] [US1] Implement GET /health route in orchestrator/src/routes/health.ts
- [ ] T025 [US1] Implement POST /sessions route in orchestrator/src/routes/sessions.ts
- [ ] T026 [US1] Create routes barrel export in orchestrator/src/routes/index.ts

### Implementation for User Story 1 - Sandbox Service

- [ ] T027 [US1] Implement SandboxService with Docker container management (pass GITHUB_TOKEN to containers) in orchestrator/src/services/sandbox.ts
- [ ] T028 [P] [US1] Implement HealthService for checking container health in orchestrator/src/services/health.ts
- [ ] T029 [US1] Create services barrel export in orchestrator/src/services/index.ts

### Implementation for User Story 1 - Container Images

- [ ] T030 [P] [US1] Create cui Dockerfile with bun + cui-server in sandbox/cui/Dockerfile
- [ ] T031 [P] [US1] Create cui entrypoint script (configure git credentials from GITHUB_TOKEN) in sandbox/cui/entrypoint.sh
- [ ] T032 [P] [US1] Create mastra Dockerfile with bun in sandbox/mastra/Dockerfile
- [ ] T033 [P] [US1] Create mastra entrypoint script in sandbox/mastra/entrypoint.sh
- [ ] T034 [P] [US1] Create astro Dockerfile with node in sandbox/astro/Dockerfile
- [ ] T035 [P] [US1] Create astro entrypoint script in sandbox/astro/entrypoint.sh
- [ ] T036 [P] [US1] Create code-server Dockerfile in sandbox/code-server/Dockerfile
- [ ] T037 [P] [US1] Create code-server lazy-start script in sandbox/code-server/lazy-start.sh

### Implementation for User Story 1 - Docker Compose

- [ ] T038 [US1] Create docker-compose.yml with orchestrator service
- [ ] T039 [P] [US1] Create docker-compose.override.yml for local development
- [ ] T040 [P] [US1] Create test project fixture in fixtures/test-project/
- [ ] T041 [US1] Run tests to verify US1 (T020-T022 should now pass)

**Checkpoint**: User Story 1 complete - can create sessions and access sandbox services

---

## Phase 4: User Story 2 - Suspend and Resume Session (Priority: P2)

**Goal**: Developer can suspend active sessions and resume suspended sessions

**Independent Test**: POST /sessions/{id}/suspend stops containers (preserves volume), POST /sessions/{id}/resume restarts with same data

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T042 [P] [US2] Write contract test for POST /sessions/{id}/suspend in orchestrator/tests/routes/sessions.test.ts
- [ ] T043 [P] [US2] Write contract test for POST /sessions/{id}/resume in orchestrator/tests/routes/sessions.test.ts
- [ ] T044 [P] [US2] Write unit tests for SandboxService.suspend() (verify git commit) and SandboxService.resume() in orchestrator/tests/services/sandbox.test.ts

### Implementation for User Story 2

- [ ] T045 [US2] Implement POST /sessions/{id}/suspend route in orchestrator/src/routes/sessions.ts
- [ ] T046 [US2] Implement POST /sessions/{id}/resume route in orchestrator/src/routes/sessions.ts
- [ ] T047 [US2] Implement SandboxService.suspend() method (local git commit before stopping containers) in orchestrator/src/services/sandbox.ts
- [ ] T048 [US2] Implement SandboxService.resume() method in orchestrator/src/services/sandbox.ts
- [ ] T049 [US2] Run tests to verify US2 (T042-T044 should now pass)

**Checkpoint**: User Story 2 complete - can suspend and resume sessions

---

## Phase 5: User Story 3 - Access Multiple Services (Priority: P2)

**Goal**: Developer can access cui, Mastra, Astro, and VS Code through separate URLs

**Independent Test**: GET /sessions/{id} returns URLs for all active services; each URL responds to health checks

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T050 [P] [US3] Write contract test for GET /sessions/{id} with URLs in orchestrator/tests/routes/sessions.test.ts
- [ ] T051 [P] [US3] Write integration tests for service URL generation in orchestrator/tests/services/sandbox.test.ts

### Implementation for User Story 3

- [ ] T052 [US3] Implement GET /sessions/{id} route returning SessionWithUrls in orchestrator/src/routes/sessions.ts
- [ ] T053 [US3] Add URL generation logic to SandboxService in orchestrator/src/services/sandbox.ts
- [ ] T054 [US3] Implement per-service health check in HealthService in orchestrator/src/services/health.ts
- [ ] T055 [US3] Run tests to verify US3 (T050-T051 should now pass)

**Checkpoint**: User Story 3 complete - all four services accessible via URLs

---

## Phase 6: User Story 4 - List My Sessions (Priority: P3)

**Goal**: Developer can see all their sessions with current state

**Independent Test**: GET /sessions returns array of sessions filtered by state/projectId

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T056 [P] [US4] Write contract tests for GET /sessions with filters in orchestrator/tests/routes/sessions.test.ts

### Implementation for User Story 4

- [ ] T057 [US4] Implement GET /sessions route with state and projectId query params in orchestrator/src/routes/sessions.ts
- [ ] T058 [US4] Add findAll with filters to SessionsRepository in orchestrator/src/repositories/sessions.ts
- [ ] T059 [US4] Run tests to verify US4 (T056 should now pass)

**Checkpoint**: User Story 4 complete - can list and filter sessions

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing and validation

### Integration & E2E Tests

- [ ] T060 [P] Write sandbox image build tests in orchestrator/tests/integration/sandbox-images.test.ts
- [ ] T061 [P] Write Docker Compose integration tests in orchestrator/tests/integration/docker-compose.test.ts
- [ ] T062 Write session lifecycle E2E test (create → suspend → resume → list) in orchestrator/tests/e2e/session-lifecycle.test.ts

### Validation

- [ ] T063 Run quickstart.md validation flow manually
- [ ] T064 Verify success criteria SC-001 through SC-006 from plan.md
- [ ] T065 Code cleanup and TypeScript strict mode compliance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase
  - US1 must complete before US2 (suspend/resume needs sessions to exist)
  - US3 can run parallel to US2 (different endpoints)
  - US4 can run parallel to US2/US3 (independent endpoint)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

| Story | Can Start After | Dependencies |
|-------|-----------------|--------------|
| US1 (P1) | Phase 2 | None - core functionality |
| US2 (P2) | US1 complete | Needs sessions to suspend/resume |
| US3 (P2) | Phase 2 | Can parallel with US2 |
| US4 (P3) | Phase 2 | Can parallel with US2/US3 |

### Within Each User Story (TDD Order)

1. Write tests FIRST (all tests marked [P] can run in parallel)
2. Run tests - they MUST FAIL
3. Implement models/types
4. Implement services
5. Implement routes
6. Run tests - they MUST PASS
7. Commit checkpoint

### Parallel Opportunities

**Phase 1 (all [P] tasks):**
```
T003, T004, T005, T006 (parallel setup tasks)
```

**Phase 2 (tests in parallel, then implementation):**
```
T009, T010, T011 (parallel test writing)
T013, T015, T016 (parallel implementation after T012)
```

**Phase 3 - US1 (container images in parallel):**
```
T020, T021, T022 (parallel test writing)
T030-T037 (all container Dockerfiles in parallel)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (database layer)
3. Complete Phase 3: US1 - Create Session
4. **STOP and VALIDATE**: `docker compose up -d` and create a test session
5. Verify cui, mastra, astro, vscode URLs work

### Incremental Delivery

| Increment | What's Delivered | Validation |
|-----------|------------------|------------|
| MVP | Create sessions, access services | curl POST /sessions, access URLs |
| +US2 | Suspend/resume sessions | curl suspend/resume, verify data preserved |
| +US3 | Multi-service health checks | GET /sessions/{id}, verify all URLs |
| +US4 | List sessions | GET /sessions?state=active |
| +Polish | E2E tests, docs | Full test suite passes |

### Success Criteria Mapping

| Criteria | Task Coverage |
|----------|---------------|
| SC-001: Session < 2 min | T027, T030-T037 (sandbox optimization) |
| SC-002: 4 services healthy | T028, T054 (health checks) |
| SC-003: File sync < 5s | T038 (shared volume config) |
| SC-004: Suspend/resume works | T047, T048 (suspend/resume logic) |
| SC-005: Memory < 8GB | T030-T037 (slim base images) |
| SC-006: API < 90s | T027 (container parallelization) |

---

## Notes

- All tests follow TDD: write test → watch fail → implement → watch pass
- [P] tasks = different files, safe to parallelize
- [Story] label maps task to user story for traceability
- Commit after each phase checkpoint
- Stop at any checkpoint to validate independently
- Container images use slim base images per Constitution Principle V (Simplicity First)
