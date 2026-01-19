# Feature Specification: cui Configuration & Landing Page (Phase 3)

**Feature Branch**: `003-cui-config-landing-page`
**Created**: 2026-01-18
**Status**: Draft
**Input**: Phase 3 of Mastragen implementation - Full self-service workflow from landing page to PR

## Clarifications

### Session 2026-01-18

- Q: What happens when multiple users access the same shared session simultaneously? → A: Multiple users can connect; all see the same shared cui conversation (collaborative mode)
- Q: What should the dashboard display when a user has no sessions yet? → A: Show a welcome/onboarding message with prominent "Create your first session" CTA
- Q: What level of audit logging is required for security-sensitive actions? → A: Structured logs with user, action, timestamp, and resource IDs (queryable via log aggregator)
- Q: How long should suspended/archived sessions be retained before cleanup? → A: 90 days after last activity, then auto-delete branch and session record
- Q: Can a session in "PR Open" state be resumed for additional work? → A: Yes, resuming creates a new sandbox on the same branch; PR updates automatically with new commits

## Overview

Phase 3 delivers the self-service user experience layer for Mastragen. After Phase 1 (Core Platform Foundation) established sandbox infrastructure and Phase 2 (Git & Multi-Project Support) enabled persistent sessions via git branches, Phase 3 provides:

1. A web-based landing page for session and project management
2. Per-project cui configuration injection (MCP servers, commands, skills, context)
3. Built-in commands and skills that enable the complete workflow from idea to PR

This phase transforms Mastragen from an API-only platform to a complete self-service experience.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Session Dashboard & Navigation (Priority: P1)

A developer opens the Mastragen landing page to view their sessions across all projects they have access to. They can see active, suspended, and PR-open sessions grouped by project, with quick links to access sandbox services (cui, Mastra Studio, Astro, VS Code) for active sessions.

**Why this priority**: The dashboard is the primary entry point for all users. Without it, users cannot discover or manage their sessions. It's the foundation for the self-service experience.

**Independent Test**: Can be fully tested by opening the landing page and verifying session list display. Delivers immediate value by giving users visibility into their work.

**Acceptance Scenarios**:

1. **Given** a user with sessions across multiple projects, **When** they access the landing page, **Then** they see sessions grouped by project with status indicators (Active, Suspended, PR Open)
2. **Given** an active session exists, **When** the user views it in the dashboard, **Then** they see clickable links for cui (:3001), Mastra (:4111), Astro (:4321), and VS Code (:8080)
3. **Given** a suspended session exists, **When** the user views it in the dashboard, **Then** they see the branch name, commit count, last commit message, and a Resume button
4. **Given** sessions shared with the user, **When** they view the dashboard, **Then** they see a "Shared with me" section showing those sessions with the owner's name

---

### User Story 2 - Create New Session (Priority: P1)

A developer creates a new session by selecting a project, choosing an environment (staging, dev, etc.), and providing a session name. The system creates a git branch, provisions a sandbox, and redirects the user to the cui interface.

**Why this priority**: Session creation is the primary action users take. Without this, the platform cannot be used for its core purpose.

**Independent Test**: Can be fully tested by filling out the new session form and verifying sandbox provisioning. Delivers value by enabling developers to start new work.

**Acceptance Scenarios**:

1. **Given** a user with access to at least one project, **When** they access the new session form, **Then** they see a dropdown of their projects, environments for the selected project, and a session name field
2. **Given** valid form input, **When** the user submits the new session form, **Then** a git branch is created, a sandbox is provisioned, and the user is redirected to the cui URL
3. **Given** the session is created, **When** the sandbox finishes provisioning, **Then** cui is fully configured with project-specific MCP servers, commands, skills, and CLAUDE.md context
4. **Given** a project with uiSandboxPath configured, **When** a session is created, **Then** the Astro service is started; if uiSandboxPath is null, Astro is not started

---

### User Story 3 - Project Administration (Priority: P2)

A project admin configures project settings including git repository, workspace structure, environments, cui configuration (MCP servers, custom commands, skills), and access control.

**Why this priority**: Project configuration enables the platform to serve multiple projects with different needs. It's essential for customization but less frequently used than session management.

**Independent Test**: Can be fully tested by accessing the project admin page and modifying settings. Delivers value by enabling project customization.

**Acceptance Scenarios**:

1. **Given** a project admin, **When** they access /projects/:id, **Then** they see tabs for Overview, Environments, cui Config, Skills, and Access
2. **Given** the Overview tab, **When** the admin edits git settings (repo, default branch, branch prefix, mastra path, UI sandbox path), **Then** the changes persist and apply to new sessions
3. **Given** the cui Config tab, **When** the admin adds/edits/removes MCP servers, **Then** those MCP servers are injected into new sessions for this project
4. **Given** the cui Config tab, **When** the admin creates a custom command, **Then** that command becomes available as a slash command in cui for this project's sessions

---

### User Story 4 - Built-in Commands (Priority: P2)

A developer uses built-in slash commands in cui to manage their session: /suspend to save work and terminate, /pr to create a pull request, /share to grant teammates access, /extract to capture code as an artifact definition, and /env to view environment info.

**Why this priority**: Built-in commands complete the workflow from idea to PR. They're essential for productivity but require the core session management (P1) to be functional first.

**Independent Test**: Can be fully tested by running each command in an active cui session. Delivers value by enabling workflow completion.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user runs /suspend, **Then** all changes are committed, pushed to the remote branch, the sandbox is terminated, and the session state becomes "suspended"
2. **Given** a session with committed changes, **When** the user runs /pr "Feature title", **Then** a pull request is created on the project repository with the session branch, auto-generated description, and the session state becomes "pr_open"
3. **Given** an active session, **When** the user runs /share @teammate, **Then** the teammate gains access to the sandbox via Tailscale, and the share is recorded
4. **Given** working code in the session, **When** the user runs /extract, **Then** Claude helps capture the code as a Mastra artifact definition (tool, agent, or workflow)
5. **Given** an active session, **When** the user runs /env, **Then** the user sees session ID, project, environment, branch name, and service URLs

---

### User Story 5 - Built-in Skills (Priority: P3)

Claude has access to built-in skills that provide knowledge about Mastra development patterns, artifact extraction, and session management. These skills help developers work effectively within the Mastragen platform.

**Why this priority**: Skills enhance Claude's helpfulness but the platform is functional without them. They improve quality of assistance rather than enabling new capabilities.

**Independent Test**: Can be fully tested by asking Claude questions about Mastra development in a session. Delivers value by improving guidance quality.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user asks Claude how to create a Mastra tool, **Then** Claude references the mastra-development skill and provides accurate guidance
2. **Given** working code that should be extracted, **When** Claude recognizes an extraction opportunity, **Then** Claude suggests using /extract and explains the artifact-extraction pattern
3. **Given** a user asking about workflow (commits, PRs, sharing), **When** Claude responds, **Then** Claude references the session-management skill with accurate command guidance

---

### User Story 6 - Authentication & Authorization (Priority: P2)

Users authenticate via GitHub App OAuth, receive a JWT for API calls, and their Tailscale identity controls sandbox access. Project access is determined by GitHub App installations - users can access projects linked to repos where they have GitHub access and the app is installed.

**Why this priority**: Security and access control are essential for multi-user operation but can be tested with mock auth during development.

**Independent Test**: Can be fully tested by authenticating via GitHub and verifying API access and project visibility based on repo access. Delivers value by enabling secure multi-user access with automatic permission sync.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they access the landing page, **Then** they are redirected to GitHub OAuth for authentication
2. **Given** a successful GitHub authentication, **When** the user returns to Mastragen, **Then** they have a valid JWT and can make API calls
3. **Given** a user with GitHub access to repos A and B (where app is installed) but not C, **When** they view the project list, **Then** they see only projects linked to repos A and B
4. **Given** an active session, **When** a user not granted access tries to connect via Tailscale, **Then** the connection is rejected
5. **Given** a GitHub App installation is suspended, **When** a user tries to create a session for that project, **Then** the system displays an error indicating the installation is suspended

---

### Edge Cases

- What happens when a user tries to create a session in a project with no environments configured?
  - System displays an error prompting the admin to configure at least one environment
- What happens when /suspend is called but the sandbox fails to push to remote?
  - System retries push, and if still failing, notifies user and keeps session active
- What happens when a user's JWT expires during an active session?
  - cui continues working (sandbox access via Tailscale), but landing page API calls prompt re-authentication
- What happens when a shared user loses access (session unshared)?
  - Their Tailscale access is revoked; open connections gracefully disconnect
- What happens when a project admin removes an MCP server that active sessions are using?
  - Active sessions continue with current config; new sessions and resumed sessions use updated config
- What happens when multiple users access the same shared session simultaneously?
  - All users see the same shared cui conversation (collaborative mode); filesystem and git branch are shared
- What should the dashboard display when a user has no sessions yet?
  - Show a welcome/onboarding message with prominent "Create your first session" CTA
- Can a session in "PR Open" state be resumed for additional work (e.g., addressing review feedback)?
  - Yes, resuming creates a new sandbox on the same branch; PR updates automatically with new commits

## Requirements *(mandatory)*

### Functional Requirements

**Landing Page**:

- **FR-001**: System MUST display a dashboard grouped by project showing all sessions the user has access to
- **FR-002**: System MUST display session state (Active, Suspended, PR Open, Merged, Archived) with visual indicators
- **FR-003**: System MUST provide clickable service links (cui, Mastra, Astro, VS Code) for active sessions
- **FR-004**: System MUST display a "Shared with me" section for sessions shared by other users
- **FR-005**: System MUST provide a new session form with project selector, environment selector, and session name input
- **FR-006**: System MUST redirect users to cui URL after successful session creation

**Project Administration**:

- **FR-007**: System MUST provide admin interface for project settings at /projects/:id
- **FR-008**: Project admins MUST be able to configure git settings (repo, default branch, branch prefix)
- **FR-009**: Project admins MUST be able to configure workspace structure (mastra path, UI sandbox path, UI template)
- **FR-010**: Project admins MUST be able to manage environments (add, edit, delete) with env vars and secret references
- **FR-011**: Project admins MUST be able to manage cui configuration (MCP servers, CLAUDE.md context, auto-approve patterns)
- **FR-012**: Project admins MUST be able to create, edit, and delete custom slash commands
- **FR-013**: Project admins MUST be able to create, edit, and delete custom skills

**cui Config Injection**:

- **FR-014**: System MUST inject MCP servers configuration to ~/.claude/settings.json on sandbox startup
- **FR-015**: System MUST inject custom commands to ~/.claude/commands/*.md on sandbox startup
- **FR-016**: System MUST inject custom skills to /mnt/skills/project/ on sandbox startup
- **FR-017**: System MUST inject CLAUDE.md context to /workspace/CLAUDE.md on sandbox startup
- **FR-018**: System MUST inject auto-approve patterns for file operations, MCP tools, and bash commands
- **FR-019**: System MUST inject session-specific configuration (session ID, project, environment, branch name, service URLs)

**Built-in Commands**:

- **FR-020**: System MUST provide /suspend command that commits all changes, pushes to remote, and terminates sandbox
- **FR-021**: System MUST provide /pr command that creates a pull request from the session branch
- **FR-022**: System MUST provide /share command that grants Tailscale access to specified users
- **FR-023**: System MUST provide /extract command that helps capture code as Mastra artifact definitions
- **FR-024**: System MUST provide /env command that displays current session and environment information

**Built-in Skills**:

- **FR-025**: System MUST provide mastra-development skill with guidance on writing tools, agents, and workflows
- **FR-026**: System MUST provide artifact-extraction skill with patterns for capturing work as artifacts
- **FR-027**: System MUST provide session-management skill with guidance on checkpointing, PRs, and collaboration

**Authentication**:

- **FR-028**: System MUST authenticate users via GitHub App OAuth
- **FR-029**: System MUST issue JWT tokens for orchestrator API authentication
- **FR-030**: System MUST enforce GitHub repo access via app installation for API access control
- **FR-031**: System MUST use Tailscale identity for sandbox access control
- **FR-032**: System MUST emit structured audit logs (user, action, timestamp, resource IDs) for security-sensitive actions (session creation, sharing, PR creation)

**GitHub App Integration**:

- **FR-034**: System MUST sync GitHub App installation state via webhooks (created, deleted, suspended, unsuspended)
- **FR-035**: System MUST list available GitHub App installations when user creates a project
- **FR-036**: System MUST verify user repo access via GitHub API before session creation

**Data Retention**:

- **FR-033**: System MUST auto-delete suspended/archived sessions and their git branches after 90 days of inactivity

### Key Entities

- **GitHubAppInstallation**: A record of where the GitHub App is installed (user or organization), synced via webhooks
- **Project**: A Mastra codebase configuration including git repo, workspace structure, cui settings, and linked installation
- **ProjectEnvironment**: Named environment configuration (staging, dev, prod) with env vars and secret references
- **ProjectCuiConfig**: cui configuration for a project including MCP servers, CLAUDE.md, and auto-approve patterns
- **ProjectCommand**: Custom slash command available in cui for a project's sessions
- **ProjectSkill**: Custom skill (knowledge/instructions) available in cui for a project's sessions
- **Session**: An active or suspended development session with branch, state, and commit information
- **SessionShare**: Record of a session being shared with another user

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate from landing page to active cui session in under 10 seconds (measured for authenticated users with cached session list)
- **SC-002**: New session creation (form submit to cui ready) completes in under 90 seconds
- **SC-003**: /suspend command completes (commit, push, terminate) in under 30 seconds
- **SC-004**: /pr command creates a pull request in under 15 seconds
- **SC-005**: 95% of users successfully complete their first session creation without assistance
- **SC-006**: Project admin can configure a new project in under 5 minutes
- **SC-007**: cui config injection applies all project settings on session start (100% configuration accuracy)
- **SC-008**: Built-in commands (/suspend, /pr, /share, /env) work correctly in 100% of sessions
- **SC-009**: Platform supports at least 50 concurrent active sessions across all projects
- **SC-010**: Session dashboard loads in under 2 seconds for users with up to 50 sessions

## Assumptions

- Phase 1 (Core Platform Foundation) and Phase 2 (Git & Multi-Project Support) are complete and functional
- The orchestrator API from Phase 2 provides all necessary endpoints for session and project management
- Kubernetes infrastructure is available for sandbox pod deployment
- Tailscale is configured and operational for secure sandbox access
- A GitHub App is created and configured with OAuth credentials and webhook endpoint
- Users have GitHub accounts and Tailscale clients installed and connected to the tailnet
- The GitHub App is installed on repositories that will be used for projects

## Out of Scope

- Idle auto-suspend (Phase 4)
- Monitoring and alerts (Phase 4)
- User documentation (Phase 4)
- Mobile-optimized landing page interface

## References

- [Implementation Plan](../../docs/implementation-plan.md) - Phase 3 details and deliverables
- [Architecture Specification v4](../../docs/mastragen-architecture-v4.md) - Technical design and component specifications
