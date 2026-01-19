<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Changed sections:
  - Technology Stack: Frontend changed from "Next.js landing page" to "Astro with React islands (Next.js is FORBIDDEN)"
Rationale: Next.js RSC/hydration complexity violates Simplicity First principle. Astro provides equivalent functionality with less complexity.
Templates status:
  - plan-template.md: ✅ Compatible (Constitution Check section exists)
  - spec-template.md: ✅ Compatible (Requirements section exists)
  - tasks-template.md: ✅ Compatible (Phase structure aligns)
Follow-up TODOs: None
-->

# Mastragen Constitution

## Core Principles

### I. Git-Native Persistence

All session state MUST persist as git branches and commits. PRs are the sole mechanism for promoting
work to production.

- Session history, code changes, and cui state are stored in the session branch
- The `.cui/` directory stores session metadata (excluded from squash merges via `.gitattributes`)
- Suspend operations MUST commit and push before terminating a sandbox
- Resume operations MUST restore from the last commit SHA
- No external state stores for session data; git is the source of truth

**Rationale**: Git provides versioning, collaboration, audit trail, and disaster recovery for free.
Every session can be replayed, branched, or rolled back using standard git operations.

### II. Session Isolation

Each sandbox MUST be isolated from other sandboxes and accessible only via Tailscale.

- One Kubernetes pod per session with dedicated resources
- No shared network namespace between sandboxes
- Tailscale ACLs enforce access control (owner + explicit shares only)
- No public internet exposure of sandbox services
- Environment secrets are injected per-session, scoped to the project environment
- Sandboxes auto-terminate after configurable idle timeout

**Rationale**: Isolation prevents accidental data leakage between sessions/users and enables
secure multi-tenancy. Tailscale provides encrypted transport and identity-based access control.

### III. Multi-Service Architecture

Each sandbox exposes four services on dedicated ports, all sharing the same `/workspace` volume.

| Port | Service | Purpose |
|------|---------|---------|
| 3001 | cui | Claude chat interface for AI-assisted development |
| 4111 | Mastra | Tool/agent/workflow runtime + Studio UI |
| 4321 | Astro | UI component prototyping (optional, per-project) |
| 8080 | VS Code | Full IDE escape hatch (lazy-start) |

- Services MUST NOT require path-based routing; port-based routing is mandatory
- Changes in any service are immediately visible to all others via shared volume
- VS Code MUST use lazy-start to conserve resources when not accessed
- Astro container MUST sleep if `uiSandboxPath` is not configured for the project

**Rationale**: Port-based routing avoids WebSocket path rewriting complexity and base-path bugs.
Shared volume enables seamless HMR across services.

### IV. Project-First Configuration

Each project defines its own configuration independent of other projects. Configuration is stored
in Mastragen's database, not in the project repository.

- MCP servers, skills, commands, and CLAUDE.md are configured per-project
- Environment variables and secrets are scoped to project environments
- Branch naming follows project-specific prefixes (e.g., `mg/`, `ai/`, `pipeline/`)
- Workspace paths (`mastraPath`, `uiSandboxPath`) vary by project structure
- Projects can enable/disable features (e.g., Astro sandbox) via configuration

**Rationale**: Projects have different needs. A backend-only project should not be forced to run
Astro. A monorepo needs different paths than a standalone Mastra project. Configuration flexibility
enables Mastragen to serve diverse codebases.

### V. Simplicity First

Prefer simple, boring solutions over clever or complex ones.

- Start with SQLite; migrate to PostgreSQL only when needed
- Use existing tools (Tailscale, git, Kubernetes) instead of building custom infrastructure
- Avoid abstractions until patterns emerge from concrete implementations
- One way to do things; minimize configuration options unless they solve real problems
- Delete code rather than add complexity to support edge cases

**Rationale**: Complexity accumulates. Every abstraction has maintenance cost. Simple systems are
easier to debug, operate, and extend. Mastragen should feel lightweight to operate.

## Technology Stack

**Orchestrator**: Hono (TypeScript), Kysely for database access
**Database**: SQLite (default), PostgreSQL (production scale)
**Containers**: Kubernetes pods with Tailscale sidecar
**Networking**: Tailscale for secure access, port-based service routing
**Frontend**: Astro with React islands (Next.js is FORBIDDEN)
**Sandbox Services**: cui, Mastra, Astro (Vite), code-server

## Development Workflow

### Session Lifecycle

1. User creates session via landing page (selects project, environment, artifact name)
2. Orchestrator creates branch, provisions pod, registers Tailscale device
3. User develops via cui, tests in Mastra Studio, prototypes in Astro
4. User suspends (commits state) or creates PR
5. On PR merge, branch can be archived; session data persisted in git history

### Code Review

- All production changes MUST go through PR review
- cui history is excluded from squash merges (retained in branch for debugging)
- Mastra artifacts (tools, agents, workflows) and UI components ship together in one PR

### Testing

- Mastra tools MUST have contract tests verifying input/output shapes
- Integration tests MUST cover cross-service communication
- Landing page and orchestrator require unit tests for core flows

## Governance

This constitution supersedes all other development practices for Mastragen.

**Amendments**: Changes require documented rationale, review, and version bump.

**Compliance**: PRs MUST be checked against these principles. Violations require explicit
justification in the PR description with reasoning for the exception.

**Version Policy**:
- MAJOR: Principle removal or backward-incompatible governance change
- MINOR: New principle or materially expanded guidance
- PATCH: Clarifications, wording fixes, non-semantic refinements

**Version**: 1.1.0 | **Ratified**: 2026-01-17 | **Last Amended**: 2026-01-18
