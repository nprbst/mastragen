# Tasks: Git & Multi-Project Support

**Input**: Design documents from `/specs/002-git-multi-project/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, contracts/sessions-git-api.yaml, quickstart.md

**Tests**: Following TDD approach per CLAUDE.md - tests written before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `orchestrator/src/`, `orchestrator/tests/` for API server
- Paths follow structure defined in plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and configuration

- [ ] T001 Install @octokit/rest and @octokit/auth-app dependencies in orchestrator/package.json
- [ ] T002 [P] Add GitHub App configuration to orchestrator/src/config.ts (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID)
- [ ] T003 [P] Add GitShaSchema and UserIdSchema to orchestrator/src/schemas/common.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [ ] T004 Create database migration orchestrator/src/db/migrations/002_git_fields.ts adding user_id, branch_name, last_commit_sha, commit_count, pr_number, pr_url columns to sessions table
- [ ] T005 Update SessionsTable interface in orchestrator/src/db/types.ts with new git fields (user_id, branch_name, last_commit_sha, commit_count, pr_number, pr_url)
- [ ] T006 Extend state check constraint to include 'active', 'suspended', 'pr_open', 'closed' in migration

### GitService (Core Git Operations)

- [ ] T007 Write failing unit tests for GitService in orchestrator/tests/services/git.test.ts covering getStatus, commitAll, createBranch, push, clone, checkout, ensureGitAttributes
- [ ] T008 Create GitService class in orchestrator/src/services/git.ts with Docker exec implementation for git operations
- [ ] T009 Implement GitService.getStatus() to check for uncommitted changes via Docker exec
- [ ] T010 Implement GitService.commitAll(message) to stage all changes and commit
- [ ] T011 [P] Implement GitService.createBranch(name, base) and GitService.checkout(ref)
- [ ] T012 [P] Implement GitService.push(branch) and GitService.clone(repoUrl, branch)
- [ ] T013 Implement GitService.ensureGitAttributes() to add .cui/ export-ignore

### GitHubService (GitHub API)

- [ ] T014 Write failing unit tests for GitHubService in orchestrator/tests/services/github.test.ts with mocked Octokit
- [ ] T015 Create GitHubService class in orchestrator/src/services/github.ts with App authentication
- [ ] T016 Implement GitHubService.checkUserPermissions(owner, repo, username) returning RepoPermissions
- [ ] T017 [P] Implement GitHubService.getCloneUrl(owner, repo) with App token
- [ ] T018 [P] Implement GitHubService.parseRepo(githubRepo) static method to extract owner/repo
- [ ] T019 Implement rate limit handling with exponential backoff (max 3 attempts over ~30s)

### Error Classes

- [ ] T020 [P] Create GitOperationError, GitHubAPIError, InsufficientPermissionsError, SessionLockError error classes in orchestrator/src/services/sandbox.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Suspend Session with Work Preservation (Priority: P1) MVP

**Goal**: Users can suspend sessions and have all work automatically committed and pushed to git branch

**Independent Test**: Create session, make changes, suspend, verify changes exist in git branch on GitHub

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T021 [P] [US1] Write contract test for POST /sessions/:id/suspend in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T022 [P] [US1] Write integration test for suspend workflow (changes → commit → push) in orchestrator/tests/routes/sessions-git.test.ts

### Implementation for User Story 1

- [ ] T023 [US1] Add SuspendSessionResponseSchema to orchestrator/src/schemas/sessions.ts with git fields (branchName, lastCommitSha, commitCount)
- [ ] T024 [US1] Add updateGitState method to orchestrator/src/repositories/sessions.ts for updating last_commit_sha and commit_count
- [ ] T025 [US1] Implement suspendWithGit method in orchestrator/src/services/sandbox.ts that calls GitService.getStatus, commitAll, push
- [ ] T026 [US1] Enhance POST /sessions/:id/suspend handler in orchestrator/src/routes/sessions.ts to use suspendWithGit
- [ ] T027 [US1] Handle "no changes" case - suspend gracefully without empty commit
- [ ] T028 [US1] Add error handling for git operation failures with retry logic

**Checkpoint**: User Story 1 should be fully functional - users can suspend sessions with work preserved

---

## Phase 4: User Story 2 - Resume Suspended Session (Priority: P1)

**Goal**: Users can resume suspended sessions and continue exactly where they left off with code and history intact

**Independent Test**: Resume a suspended session, verify workspace matches last commit, conversation history restored

### Tests for User Story 2

- [ ] T029 [P] [US2] Write contract test for POST /sessions/:id/resume in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T030 [P] [US2] Write integration test for resume workflow (clone → start containers → restore .cui/) in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T031 [P] [US2] Write test for resume from specific commit SHA

### Implementation for User Story 2

- [ ] T032 [US2] Add ResumeSessionRequestSchema to orchestrator/src/schemas/sessions.ts with optional commitSha field
- [ ] T033 [US2] Add SessionWithUrlsResponseSchema to orchestrator/src/schemas/sessions.ts
- [ ] T034 [US2] Implement resumeWithGit method in orchestrator/src/services/sandbox.ts that clones branch and starts containers
- [ ] T035 [US2] Add single-pod lock check in resumeWithGit to prevent concurrent access (return 409 if session already active)
- [ ] T036 [US2] Implement resume from specific commitSha when provided in request
- [ ] T037 [US2] Enhance POST /sessions/:id/resume handler in orchestrator/src/routes/sessions.ts to use resumeWithGit
- [ ] T038 [US2] Implement .cui/ history restoration from mastraPath/.cui/ directory

**Checkpoint**: User Stories 1 AND 2 work together - full suspend/resume cycle functional

---

## Phase 5: User Story 3 - Create Session for Any Configured Project (Priority: P2)

**Goal**: Users can create sessions for any of their configured projects with correct workspace structure

**Independent Test**: Configure two different projects, create sessions for each, verify correct workspace structure

### Tests for User Story 3

- [ ] T039 [P] [US3] Write contract test for POST /sessions with userId in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T040 [P] [US3] Write integration test for session creation with branch creation workflow
- [ ] T041 [P] [US3] Write test for permission verification (403 when user lacks write access)

### Implementation for User Story 3

- [ ] T042 [US3] Extend CreateSessionRequestSchema in orchestrator/src/schemas/sessions.ts to require userId field
- [ ] T043 [US3] Add permission check to session creation using GitHubService.checkUserPermissions
- [ ] T044 [US3] Implement branch name generation: {branchPrefix}{userId}/{artifactName}-{sessionId}
- [ ] T045 [US3] Enhance SandboxService.create in orchestrator/src/services/sandbox.ts to create git branch via GitHubService
- [ ] T046 [US3] Clone branch in init container during session creation
- [ ] T047 [US3] Conditionally start Astro container only when project.uiSandboxPath is configured
- [ ] T048 [US3] Start Mastra service from project.mastraPath directory

**Checkpoint**: User Story 3 functional - multi-project sessions work with correct configuration

---

## Phase 6: User Story 4 - Create Pull Request from Session (Priority: P2)

**Goal**: Users can create PRs from sessions to merge work into main codebase

**Independent Test**: Create PR from session with commits, verify PR appears on GitHub with correct target branch

### Tests for User Story 4

- [ ] T049 [P] [US4] Write contract test for POST /sessions/:id/pull-request in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T050 [P] [US4] Write integration test for PR creation workflow (suspend if active → create PR → update state)
- [ ] T051 [P] [US4] Write test for PR with custom title and description

### Implementation for User Story 4

- [ ] T052 [US4] Implement GitHubService.createPullRequest(input) in orchestrator/src/services/github.ts
- [ ] T053 [US4] Implement GitHubService.getPullRequest(owner, repo, prNumber) for PR status retrieval
- [ ] T054 [US4] Add CreatePRRequestSchema to orchestrator/src/schemas/sessions.ts with optional title and description
- [ ] T055 [US4] Add PullRequestResponseSchema to orchestrator/src/schemas/sessions.ts
- [ ] T056 [US4] Add updatePRState method to orchestrator/src/repositories/sessions.ts for pr_number and pr_url
- [ ] T057 [US4] Create POST /sessions/:id/pull-request handler in orchestrator/src/routes/sessions.ts
- [ ] T058 [US4] Handle active session for PR creation: commit changes, push to remote, stop containers (transition directly to pr_open, not through suspended)
- [ ] T059 [US4] Update session state to 'pr_open' after successful PR creation

**Checkpoint**: User Story 4 functional - full workflow from session to PR complete

---

## Phase 7: User Story 5 - Work with Monorepo Project (Priority: P3)

**Goal**: Monorepo projects work correctly with subdirectory paths for Mastra and Astro services

**Independent Test**: Create session for monorepo project, verify both services start from correct subdirectories

### Tests for User Story 5

- [ ] T060 [P] [US5] Write integration test for monorepo session with mastraPath and uiSandboxPath in orchestrator/tests/routes/sessions-git.test.ts
- [ ] T061 [P] [US5] Write test for commit including changes from both service directories
- [ ] T062 [P] [US5] Write test for uiSandboxTemplate initialization when directory is empty

### Implementation for User Story 5

- [ ] T063 [US5] Ensure git operations work across multiple subdirectories in monorepo structure
- [ ] T064 [US5] Verify suspend commits include changes from both mastraPath and uiSandboxPath directories
- [ ] T065 [US5] Implement uiSandboxTemplate initialization when uiSandboxPath is empty and template is configured
- [ ] T066 [US5] Update container startup to handle nested directory paths correctly

**Checkpoint**: All user stories complete - full feature functional

---

## Phase 8: E2E Tests & Polish

**Purpose**: End-to-end validation and cross-cutting concerns

### E2E Tests

- [ ] T067 Write E2E test for full lifecycle: create → modify → suspend → resume → PR in orchestrator/tests/e2e/git-workflow.test.ts
- [ ] T068 [P] Write E2E test for session lock conflict (409 on concurrent resume)
- [ ] T069 [P] Write E2E test for permission denied scenario (403 on session creation)

### Polish

- [ ] T070 [P] Review error messages for user-friendliness across all git operations
- [ ] T071 [P] Add logging for git operations (commit, push, clone timing)
- [ ] T072 Run quickstart.md validation - verify all documented workflows function correctly
- [ ] T073 Verify performance: suspend completes within 30s for typical workload (≤50 files, ≤5MB diff)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - US1 and US2 (P1) are highest priority
  - US3 and US4 (P2) can proceed after or in parallel with P1
  - US5 (P3) builds on US3 functionality
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Suspend)**: Requires Foundational - independent
- **US2 (Resume)**: Requires Foundational - independent (but naturally pairs with US1 for testing)
- **US3 (Multi-Project)**: Requires Foundational - independent
- **US4 (PR Creation)**: Requires Foundational, benefits from US1 (suspend logic)
- **US5 (Monorepo)**: Requires US3 (session creation with project config)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Schemas before handlers
- Repository methods before service methods
- Service methods before route handlers
- Core implementation before integration

### Parallel Opportunities

**Within Foundational Phase:**
```bash
# After T006, these can run in parallel:
Task: T007 + T014 (write test files for GitService and GitHubService)
Task: T011 + T012 (GitService branch/checkout and push/clone)
Task: T017 + T018 (GitHubService getCloneUrl and parseRepo)
```

**User Stories in Parallel:**
```bash
# After Foundational, US1-US4 can start in parallel:
Developer A: US1 (Suspend)
Developer B: US2 (Resume)
Developer C: US3 (Multi-Project)
Developer D: US4 (PR Creation)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T020)
3. Complete Phase 3: User Story 1 - Suspend (T021-T028)
4. Complete Phase 4: User Story 2 - Resume (T029-T038)
5. **STOP and VALIDATE**: Test full suspend/resume cycle
6. Deploy/demo if ready - users can persist their work!

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test suspend/resume → Deploy (MVP!)
3. Add US3 → Test multi-project → Deploy
4. Add US4 → Test PR creation → Deploy
5. Add US5 → Test monorepo → Deploy
6. Polish → Final validation

---

## Summary

| Phase | User Story | Tasks | Priority |
|-------|-----------|-------|----------|
| 1 | Setup | T001-T003 | - |
| 2 | Foundational | T004-T020 | - |
| 3 | US1: Suspend | T021-T028 | P1 |
| 4 | US2: Resume | T029-T038 | P1 |
| 5 | US3: Multi-Project | T039-T048 | P2 |
| 6 | US4: PR Creation | T049-T059 | P2 |
| 7 | US5: Monorepo | T060-T066 | P3 |
| 8 | E2E & Polish | T067-T073 | - |

**Total Tasks**: 73
**Parallel Opportunities**: 25 tasks marked [P]
**MVP Scope**: Phases 1-4 (38 tasks for suspend/resume)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
