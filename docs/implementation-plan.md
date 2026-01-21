# Mastragen Implementation Plan

**Version**: 1.0.0
**Date**: January 2026
**Status**: Ready for Implementation

---

## Overview

Mastragen is a platform for Mastra-based AI development that enables developers to explore data analysis and automation with Claude, then capture successful sessions as production-ready Mastra artifacts (tools, agents, workflows).

### Key Capabilities

- **Multi-project support**: One Mastragen instance serves many Mastra projects
- **Git-native persistence**: Branches store code + session history; PRs for promotion
- **Session isolation**: Secure sandboxes accessible only via Tailscale
- **Multi-service sandboxes**: Each sandbox exposes Mastra Studio, Astro, and VS Code (with Claude Code)

### Implementation Approach

The platform is built in 4 phases, each delivering a working increment:

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| 1 | Core Platform Foundation | Single sandbox running locally |
| 2 | Git & Multi-Project Support | Sessions persist as branches, PRs work |
| 3 | Claude Configuration & Web UI | Full self-service workflow |
| 4 | Production Readiness | Production-ready platform |

---

## Phase 1: Core Platform Foundation

**Goal**: Get a single sandbox running locally with core services.

### Components

#### 1.1 Database Schema (SQLite + Kysely)

Create the core data model supporting projects, sessions, and configurations.

**Tables**:
- `projects` - Project configuration (github_repo, mastra_path, ui_sandbox_path, branch_prefix)
- `project_environments` - Environment configs (env_vars, secret_refs)
- `project_members` - User access control
- `project_claude_configs` - MCP servers, CLAUDE.md, auto-approve patterns
- `project_commands` - Custom slash commands
- `project_skills` - Custom skills
- `sessions` - Session state (branch_name, pod_name, state, commit info)
- `session_shares` - Sharing records

**Files**:
- `orchestrator/src/db/types.ts` - Kysely type definitions
- `orchestrator/src/db/index.ts` - Database connection (SQLite/PostgreSQL)
- `orchestrator/src/db/migrations/001_initial.ts` - Schema migration

#### 1.2 Orchestrator API (Hono)

Lightweight service managing sandbox lifecycle.

**Core Endpoints**:
- `POST /sessions` - Create new session (provisions pod, creates branch)
- `POST /sessions/:id/suspend` - Commit state, terminate pod
- `POST /sessions/:id/resume` - Restore pod from last commit
- `GET /sessions` - List user's sessions

**Files**:
- `orchestrator/src/index.ts` - Hono app with routes
- `orchestrator/src/repositories/projects.ts` - Project data access
- `orchestrator/src/repositories/sessions.ts` - Session data access

#### 1.3 Sandbox Container Image

Multi-service container with Mastra, Astro, and VS Code (with Claude Code).

**Services**:
| Port | Service | Purpose |
|------|---------|---------|
| 4111 | Mastra | Tool/agent runtime + Studio |
| 4321 | Astro | UI prototyping sandbox |
| 8080 | VS Code | IDE with Claude Code |

**Files**:
- `sandbox/Dockerfile` - Main container image
- `sandbox/scripts/entrypoint.sh` - Startup with config injection
- `sandbox/scripts/suspend.sh` - Commit and push on suspend
- `sandbox/code-server/Dockerfile` - VS Code with Claude Code extension

#### 1.4 Kubernetes Pod Template

Dynamic pod specification based on project configuration.

**Components**:
- Init container: git clone + Claude config injection
- VS Code container: code-server with Claude Code extension
- Mastra container: `bun run mastra dev`
- Astro container: UI sandbox (conditional on uiSandboxPath)
- Tailscale sidecar: Secure networking

**Files**:
- `k8s/sandbox-pod-template.yaml` - Pod specification
- `k8s/tailscale-serve-config.yaml` - Port-based routing

#### 1.5 Docker Compose (Local Development)

Run the platform locally without Kubernetes.

**Files**:
- `docker-compose.yml` - Orchestrator + sandbox backend
- `docker-compose.override.yml` - Local development overrides

### Phase 1 Deliverable

- Create session via API call
- Pod spins up with services
- Connect via Tailscale to Mastra (:4111), Astro (:4321), VS Code (:8080)
- Changes visible across services via shared volume

---

## Phase 2: Git & Multi-Project Support

**Goal**: Sessions persist as git branches, PRs work for any configured project.

### Components

#### 2.1 GitHub App Setup

GitHub App for repository access and branch/PR management.

**Capabilities**:
- Read/write repository contents
- Create/delete branches
- Create pull requests
- Read organization membership (for access control)

**Files**:
- `orchestrator/src/github.ts` - GitHub API client

#### 2.2 Dynamic Branch Creation

Branches follow project-specific naming conventions.

**Pattern**: `{project.branchPrefix}{userId}/{artifactName}-{sessionId}`

**Examples**:
- `mg/nathan/billing-feature-abc123`
- `ai/sarah/churn-predictor-def456`
- `pipeline/alex/invoice-processor-xyz789`

#### 2.3 Workspace Path Handling

Init container respects project configuration for monorepo support.

**Configurations**:
- `mastraPath`: Where Mastra code lives (e.g., `.`, `packages/ai`, `src/mastra`)
- `uiSandboxPath`: Where UI sandbox lives (e.g., `ui-sandbox`, `packages/playground`, or `null`)

#### 2.4 Commit on Suspend

Suspend operation commits all changes including session history.

**Process**:
1. Copy Claude session data to `{mastraPath}/.claude/`
2. Stage all changes
3. Commit with session metadata
4. Push to remote branch

#### 2.5 PR Creation

Create PRs from session branches.

**Features**:
- Auto-generated PR title and description
- Links back to session for context
- Squash merge recommended (excludes `.claude/` via `.gitattributes`)

**Files**:
- `.gitattributes` template with `.claude/ export-ignore`

### Phase 2 Deliverable

- Create session for any configured project
- Work persists in git branch on suspend
- Resume picks up where you left off
- Create PR to merge work to main

---

## Phase 3: Claude Configuration & Web UI

**Goal**: Full self-service workflow from web UI to PR.

### Components

#### 3.1 Claude Config Injection

Configure Claude Code per-project without modifying the project repository.

**Injected Config**:
- `/home/coder/.claude/settings.json` - MCP servers, auto-approve patterns
- `/home/coder/.claude/commands/*.md` - Custom slash commands
- `/home/coder/.claude/CLAUDE.md` - Project context and skills

#### 3.2 Built-in Commands

Mastragen-provided commands available in all sessions.

| Command | Description |
|---------|-------------|
| `/suspend` | Save work, commit, terminate sandbox |
| `/pr [title]` | Create PR from session branch |
| `/share @user` | Share session with teammate |
| `/extract` | Capture working code as artifact definition |
| `/env` | Show current environment info |

**Files**:
- `claude-commands/suspend.md`
- `claude-commands/pr.md`
- `claude-commands/share.md`
- `claude-commands/extract.md`
- `claude-commands/env.md`

#### 3.3 Built-in Skills

Knowledge and instructions for effective Mastra development.

| Skill | Purpose |
|-------|---------|
| `mastra-development` | How to write tools, agents, workflows |
| `artifact-extraction` | When/how to capture work as artifacts |
| `session-management` | Checkpointing, PRs, collaboration patterns |

**Files**:
- `claude-skills/mastra-development/SKILL.md`
- `claude-skills/artifact-extraction/SKILL.md`
- `claude-skills/session-management/SKILL.md`

#### 3.4 Web UI (Astro + React, SSR via Orchestrator)

Web interface for session and project management, served via SSR through the orchestrator using `hono-astro-adapter`.

**Pages**:
- `/` - Dashboard with session list grouped by project
- `/new` - Create new session (project selector, environment, name)
- `/projects/:id` - Project admin (Git, Environments, Claude Config, Access)

**Features**:
- Service links for active sessions (Mastra, VS Code)
- Session actions (Suspend, Create PR, Share, Resume)
- "Shared with me" section

**Files**:
- `web/src/pages/index.astro` - Dashboard
- `web/src/pages/new.astro` - New session form
- `web/src/pages/projects/[id].astro` - Project admin
- `web/src/components/SessionList.tsx` - React component
- `web/src/components/NewSessionForm.tsx` - React component
- `web/src/lib/api.ts` - Orchestrator API client

#### 3.5 Authentication (OIDC/SSO)

Integrate with existing identity provider.

**Flow**:
1. User authenticates via OIDC/SSO
2. JWT issued for orchestrator API calls
3. Tailscale identity used for sandbox access

### Phase 3 Deliverable

- Users access web UI, create sessions for their projects
- Claude Code fully configured per-project (MCP servers, commands, skills)
- Built-in commands work (/suspend, /pr, /share)
- Complete workflow from idea to PR

---

## Phase 4: Production Readiness

**Goal**: Ready for team use with monitoring and operational polish.

### Components

#### 4.1 Session Sharing

Share active sessions with teammates for pair debugging.

**Implementation**:
- Update Tailscale ACLs to grant access
- Track shares in `session_shares` table
- Display shared sessions in "Shared with me" section

**Files**:
- `orchestrator/src/tailscale.ts` - Tailscale API client

#### 4.2 Idle Auto-Suspend

Automatically suspend sessions after configurable inactivity.

**Implementation**:
- Track `last_activity_at` in sessions table
- Background job checks for idle sessions
- Configurable timeout per project or globally
- Grace period warning before suspend

#### 4.3 Monitoring & Alerts

Operational visibility into platform health.

**Metrics**:
- Active sessions by project
- Session creation/termination rate
- Pod resource utilization
- API latency and error rates

**Alerts**:
- Pod creation failures
- Tailscale registration timeouts
- Database connection issues
- Orphaned pods (no matching session)

#### 4.4 Documentation

Comprehensive documentation for users and operators.

**User Docs**:
- Getting started guide
- Project configuration reference
- Claude commands reference
- Troubleshooting guide

**Operator Docs**:
- Deployment guide (K8s, Docker Compose)
- GitHub App setup
- Tailscale configuration
- Database migration procedures

### Phase 4 Deliverable

- Production-ready platform
- Team can use with confidence
- Operators can monitor and troubleshoot
- Users have documentation for self-service

---

## Constitution Alignment

Each phase adheres to the Mastragen constitution principles:

| Principle | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-----------|---------|---------|---------|---------|
| **Git-Native Persistence** | - | Branches, commits, PRs | - | - |
| **Session Isolation** | Pod per session, Tailscale | - | - | ACL-based sharing |
| **Multi-Service Architecture** | 3 services on ports | - | - | - |
| **Project-First Configuration** | Schema supports it | Path handling | Claude injection, web UI | - |
| **Simplicity First** | SQLite, Docker Compose | Standard git workflow | Astro (not Next.js) | Minimal monitoring |

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Orchestrator | Hono (TypeScript) | Lightweight, fast, TypeScript-native |
| Database | SQLite (default), PostgreSQL (scale) | Start simple, migrate when needed |
| ORM | Kysely | Type-safe SQL, supports both DBs |
| Containers | Kubernetes | Industry standard, scalable |
| Networking | Tailscale | Secure, identity-based access |
| Web UI | Astro + React (SSR via Orchestrator) | Simple, fast, React for interactivity |
| Sandbox Services | Mastra, Astro, VS Code (code-server + Claude Code) | Per architecture spec |

---

## References

- [Architecture Specification v4](./mastragen-architecture-v4.md) - Detailed technical design
- [Constitution](../.speck/memory/constitution.md) - Core principles and governance
