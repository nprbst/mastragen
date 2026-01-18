# Feature Specification: Git & Multi-Project Support

**Feature Branch**: `002-git-multi-project`
**Created**: 2026-01-17
**Status**: Draft
**Input**: Phase 2: Git & Multi-Project Support - Sessions persist as git branches, PRs work for any configured project

## Overview

This feature enables Mastragen to persist session work as git branches and support multiple projects with different repository configurations. When a user suspends a session, all their work (code changes and session history) is committed and pushed to a project-specific branch. Users can resume sessions from their last state, and when work is ready, create pull requests to merge changes into the main branch.

## Clarifications

### Session 2026-01-17

- Q: What are the valid session state transitions? → A: State machine with optional paths: `active` can transition to either `suspended` (pause work) or `pr_open` (create PR); `suspended` can transition to `active` (resume) or `pr_open` (create PR); `pr_open` can transition to `active` (continue work) or `closed` (merged/archived)
- Q: How should the system handle concurrent access to the same session? → A: Lock session to single active pod; second resume attempt blocked until first pod terminates
- Q: How is user access to projects determined? → A: GitHub repo permissions - user can access a project if they have write access to the underlying repository
- Q: How should the system handle GitHub API rate limits? → A: Queue operations with exponential backoff; retry automatically and surface delay to user if prolonged
- Q: What defines "typical workload" for the 30-second suspend target? → A: ≤50 changed files, ≤5MB total diff size

## Problem Statement

Currently, Mastragen sessions (from Phase 1) run in sandboxes but have no persistence mechanism. When a sandbox terminates, all work is lost. Additionally, the platform needs to support multiple projects with different GitHub repositories and workspace structures (monorepos vs. standalone projects).

### User Pain Points

1. **No work persistence**: Users lose all progress when sessions end
2. **No project flexibility**: Each Mastra project may live in a different repository with different directory structures
3. **No collaboration path**: No way to get session work into the main codebase for review and merge
4. **No session continuity**: Users cannot pause work and return later

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Suspend Session with Work Preservation (Priority: P1)

As a developer with an active session containing changes, I want to suspend my session and have all my work automatically saved to git so that I can return later and continue from exactly where I left off.

**Why this priority**: This is the core value proposition of Phase 2. Without persistence, all other git features are meaningless. Users must trust that their work is safe before they will adopt the platform.

**Independent Test**: Can be fully tested by creating a session, making changes, suspending, and verifying the changes exist in the git branch on GitHub.

**Acceptance Scenarios**:

1. **Given** an active session with uncommitted file changes, **When** the user triggers suspend, **Then** all file changes are committed to the session branch with a descriptive commit message
2. **Given** an active session with cui conversation history, **When** the user suspends, **Then** the session history is saved to the `.cui/` directory in the commit
3. **Given** a session suspend request, **When** the commit and push complete successfully, **Then** the session state changes to "suspended" and the user sees the last commit SHA
4. **Given** a session with no changes, **When** the user suspends, **Then** the session suspends gracefully without creating an empty commit

---

### User Story 2 - Resume Suspended Session (Priority: P1)

As a developer who previously suspended a session, I want to resume my work so that I can continue exactly where I left off with all my code and conversation history intact.

**Why this priority**: Resume is the complement to suspend - without reliable resume, the persist feature is incomplete. This directly delivers on the "session continuity" pain point.

**Independent Test**: Can be fully tested by resuming a suspended session and verifying the workspace contains all previously committed changes and conversation history is restored.

**Acceptance Scenarios**:

1. **Given** a suspended session with commits, **When** the user clicks Resume, **Then** a new sandbox is provisioned with the workspace at the last commit state
2. **Given** a suspended session with `.cui/` history, **When** the session resumes, **Then** the cui interface loads with the previous conversation history
3. **Given** a suspended session, **When** the user provides a specific earlier commit SHA, **Then** the session resumes at that specific commit instead of the latest
4. **Given** a session in "PR open" state, **When** the user resumes it, **Then** the session becomes active and they can continue making changes

---

### User Story 3 - Create Session for Any Configured Project (Priority: P2)

As a developer with access to multiple Mastragen projects, I want to create sessions for any of my projects so that I can work on different repositories with different workspace structures.

**Why this priority**: Multi-project support unlocks platform adoption across organizations. However, suspend/resume (P1) could work with a single hardcoded project, so this expands rather than enables the core feature.

**Independent Test**: Can be fully tested by configuring two different projects (one standalone, one monorepo) and verifying sessions can be created for each with correct workspace structure.

**Acceptance Scenarios**:

1. **Given** a project configured with `mastraPath: "packages/ai"`, **When** a session is created, **Then** the Mastra service starts from the `packages/ai` directory
2. **Given** a project configured with `uiSandboxPath: null`, **When** a session is created, **Then** the Astro container does not start
3. **Given** a project with `branchPrefix: "ai/"`, **When** a session named "billing-feature" is created, **Then** the branch is named `ai/{userId}/billing-feature-{sessionId}`
4. **Given** a user with access to 3 projects, **When** they request to create a session, **Then** they can select from all 3 projects

---

### User Story 4 - Create Pull Request from Session (Priority: P2)

As a developer with session work ready for review, I want to create a pull request so that my team can review and merge my work into the main codebase.

**Why this priority**: PR creation is the graduation path for session work. It's essential for the complete workflow but depends on persist/resume being reliable first.

**Independent Test**: Can be fully tested by creating a PR from a session with commits and verifying the PR appears on GitHub with correct target branch and description.

**Acceptance Scenarios**:

1. **Given** a session with commits, **When** the user triggers PR creation, **Then** a PR is created targeting the project's default branch
2. **Given** an active session, **When** the user creates a PR, **Then** all changes are committed and pushed, the PR is created, containers are stopped, and the session transitions directly to "PR open" state
3. **Given** a PR creation request with custom title, **When** the PR is created, **Then** the custom title is used instead of the auto-generated one
4. **Given** a successful PR creation, **When** complete, **Then** the session state changes to "PR open" and displays the PR URL
5. **Given** a PR for a session, **When** the PR is squash-merged, **Then** the `.cui/` directory is excluded from the merged commit

---

### User Story 5 - Work with Monorepo Project (Priority: P3)

As a developer working on a project where Mastra lives in a subdirectory of a larger monorepo, I want the sandbox to correctly handle the directory structure so that all services work and my changes are tracked properly.

**Why this priority**: This is a refinement of multi-project support (P2) for a specific but common use case. Not blocking for initial adoption but important for enterprise customers.

**Independent Test**: Can be fully tested by creating a session for a monorepo project and verifying both Mastra and Astro run from correct subdirectories with all changes tracked in a single branch.

**Acceptance Scenarios**:

1. **Given** a project with `mastraPath: "packages/ai"` and `uiSandboxPath: "packages/playground"`, **When** a session is created, **Then** both services start from their respective directories
2. **Given** changes in both mastraPath and uiSandboxPath directories, **When** the session is suspended, **Then** a single commit includes changes from both directories
3. **Given** an empty uiSandboxPath directory with `uiSandboxTemplate` configured, **When** the session starts, **Then** the template is initialized automatically

---

### Edge Cases

- What happens when GitHub API is unavailable or rate-limited during suspend? → Retry with exponential backoff (max 3 attempts over ~30s), notify user of delay, preserve local state if ultimately fails
- What happens when the branch already exists? (Append unique suffix or fail with clear message)
- How does system handle commits exceeding typical workload (>50 files or >5MB)? → Warn user that suspend may take longer; no hard block but log for monitoring
- What happens if resume fails mid-way? (Clean up partial pod, allow retry, preserve branch state)
- What if user tries to resume a session that already has an active pod? → System MUST block the resume attempt and return an error indicating the session is already active (single-pod lock)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST integrate with GitHub via a GitHub App with read/write repository access, branch management, and PR creation capabilities
- **FR-002**: System MUST create branches following the pattern `{project.branchPrefix}{userId}/{artifactName}-{sessionId}`
- **FR-003**: System MUST respect project workspace configuration (`mastraPath`, `uiSandboxPath`) when provisioning sandboxes
- **FR-004**: System MUST commit all workspace changes to the session branch when suspend is triggered
- **FR-005**: System MUST preserve cui session history in the `.cui/` directory within the `mastraPath`
- **FR-006**: System MUST push commits to the remote branch after successful commit
- **FR-007**: System MUST restore workspace state from the session branch when resume is triggered
- **FR-008**: System MUST restore cui session history from `.cui/` directory on resume
- **FR-009**: System MUST support resuming from a specific commit SHA (optional parameter)
- **FR-010**: System MUST create pull requests targeting the project's `defaultBranch`
- **FR-011**: System MUST update session state to reflect PR creation (state: "pr_open", prNumber, prUrl)
- **FR-012**: System MUST configure `.gitattributes` to exclude `.cui/` from squash merges (export-ignore)
- **FR-013**: System MUST conditionally start Astro container only when `uiSandboxPath` is configured
- **FR-014**: System MUST initialize UI sandbox from template when `uiSandboxTemplate` is configured and directory is empty
- **FR-015**: System MUST verify user has write access to the project's GitHub repository before allowing session creation or project listing

### Key Entities

- **Session** (extended): Git-related fields including `branchName`, `lastCommitSha`, `commitCount`, `prNumber`, `prUrl`
  - **State Machine**: `active` → (`suspended` | `pr_open`), `suspended` → (`active` | `pr_open`), `pr_open` → (`active` | `closed`). The `suspended` state is optional—users can create PRs directly from active sessions.
- **Project**: Repository configuration including `githubRepo`, `defaultBranch`, `branchPrefix`, `mastraPath`, `uiSandboxPath`, `uiSandboxTemplate`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can suspend a session, close their browser, return hours or days later, and resume with all code changes and conversation history intact (100% data preservation)
- **SC-002**: Platform supports 5+ projects with varying repository structures (standalone, monorepo with different paths), all functioning correctly
- **SC-003**: Users can complete the workflow from session creation to merged PR within a single platform (no external git operations required)
- **SC-004**: 99% of session resume operations succeed on first attempt without user intervention
- **SC-005**: Time from suspend trigger to branch push completes within 30 seconds for typical workloads (≤50 changed files, ≤5MB diff)
- **SC-006**: Users have visibility into their session's git state (branch name, commit count, last commit) through API responses

## Assumptions

1. GitHub App credentials are available as Kubernetes secrets and the App is installed on target repositories
2. Users have appropriate permissions on the GitHub repositories they work with (at least write access to branches)
3. Network connectivity to GitHub is reliable with reasonable latency
4. Git operations (clone, push) complete within 60 seconds for typical repository sizes
5. Project administrators have configured projects in the database (Phase 1 schema provides the tables)
6. Session branches are protected from direct deletion by other users

## Dependencies

- **Phase 1**: Core platform foundation must be complete (database schema with projects/sessions tables, orchestrator API, sandbox container, Kubernetes pod template)
- **GitHub**: GitHub API availability and App installation on target repositories
- **Tailscale**: Session access still depends on Tailscale networking from Phase 1

## Out of Scope

- Session sharing with teammates (Phase 4)
- Idle auto-suspend functionality (Phase 4)
- Landing page UI for session management (Phase 3)
- cui configuration injection from database (Phase 3)
- Built-in commands (/suspend, /pr, /share) - Phase 3
- Webhook handling for PR merge events
- Branch protection rule configuration

## References

- [Implementation Plan - Phase 2](../../docs/implementation-plan.md#phase-2-git--multi-project-support) - Defines the components and deliverables for this phase
- [Architecture Specification v4](../../docs/mastragen-architecture-v4.md) - Detailed technical design including API endpoints (lines 684-1180), pod specifications (lines 1586-1961), and git workflow
