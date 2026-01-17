# Feature Specification: Core Platform Foundation (Phase 1)

**Feature Branch**: `001-core-platform-foundation`
**Created**: 2026-01-17
**Status**: Draft
**Input**: Phase 1: Core Platform Foundation - Single sandbox running locally with all four services (cui, Mastra, Astro, VS Code), database schema, orchestrator API, container images, and Docker Compose for local development

## Clarifications

### Session 2026-01-17

- Q: How should users authenticate to the orchestrator API? → A: GitHub OAuth (ties to existing GitHub App for repository access)
- Q: What uniquely identifies a session? → A: Session name must be unique per user+project combination (session names become branch names)
- Q: What happens when session creation fails mid-provisioning? → A: Automatic cleanup of partial resources, return error with details
- Q: How to handle resuming an already-active session? → A: Return existing URLs (idempotent resume)
- Q: What happens when accessing a project without permission? → A: Return 403 Forbidden with clear message

## Overview

Phase 1 establishes the foundational infrastructure for Mastragen, enabling a single development sandbox to run locally with all required services. This phase proves the core architecture works before adding multi-project support, git workflows, and production features in later phases.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Development Session (Priority: P1)

As a developer, I want to create a new development session so that I can start exploring AI development tasks in an isolated sandbox environment.

**Why this priority**: This is the core value proposition of the platform. Without the ability to create sessions, no other functionality matters. A working session creation proves the entire infrastructure stack works end-to-end.

**Independent Test**: Can be fully tested by making an API call to create a session and verifying a sandbox pod starts with all services accessible. Delivers immediate value by providing an isolated development environment.

**Acceptance Scenarios**:

1. **Given** the orchestrator is running, **When** I send a POST request to create a session with a project ID and session name, **Then** a new sandbox is provisioned and I receive URLs for all active services.

2. **Given** a session creation request is made, **When** the sandbox finishes starting, **Then** I can access the Claude chat interface (cui) through the provided URL.

3. **Given** a session creation request is made, **When** the sandbox finishes starting, **Then** I can access Mastra Studio through the provided URL.

4. **Given** a session has been created, **When** I make changes to files in one service, **Then** those changes are immediately visible to other services in the same sandbox.

---

### User Story 2 - Suspend and Resume Session (Priority: P2)

As a developer, I want to suspend my session when I'm done working and resume it later so that I don't lose my work and can pick up where I left off.

**Why this priority**: Session persistence is essential for real-world usage. Without suspend/resume, users would lose all work when sessions terminate. This is the second most critical feature after basic session creation.

**Independent Test**: Can be tested by creating a session, making changes, suspending, resuming, and verifying all changes persist. Delivers value by ensuring work is never lost.

**Acceptance Scenarios**:

1. **Given** an active session with unsaved changes, **When** I request to suspend the session, **Then** all changes are committed and the session state is persisted.

2. **Given** a suspended session, **When** I request to resume it, **Then** a new sandbox starts with all my previous work restored.

3. **Given** a suspended session, **When** I request to resume it, **Then** I can continue working exactly where I left off.

---

### User Story 3 - Access Multiple Services (Priority: P2)

As a developer, I want to access multiple development services (Claude chat, Mastra Studio, UI sandbox, VS Code) so that I can use the right tool for each task during my development workflow.

**Why this priority**: The multi-service architecture is a key differentiator of Mastragen. While cui alone provides value, the full workflow requires Mastra for testing tools/agents and VS Code for complex editing tasks.

**Independent Test**: Can be tested by accessing each service URL independently and verifying each service is functional. Delivers value by providing a complete development toolkit.

**Acceptance Scenarios**:

1. **Given** an active session, **When** I access the cui URL, **Then** I can interact with Claude to write and modify code.

2. **Given** an active session, **When** I access the Mastra Studio URL, **Then** I can see and test tools, agents, and workflows.

3. **Given** an active session with UI sandbox configured, **When** I access the Astro URL, **Then** I can prototype UI components.

4. **Given** an active session, **When** I access the VS Code URL, **Then** the IDE starts on first request and I can edit files directly.

---

### User Story 4 - List My Sessions (Priority: P3)

As a developer, I want to see a list of all my sessions so that I can manage and navigate between different work contexts.

**Why this priority**: Session management becomes important once users have multiple sessions, but basic create/suspend/resume flows work without listing.

**Independent Test**: Can be tested by creating multiple sessions and verifying they all appear in the list with correct status. Delivers value by providing visibility into all work.

**Acceptance Scenarios**:

1. **Given** I have created multiple sessions, **When** I request my session list, **Then** I see all my sessions with their current state (active, suspended).

2. **Given** I have sessions in different states, **When** I view the session list, **Then** I can see which sessions are active and which are suspended.

---

### Edge Cases

- **Provisioning failure**: When session creation fails mid-provisioning (partial pod startup, Tailscale timeout), system automatically cleans up partial resources and returns descriptive error to user.
- **Resume active session**: Resuming an already-active session returns the existing session's URLs (idempotent behavior).
- **Access denied**: Attempting to create a session for a project without membership returns 403 Forbidden with clear message.
- **Database unavailable**: Deferred to operational documentation (Phase 4 monitoring scope).

## Requirements *(mandatory)*

### Functional Requirements

#### Session Management

- **FR-001**: System MUST authenticate users via GitHub OAuth and allow authenticated users to create new development sessions
- **FR-002**: System MUST provision an isolated sandbox environment for each session
- **FR-003**: System MUST expose four services per sandbox: Claude chat interface (port 3001), Mastra runtime (port 4111), UI sandbox (port 4321, optional), and VS Code (port 8080, on-demand)
- **FR-004**: System MUST allow users to suspend active sessions, persisting all changes
- **FR-005**: System MUST allow users to resume suspended sessions, restoring previous state
- **FR-006**: System MUST allow users to list their sessions filtered by state

#### Data Persistence

- **FR-007**: System MUST persist project configurations including repository reference, workspace paths, and branch naming patterns
- **FR-008**: System MUST persist session state including branch reference, current status, and pod information
- **FR-009**: System MUST persist environment configurations including non-secret variables and secret references
- **FR-010**: System MUST support both lightweight local storage and scalable production storage

#### Service Architecture

- **FR-011**: All services within a sandbox MUST share a common workspace volume
- **FR-012**: Changes made in any service MUST be immediately visible to other services
- **FR-013**: VS Code service MUST start only when first accessed (lazy-start)
- **FR-014**: System MUST provide secure network access to sandbox services

#### Local Development

- **FR-015**: System MUST support running the entire platform locally without cloud infrastructure
- **FR-016**: Local development setup MUST mirror production architecture for parity

### Key Entities

- **Project**: Represents a Mastra codebase configuration including repository reference, workspace structure paths (mastra path, UI sandbox path), and branch naming conventions
- **ProjectEnvironment**: Environment-specific configuration for a project including non-secret variables and references to secrets
- **Session**: Active or suspended development context tied to a project and user, tracking state, branch, and pod information. Session name must be unique per user+project (becomes the git branch name).

> **Note**: ProjectMember (user-project association with roles) deferred to Phase 2 with GitHub OAuth authentication.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developer can create a session and access cui within 2 minutes of initiating the request
- **SC-002**: All four sandbox services start successfully and respond to health checks
- **SC-003**: File changes made via cui are visible in Mastra Studio within 5 seconds (shared volume working)
- **SC-004**: Suspended session can be resumed with all previous work intact
- **SC-005**: Local development environment can run on a standard development machine (16GB RAM, 4 cores)
- **SC-006**: Session creation API responds with sandbox URLs within 90 seconds of request

## Assumptions

- Users have Tailscale installed and authenticated on their development machines
- Docker and Docker Compose are available for local development
- A GitHub App will be configured for repository access (setup details in Phase 2)
- AWS Bedrock credentials are available for Claude API access
- The cui-server package exists and can be installed globally

## Out of Scope (Deferred to Later Phases)

- Git branch creation and management (Phase 2)
- Pull request creation (Phase 2)
- Landing page UI (Phase 3)
- cui configuration injection from database (Phase 3)
- Custom commands and skills (Phase 3)
- Session sharing (Phase 4)
- Auto-suspend for idle sessions (Phase 4)
- Monitoring and alerting (Phase 4)

## References

- [Implementation Plan](../../docs/implementation-plan.md) - Phase 1 section defines components and deliverables
- [Architecture Specification v4](../../docs/mastragen-architecture-v4.md) - Detailed technical design for system architecture, API specifications, and container configurations
