# Implementation Plan: Git & Multi-Project Support

**Branch**: `002-git-multi-project` | **Date**: 2026-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-git-multi-project/spec.md`
**Status**: Phase 1 Complete

## Summary

This feature extends the existing session management system to persist session work as git branches, enabling suspend/resume with 100% data preservation and PR creation. The implementation adds GitService and GitHubService layers to the orchestrator, extends the sessions database schema with git fields, and enhances the suspend/resume/create endpoints to handle git operations.

## Technical Context

**Language/Version**: TypeScript (Bun runtime)
**Primary Dependencies**: Hono 4.6.0, Kysely 0.27.0, Valibot 1.2.0, Dockerode 4.0.0, @octokit/rest (new)
**Storage**: SQLite with Kysely (existing)
**Testing**: Bun test runner (existing)
**Target Platform**: Docker containers on Linux (macOS for dev)
**Project Type**: Monorepo with orchestrator/, cli/, sandbox/ packages
**Performance Goals**: <30s suspend for ≤50 files, ≤5MB diff (SC-005)
**Constraints**: 99% resume success rate (SC-004), single-pod session lock
**Scale/Scope**: 5+ projects with varying repo structures (SC-002)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Git-Native Persistence | ✅ PASS | Core feature - all session state persists as git branches/commits |
| II. Session Isolation | ✅ PASS | One pod per session (existing), single-pod lock enforced |
| III. Multi-Service Architecture | ✅ PASS | 4 ports preserved, shared /workspace volume for git ops |
| IV. Project-First Configuration | ✅ PASS | branchPrefix, mastraPath, uiSandboxPath per-project |
| V. Simplicity First | ✅ PASS | Uses existing tools (git, Docker), extends existing patterns |

**Post-Design Re-Check (Phase 1 Complete)**:

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. Git-Native Persistence | ✅ PASS | data-model.md defines branch_name, last_commit_sha, commit_count, pr_number, pr_url |
| II. Session Isolation | ✅ PASS | contracts/sessions-git-api.yaml includes 409 response for session lock conflicts |
| III. Multi-Service Architecture | ✅ PASS | ServiceUrls schema defines ports 3001, 4111, 4321, 8080 per constitution |
| IV. Project-First Configuration | ✅ PASS | Branch naming includes project.branchPrefix; mastraPath/uiSandboxPath referenced |
| V. Simplicity First | ✅ PASS | Extends SandboxService pattern; uses Docker exec for git ops (no new infra) |

## Project Structure

### Documentation (this feature)

```text
specs/002-git-multi-project/
├── plan.md              # This file
├── research.md          # Phase 0 output (N/A - no NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 output ✅
├── quickstart.md        # Phase 1 output ✅
├── contracts/           # Phase 1 output ✅
│   └── sessions-git-api.yaml
└── tasks.md             # Phase 2 output (/speck:tasks)
```

### Source Code (repository root)

```text
orchestrator/
├── src/
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 001_initial.ts          # Existing
│   │   │   └── 002_git_fields.ts       # NEW: Add git columns to sessions
│   │   └── types.ts                    # MODIFY: Add git fields to SessionsTable
│   ├── repositories/
│   │   └── sessions.ts                 # MODIFY: Add git-related methods
│   ├── routes/
│   │   └── sessions.ts                 # MODIFY: Enhance suspend/resume, add PR endpoint
│   ├── schemas/
│   │   ├── common.ts                   # MODIFY: Add GitShaSchema, UserIdSchema
│   │   └── sessions.ts                 # MODIFY: Add PR schemas, extend responses
│   ├── services/
│   │   ├── sandbox.ts                  # MODIFY: Integrate GitService
│   │   ├── git.ts                      # NEW: Local git operations via Docker exec
│   │   └── github.ts                   # NEW: GitHub API client (Octokit)
│   └── config.ts                       # MODIFY: Add GitHub App config
├── tests/
│   ├── services/
│   │   ├── git.test.ts                 # NEW: GitService unit tests
│   │   └── github.test.ts              # NEW: GitHubService unit tests
│   ├── routes/
│   │   └── sessions-git.test.ts        # NEW: Git integration tests
│   └── e2e/
│       └── git-workflow.test.ts        # NEW: Full lifecycle E2E tests
```

**Structure Decision**: Extends existing orchestrator structure. New services follow the pattern established by SandboxService. Git operations execute via Docker exec into running containers (same pattern as runInitContainer).

## Implementation Phases

### Phase 2.1: Database Schema & Types

**New Migration** (`orchestrator/src/db/migrations/002_git_fields.ts`):

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | TEXT | User identifier for branch naming |
| `branch_name` | TEXT | `{branchPrefix}{userId}/{artifactName}-{sessionId}` |
| `last_commit_sha` | TEXT | Most recent commit SHA (40-char hex) |
| `commit_count` | INTEGER | Total commits on branch (default 0) |
| `pr_number` | INTEGER | GitHub PR number (nullable) |
| `pr_url` | TEXT | GitHub PR URL (nullable) |

Extend `state` check constraint: `'active', 'suspended', 'pr_open', 'closed'`

**Files**:
- [002_git_fields.ts](orchestrator/src/db/migrations/002_git_fields.ts) (create)
- [types.ts](orchestrator/src/db/types.ts) (modify SessionsTable interface)

### Phase 2.2: GitService

Execute local git operations via Docker exec into workspace containers.

**Interface**:
```typescript
class GitService {
  getStatus(): Promise<GitStatus>           // Check for uncommitted changes
  commitAll(message: string): Promise<CommitResult | null>  // Stage + commit
  createBranch(name: string, base: string): Promise<void>
  push(branch: string): Promise<void>
  clone(repoUrl: string, branch?: string): Promise<void>
  checkout(ref: string): Promise<void>
  ensureGitAttributes(): Promise<void>      // Add .cui/ export-ignore
}
```

**Files**:
- [git.ts](orchestrator/src/services/git.ts) (create)
- [git.test.ts](orchestrator/tests/services/git.test.ts) (create)

### Phase 2.3: GitHubService

GitHub API client using Octokit with App authentication.

**Interface**:
```typescript
class GitHubService {
  checkUserPermissions(owner, repo, username): Promise<RepoPermissions>
  createPullRequest(input: PRCreateInput): Promise<PRResult>
  getPullRequest(owner, repo, prNumber): Promise<PRResult>
  getCloneUrl(owner, repo): Promise<string>  // With App token
  static parseRepo(githubRepo: string): { owner, repo }
}
```

**Rate Limit Handling**: Exponential backoff (max 3 attempts over ~30s per spec clarification).

**Files**:
- [github.ts](orchestrator/src/services/github.ts) (create)
- [github.test.ts](orchestrator/tests/services/github.test.ts) (create)
- [config.ts](orchestrator/src/config.ts) (add GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID)

**New Dependency**: `@octokit/rest`, `@octokit/auth-app`

### Phase 2.4: Enhanced Suspend/Resume

**Suspend Flow** (`POST /sessions/:id/suspend`):
1. Check session state is `active`
2. Execute GitService.getStatus() to check for changes
3. If changes: GitService.commitAll() → GitService.push()
4. Stop containers (existing)
5. Update session: state='suspended', last_commit_sha, commit_count
6. Return session with git info

**Resume Flow** (`POST /sessions/:id/resume`):
1. Check session state is `suspended` or `pr_open`
2. Verify no other pod has this session active (single-pod lock)
3. GitService.clone() with branch_name (or checkout specific commitSha if provided)
4. Start containers (existing)
5. Restore .cui/ history from mastraPath/.cui/
6. Update session: state='active'
7. Return session with URLs

**Files**:
- [sandbox.ts](orchestrator/src/services/sandbox.ts) (modify: add suspendWithGit, resumeWithGit)
- [sessions.ts](orchestrator/src/routes/sessions.ts) (modify: enhance handlers)
- [sessions.ts](orchestrator/src/schemas/sessions.ts) (modify: add ResumeSessionRequestSchema)
- [sessions.ts](orchestrator/src/repositories/sessions.ts) (modify: add updateGitState)

### Phase 2.5: PR Creation

**Endpoint**: `POST /sessions/:id/pull-request`

**Flow**:
1. If session is active, suspend first (with git commit)
2. GitHubService.createPullRequest() targeting project.defaultBranch
3. Update session: state='pr_open', pr_number, pr_url
4. Return session with PR info

**Request Schema**:
```typescript
{ title?: string, description?: string }
```

**Files**:
- [sessions.ts](orchestrator/src/routes/sessions.ts) (add PR endpoint)
- [sessions.ts](orchestrator/src/schemas/sessions.ts) (add CreatePRRequestSchema)
- [sessions.ts](orchestrator/src/repositories/sessions.ts) (add updatePRState)

### Phase 2.6: Session Creation Enhancement

**Endpoint**: `POST /sessions` (enhance existing)

**Changes**:
1. Add `userId` to request body (required for branch naming)
2. Verify user has write access via GitHubService.checkUserPermissions()
3. Generate branch_name: `{branchPrefix}{userId}/{artifactName}-{sessionId}`
4. Create branch via GitHubService (from defaultBranch)
5. Clone branch in init container (existing pattern)

**Files**:
- [sessions.ts](orchestrator/src/schemas/sessions.ts) (extend CreateSessionRequestSchema)
- [sandbox.ts](orchestrator/src/services/sandbox.ts) (modify create method)

## Error Handling

**New Error Classes** (in `orchestrator/src/services/sandbox.ts`):
- `GitOperationError` - Git command failures
- `GitHubAPIError` - GitHub API errors with status code
- `InsufficientPermissionsError` - User lacks write access
- `SessionLockError` - Session already has active pod

## Test Strategy (TDD)

**Unit Tests**:
| Test File | Coverage |
|-----------|----------|
| git.test.ts | GitService methods, error handling |
| github.test.ts | GitHubService with mocked Octokit |

**Integration Tests**:
| Test File | Coverage |
|-----------|----------|
| sessions-git.test.ts | Enhanced suspend/resume, PR creation |

**E2E Tests**:
| Test File | Coverage |
|-----------|----------|
| git-workflow.test.ts | Full lifecycle: create → modify → suspend → resume → PR |

## Verification

1. **Unit tests pass**: `cd orchestrator && bun test tests/services/git.test.ts tests/services/github.test.ts`
2. **Integration tests pass**: `cd orchestrator && bun test tests/routes/sessions-git.test.ts`
3. **E2E tests pass**: `cd orchestrator && bun test tests/e2e/git-workflow.test.ts`
4. **Manual verification**:
   - Create session for project → verify branch created on GitHub
   - Make file changes → suspend → verify commit on branch
   - Resume → verify workspace matches last commit
   - Create PR → verify PR appears on GitHub with correct target

## Complexity Tracking

> No constitution violations requiring justification.

| Area | Complexity | Justification |
|------|------------|---------------|
| Two new services | Medium | GitService and GitHubService are focused, single-responsibility |
| State machine expansion | Low | Adding pr_open, closed follows existing pattern |

## Generated Artifacts

| Artifact | Status | Description |
|----------|--------|-------------|
| [data-model.md](./data-model.md) | ✅ Complete | Entity definitions, state machine, validation rules |
| [contracts/sessions-git-api.yaml](./contracts/sessions-git-api.yaml) | ✅ Complete | OpenAPI 3.0 specification for git endpoints |
| [quickstart.md](./quickstart.md) | ✅ Complete | Developer setup and workflow guide |
| research.md | N/A | No NEEDS CLARIFICATION markers in Technical Context |

## Next Steps

Run `/speck:tasks` to generate tasks.md with actionable implementation steps.
