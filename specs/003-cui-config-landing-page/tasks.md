# Tasks: cui Configuration & Landing Page (Phase 3)

**Input**: Design documents from `/specs/003-cui-config-landing-page/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md project structure:
- **Orchestrator (backend)**: `orchestrator/src/`
- **Landing Page (frontend)**: `landing-page/src/`
- **Commands**: `cui-commands/`
- **Skills**: `cui-skills/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create landing-page/ directory with Astro 5 + React 19 project structure per plan.md
- [X] T002 [P] Add dependencies to landing-page/package.json (Astro, React 19, TailwindCSS, oRPC client)
- [X] T003 [P] Configure TailwindCSS in landing-page/tailwind.config.mjs
- [X] T004 [P] Create cui-commands/ directory structure
- [X] T005 [P] Create cui-skills/ directory structure
- [X] T006 Create base Layout component in landing-page/src/layouts/Layout.astro
- [X] T007 Configure oRPC client in landing-page/src/lib/orpc-client.ts
- [X] T008 [P] Setup test infrastructure in orchestrator/tests/ (helpers, fixtures, test database)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T009 [P] Unit test for JWT validation middleware in orchestrator/tests/unit/middleware/auth.test.ts
- [X] T010 [P] Unit test for audit logger service in orchestrator/tests/unit/services/audit-logger.test.ts
- [X] T011 [P] Integration test for auth routes (login, callback, logout, me, refresh) in orchestrator/tests/integration/auth.test.ts
- [X] T011.1 [P] Unit test for GitHub webhook handler (installation events) in orchestrator/tests/unit/routes/webhooks.test.ts

### Implementation for Foundational

- [X] T012 Create database migration 003_cui_config in orchestrator/src/db/migrations/003_cui_config.ts
- [X] T013 Update database types in orchestrator/src/db/types.ts with new tables (users, github_app_installations, project_cui_config, project_commands, project_skills, session_shares)
- [X] T014 [P] Create users repository in orchestrator/src/repositories/users.ts
- [X] T015 [P] Create github_app_installations repository in orchestrator/src/repositories/github-app-installations.ts
- [X] T016 [P] Create session_shares repository in orchestrator/src/repositories/session-shares.ts
- [X] T017 Configure GitHub App OAuth in orchestrator/src/services/auth.ts (custom AuthService implementation)
- [X] T018 Create JWT validation middleware in orchestrator/src/middleware/auth.ts
- [X] T019 Create audit logger service in orchestrator/src/services/audit-logger.ts
- [X] T020 [P] Create Valibot schemas for auth in orchestrator/src/schemas/auth.ts
- [X] T021 [P] Create Valibot schemas for cui-config in orchestrator/src/schemas/cui-config.ts
- [X] T022 [P] Create Valibot schemas for commands in orchestrator/src/schemas/commands.ts
- [X] T023 [P] Create Valibot schemas for skills in orchestrator/src/schemas/skills.ts
- [X] T024 Setup oRPC router base in orchestrator/src/orpc/router.ts (stubs - handlers connect to routes)
- [X] T025 Register auth routes in orchestrator (GET /auth/login, GET /auth/callback, POST /auth/logout, GET /auth/me, POST /auth/refresh)
- [X] T025.1 [P] Create GitHub App installation routes (GET /auth/installations, GET /auth/installations/:id/repos) in orchestrator/src/routes/auth.ts
- [X] T025.2 Create GitHub webhook handler (POST /webhooks/github) for installation events in orchestrator/src/routes/webhooks.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Session Dashboard & Navigation (Priority: P1) 🎯 MVP

**Goal**: A developer can view all their sessions across projects, grouped by project, with status indicators and service links for active sessions.

**Independent Test**: Open landing page at localhost:3000, verify sessions display grouped by project with clickable service links.

### Tests for User Story 1

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T026 [P] [US1] Unit test for sessions list filtering in orchestrator/tests/unit/routes/sessions.test.ts
- [X] T027 [P] [US1] Integration test for GET /sessions with query params in orchestrator/tests/integration/sessions.test.ts

### Implementation for User Story 1

- [X] T028 [US1] Create dashboard page in landing-page/src/pages/index.astro
- [X] T029 [US1] Extend GET /sessions endpoint with dashboard query params (state, projectId, sharedWithMe, pagination) in orchestrator/src/routes/sessions.ts
- [X] T030 [P] [US1] Create SessionCard React component in landing-page/src/components/SessionCard.tsx
- [X] T031 [P] [US1] Create SessionList React component (interactive island) in landing-page/src/components/SessionList.tsx
- [X] T032 [P] [US1] Service links embedded in SessionCard.tsx (no separate ServiceLinks.astro needed)
- [X] T033 [US1] Add session grouping logic by project in SessionList component
- [X] T034 [US1] Add status indicators (Active, Suspended, PR Open) styling in SessionCard
- [X] T035 [US1] Implement "Shared with me" section in dashboard showing sessions shared by other users
- [X] T036 [US1] Create empty state with onboarding guidance and "Create your first session" CTA when user has no sessions (supports SC-005: 95% first-time success)
- [X] T037 [US1] Add session URLs for cui (:3001), Mastra (:4111), Astro (:4321), VS Code (:8080) in SessionCard

**Checkpoint**: Dashboard displays sessions grouped by project with service links - User Story 1 complete

---

## Phase 4: User Story 2 - Create New Session (Priority: P1) 🎯 MVP

**Goal**: A developer can create a new session by selecting a project, environment, and providing a session name, then be redirected to cui.

**Independent Test**: Fill out new session form, submit, verify sandbox provisions and redirects to cui URL.

### Tests for User Story 2

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T038 [P] [US2] Unit test for cui-injection service config generation in orchestrator/tests/unit/services/cui-injection.test.ts
- [~] T039 [P] [US2] Integration test for POST /sessions with cui config injection in orchestrator/tests/integration/sessions-create.test.ts (requires Docker environment for full test)

### Implementation for User Story 2

- [X] T040 [US2] Create new session page in landing-page/src/pages/sessions/new.astro
- [X] T041 [P] [US2] Create ProjectSelector React component in landing-page/src/components/ProjectSelector.tsx
- [X] T042 [P] [US2] Create EnvironmentSelector React component in landing-page/src/components/EnvironmentSelector.tsx
- [X] T043 [US2] Create NewSessionForm React component in landing-page/src/components/NewSessionForm.tsx
- [X] T044 [US2] Add GET /projects endpoint for user's accessible projects in orchestrator/src/routes/projects.ts
- [X] T045 [US2] Create project_cui_config repository in orchestrator/src/repositories/project-cui-config.ts (also used by US3)
- [X] T046 [US2] Create cui-injection service in orchestrator/src/services/cui-injection.ts
- [X] T047 [US2] Implement config file generation (settings.json at ~/.claude/settings.json, CLAUDE.md, commands) with env var interpolation (${VAR_NAME}) in cui-injection service
- [X] T048 [US2] Extend POST /sessions to inject cui config during sandbox provisioning in orchestrator/src/routes/sessions.ts
- [X] T049 [US2] Implement redirect to cui URL after successful session creation in NewSessionForm
- [X] T050 [US2] Add session-specific env vars injection (MASTRAGEN_SESSION_ID, MASTRAGEN_API_URL, MASTRAGEN_USER_TOKEN)
- [X] T051 [US2] Handle uiSandboxPath configuration - start Astro service only if configured
- [X] T051.1 [US2] Display error when project has no environments configured on new session form

**Checkpoint**: New sessions can be created with full cui config injection - User Story 2 complete

---

## Phase 5: User Story 6 - Authentication & Authorization (Priority: P2)

**Goal**: Users authenticate via GitHub App OAuth, receive JWT for API calls, and GitHub App installation-derived access controls project visibility.

**Independent Test**: Access landing page unauthenticated → redirected to GitHub OAuth → return with valid session and see only projects linked to repos where app is installed and user has access.

### Tests for User Story 6

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T052 [P] [US6] Unit test for GitHub installation-based project access in orchestrator/tests/unit/middleware/project-access.test.ts
- [X] T053 [P] [US6] Integration test for protected routes with GitHub installation access checks in orchestrator/tests/integration/project-access.test.ts

### Implementation for User Story 6

- [X] T054 [US6] Create auth callback page in landing-page/src/pages/auth/callback.astro
- [X] T055 [US6] Create login page with GitHub OAuth in landing-page/src/pages/auth/login.astro
- [X] T056 [US6] Add auth state management in landing-page/src/lib/auth.ts
- [X] T057 [US6] Implement protected route wrapper in landing-page/src/middleware/index.ts (Astro middleware)
- [X] T058 [US6] Add GitHub installation access check to all project-scoped routes in orchestrator/src/middleware/auth.ts
- [X] T059 [US6] Filter projects list by user's accessible GitHub installations in GET /projects
- [X] T060 [US6] Add structured audit logging for auth events (login, logout) in auth routes
- [X] T061 [P] [US6] Create Tailscale service for ACL management in orchestrator/src/services/tailscale.ts
- [X] T062 [US6] Implement Tailscale access control for session sandboxes based on user identity

**Checkpoint**: Full auth flow works with project-level access control - User Story 6 complete

---

## Phase 6: User Story 3 - Project Administration (Priority: P2)

**Goal**: Project admins can configure git settings, workspace structure, environments, cui config, commands, and skills.

**Independent Test**: Access /projects/:id as admin, modify cui config, verify changes persist and apply to new sessions.

### Tests for User Story 3

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T063 [P] [US3] Unit test for cui-config CRUD operations in orchestrator/tests/unit/routes/cui-config.test.ts
- [X] T064 [P] [US3] Unit test for commands CRUD operations in orchestrator/tests/unit/routes/commands.test.ts
- [X] T065 [P] [US3] Unit test for skills CRUD operations in orchestrator/tests/unit/routes/skills.test.ts
- [X] T066 [P] [US3] Integration test for project admin endpoints in orchestrator/tests/integration/project-admin.test.ts

### Implementation for User Story 3

- [X] T067 [US3] Create project admin page in landing-page/src/pages/projects/[id].astro
- [X] T068 [P] [US3] Create ProjectTabs React component in landing-page/src/components/ProjectTabs.tsx
- [X] T069 [P] [US3] Create OverviewTab React component in landing-page/src/components/admin/OverviewTab.tsx
- [X] T070 [P] [US3] Create EnvironmentsTab React component in landing-page/src/components/admin/EnvironmentsTab.tsx
- [X] T071 [P] [US3] Create CuiConfigTab React component in landing-page/src/components/admin/CuiConfigTab.tsx
- [X] T072 [P] [US3] Create SkillsTab React component in landing-page/src/components/admin/SkillsTab.tsx
- [X] T073 [P] [US3] Create AccessTab React component in landing-page/src/components/admin/AccessTab.tsx
- [X] T074 [US3] Create cui-config routes (GET, PUT, DELETE /projects/:projectId/cui-config) in orchestrator/src/routes/cui-config.ts
- [X] T075 [US3] Implement config preview endpoint (GET /projects/:projectId/cui-config/preview)
- [X] T076 [US3] Create project_commands repository in orchestrator/src/repositories/project-commands.ts
- [X] T077 [US3] Create commands routes (CRUD /projects/:projectId/commands) in orchestrator/src/routes/commands.ts
- [X] T078 [US3] Create project_skills repository in orchestrator/src/repositories/project-skills.ts
- [X] T079 [US3] Create skills routes (CRUD /projects/:projectId/skills) in orchestrator/src/routes/skills.ts
- [X] T080 [US3] Add admin role check middleware for project modification routes
- [X] T081 [US3] Implement MCP server configuration editor in CuiConfigTab
- [X] T082 [US3] Implement custom command editor with markdown preview in CuiConfigTab
- [X] T083 [US3] Implement auto-approve patterns editor in CuiConfigTab

**Checkpoint**: Project admins can fully configure projects - User Story 3 complete

---

## Phase 7: User Story 4 - Built-in Commands (Priority: P2)

**Goal**: Developers can use /suspend, /pr, /share, /extract, and /env commands in cui sessions.

**Independent Test**: In active session, run each command and verify expected behavior (state change, PR creation, share grant, info display).

### Tests for User Story 4

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T084 [P] [US4] Unit test for suspend logic (commit, push, terminate) in orchestrator/tests/unit/services/session-suspend.test.ts
- [X] T085 [P] [US4] Unit test for PR creation logic in orchestrator/tests/unit/services/session-pr.test.ts
- [X] T086 [P] [US4] Unit test for share logic (record + ACL update) in orchestrator/tests/unit/services/session-share.test.ts
- [X] T087 [P] [US4] Integration test for session action endpoints in orchestrator/tests/integration/session-actions.test.ts

### Implementation for User Story 4

- [X] T088 [US4] Create /suspend command markdown in cui-commands/suspend.md
- [X] T089 [P] [US4] Create /pr command markdown in cui-commands/pr.md
- [X] T090 [P] [US4] Create /share command markdown in cui-commands/share.md
- [X] T091 [P] [US4] Create /extract command markdown in cui-commands/extract.md
- [X] T092 [P] [US4] Create /env command markdown in cui-commands/env.md
- [X] T093 [US4] Create POST /sessions/:sessionId/suspend endpoint in orchestrator/src/routes/sessions.ts
- [X] T094 [US4] Implement suspend logic (commit all changes, push to remote, terminate sandbox, update state)
- [X] T095 [US4] Create POST /sessions/:sessionId/pr endpoint in orchestrator/src/routes/sessions.ts
- [X] T096 [US4] Implement PR creation via GitHub API with auto-generated description
- [X] T097 [US4] Create POST /sessions/:sessionId/share endpoint per sessions-extended contract
- [X] T098 [US4] Implement share logic (create share record, update Tailscale ACL)
- [X] T099 [US4] Create DELETE /sessions/:sessionId/share/:shareId endpoint for revoking access
- [X] T100 [US4] Create GET /sessions/:sessionId/shares endpoint to list active shares
- [X] T101 [US4] Extend GET /sessions/:sessionId with full session details for /env command
- [X] T102 [US4] Create POST /sessions/:sessionId/activity endpoint for activity tracking
- [X] T103 [US4] Add structured audit logging for security-sensitive actions (session share, PR creation)
- [X] T104 [US4] Update cui-injection service to inject built-in commands from cui-commands/

**Checkpoint**: All built-in commands functional - User Story 4 complete

---

## Phase 8: User Story 5 - Built-in Skills (Priority: P3)

**Goal**: Claude has access to built-in skills for Mastra development patterns, artifact extraction, and session management.

**Independent Test**: Ask Claude in session about Mastra tools, verify accurate guidance referencing skills.

### Tests for User Story 5

> **TDD**: Write these tests FIRST, ensure they FAIL before implementation

- [ ] T105 [P] [US5] Unit test for skills injection in cui-injection service in orchestrator/tests/unit/services/cui-injection-skills.test.ts

### Implementation for User Story 5

- [ ] T106 [US5] Create mastra-development skill in cui-skills/mastra-development.md (tool signatures, agent patterns, workflow composition, Mastra SDK usage)
- [ ] T107 [P] [US5] Create artifact-extraction skill in cui-skills/artifact-extraction.md (/extract workflow, artifact file structure, when to extract vs inline)
- [ ] T108 [P] [US5] Create session-management skill in cui-skills/session-management.md (git workflow, /suspend vs /pr decision tree, sharing best practices)
- [ ] T109 [US5] Update cui-injection service to inject built-in skills to /mnt/skills/project/

**Checkpoint**: Built-in skills available in all sessions - User Story 5 complete

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T110 [P] Create data retention cleanup job in orchestrator/src/jobs/session-cleanup.ts
- [ ] T111 Implement 90-day auto-deletion of inactive sessions (state: suspended/archived, last_activity_at < 90 days)
- [ ] T112 Delete git branches via GitHub API during cleanup
- [ ] T113 [P] Add database indexes per data-model.md (sessions_user_state_idx, sessions_activity_idx)
- [ ] T114 [P] Add pagination to SessionList with "Load more" functionality
- [ ] T115 Implement client-side caching with SWR in landing-page components
- [ ] T116 Add error handling for /suspend retry logic (push failures)
- [ ] T117 [P] Add loading states to all interactive components
- [ ] T118 [P] Add error boundaries to React islands
- [ ] T119 Run quickstart.md validation - verify all development commands work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-8)**: All depend on Foundational phase completion
  - US1 (Dashboard) and US2 (Create Session) can proceed in parallel as MVP
  - US6 (Auth) extends foundation but can proceed after Foundational
  - US3 (Project Admin), US4 (Commands), US5 (Skills) can proceed in parallel after Foundational
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 (Dashboard) | Foundational | US2, US6 |
| US2 (Create Session) | Foundational | US1, US6 |
| US6 (Auth) | Foundational (including T025.1, T025.2 for GitHub installations) | US1, US2 |
| US3 (Project Admin) | Foundational, US6 (for admin checks), T045 (cui-config repo) | US4, US5 |
| US4 (Commands) | US2 (cui-injection service) | US3, US5 |
| US5 (Skills) | US2 (cui-injection service) | US3, US4 |

### Within Each User Story

- **Tests FIRST** (TDD): Write failing tests before implementation
- Models/repositories before services
- Services before API routes
- API routes before frontend components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)** - run in parallel:
- T002, T003, T004, T005, T008 (dependencies, configs, dirs)

**Phase 2 (Foundational)** - run in parallel:
- T009, T010, T011, T011.1 (tests)
- T014, T015, T016 (repositories)
- T020, T021, T022, T023 (schemas)
- T025.1, T025.2 (GitHub installation routes and webhook handler)

**Phase 3 (US1)** - run in parallel:
- T026, T027 (tests)
- T030, T031, T032 (components)

**Phase 4 (US2)** - run in parallel:
- T038, T039 (tests)
- T041, T042 (selectors)

**Phase 5 (US6)** - run in parallel:
- T052, T053 (tests)

**Phase 6 (US3)** - run in parallel:
- T063, T064, T065, T066 (tests)
- T068, T069, T070, T071, T072, T073 (admin tabs)

**Phase 7 (US4)** - run in parallel:
- T084, T085, T086, T087 (tests)
- T089, T090, T091, T092 (command markdown files)

**Phase 8 (US5)** - run in parallel:
- T107, T108 (skill files)

---

## Parallel Example: MVP (US1 + US2)

```bash
# After Foundational phase completes, launch US1 and US2 tests in parallel:

# US1 Tests (parallel):
Task: "Unit test for sessions list filtering in orchestrator/tests/unit/routes/sessions.test.ts"
Task: "Integration test for GET /sessions with query params in orchestrator/tests/integration/sessions.test.ts"

# US2 Tests (parallel):
Task: "Unit test for cui-injection service config generation in orchestrator/tests/unit/services/cui-injection.test.ts"
Task: "Integration test for POST /sessions with cui config injection in orchestrator/tests/integration/sessions-create.test.ts"

# After tests written, launch components in parallel:

# US1 Dashboard components (parallel):
Task: "Create SessionCard React component in landing-page/src/components/SessionCard.tsx"
Task: "Create SessionList React component in landing-page/src/components/SessionList.tsx"
Task: "Create ServiceLinks Astro component in landing-page/src/components/ServiceLinks.astro"

# US2 Form components (parallel):
Task: "Create ProjectSelector React component in landing-page/src/components/ProjectSelector.tsx"
Task: "Create EnvironmentSelector React component in landing-page/src/components/EnvironmentSelector.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Dashboard) - tests first, then implementation
4. Complete Phase 4: User Story 2 (Create Session) - tests first, then implementation
5. **STOP and VALIDATE**: Test dashboard and session creation independently
6. Deploy/demo MVP - users can view sessions and create new ones

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Dashboard) + US2 (Create Session) → MVP deployed
3. Add US6 (Auth) → Secure multi-user access
4. Add US3 (Project Admin) → Self-service project config
5. Add US4 (Commands) → Full workflow (suspend, PR, share)
6. Add US5 (Skills) → Enhanced Claude guidance
7. Polish → Production-ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Dashboard) + US2 (Create Session) - MVP
   - Developer B: US6 (Auth) + US3 (Project Admin)
   - Developer C: US4 (Commands) + US5 (Skills)
3. Stories complete and integrate independently

---

## Summary

| Phase | Tasks | Test Tasks | Parallel Tasks | Story |
|-------|-------|------------|----------------|-------|
| Phase 1: Setup | T001-T008 | 0 | 5 | - |
| Phase 2: Foundational | T009-T025.2 | 4 | 11 | - |
| Phase 3: US1 Dashboard | T026-T037 | 2 | 5 | US1 (P1) |
| Phase 4: US2 Create Session | T038-T051 | 2 | 4 | US2 (P1) |
| Phase 5: US6 Auth | T052-T062 | 2 | 3 | US6 (P2) |
| Phase 6: US3 Project Admin | T063-T083 | 4 | 10 | US3 (P2) |
| Phase 7: US4 Commands | T084-T104 | 4 | 8 | US4 (P2) |
| Phase 8: US5 Skills | T105-T109 | 1 | 2 | US5 (P3) |
| Phase 9: Polish | T110-T119 | 0 | 5 | - |
| **Total** | **122 tasks** | **19 test tasks** | **53 parallel** | **6 stories** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Tests follow TDD: write tests first, ensure they fail, then implement
