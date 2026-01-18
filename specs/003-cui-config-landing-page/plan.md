# Implementation Plan: cui Configuration & Landing Page (Phase 3)

**Branch**: `003-cui-config-landing-page` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-cui-config-landing-page/spec.md`
**Status**: Ready for Implementation

## Summary

Phase 3 delivers the self-service user experience layer for Mastragen, transforming it from an API-only platform to a complete self-service experience. This includes an Astro landing page with React islands for session/project management, per-project cui configuration injection, built-in commands (/suspend, /pr, /share, /extract, /env), and OIDC/JWT authentication.

## Technical Context

**Language/Version**: TypeScript 5.x / Bun 1.x
**Primary Dependencies**:
- Orchestrator: Hono, Kysely, Valibot (existing)
- Landing Page: Astro 5, React 19 (islands), TailwindCSS
- API Client: oRPC for type-safe orchestrator communication
- Authentication: better-auth (OIDC/SSO), JWT
**Storage**: SQLite via Kysely (existing), extended with new tables
**Testing**: Bun test (unit, integration, e2e)
**Target Platform**: Web (Node.js/Bun server, Browser client)
**Project Type**: Web application (backend + frontend)
**Performance Goals**:
- Dashboard load < 2 seconds (SC-010)
- Session creation < 90 seconds (SC-002)
- /suspend completion < 30 seconds (SC-003)
- /pr creation < 15 seconds (SC-004)
**Constraints**:
- Must integrate with existing orchestrator API patterns
- Must follow port-based routing (no path-based routing per Constitution)
- Must support 50+ concurrent sessions (SC-009)
**Scale/Scope**: Multi-project, multi-user platform

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Git-Native Persistence | ✅ PASS | All session state via git branches. /suspend commits before terminating. |
| II. Session Isolation | ✅ PASS | Tailscale ACLs for access control. Session shares recorded in DB. |
| III. Multi-Service Architecture | ✅ PASS | Port-based routing. Landing page on separate port (3000). |
| IV. Project-First Configuration | ✅ PASS | cui config stored per-project in DB, not in repository. |
| V. Simplicity First | ✅ PASS | SQLite for storage. Using existing tools (Tailscale, better-auth). |

**Technology Stack Alignment:**
- ✅ Orchestrator: Hono (TypeScript), Kysely
- ✅ Database: SQLite (default)
- ✅ Containers: Kubernetes pods with Tailscale sidecar (existing)
- ✅ Frontend: Astro landing page with React islands
- ✅ Sandbox Services: cui, Mastra, Astro, code-server (existing)

## Project Structure

### Documentation (this feature)

```text
specs/003-cui-config-landing-page/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
│   ├── auth.md
│   ├── cui-config.md
│   ├── commands.md
│   └── sessions-extended.md
└── tasks.md             # Phase 2 output (via /speck:tasks)
```

### Source Code (repository root)

```text
orchestrator/
├── src/
│   ├── db/
│   │   ├── types.ts              # Extended with new tables
│   │   └── migrations/
│   │       └── 003_cui_config.ts # New migration
│   ├── routes/
│   │   ├── auth.ts               # NEW: OIDC/JWT routes
│   │   ├── cui-config.ts         # NEW: cui config management
│   │   └── commands.ts           # NEW: custom command management
│   ├── services/
│   │   ├── auth.ts               # NEW: better-auth integration
│   │   ├── cui-injection.ts      # NEW: config injection service
│   │   └── tailscale.ts          # NEW: share management
│   └── middleware/
│       └── auth.ts               # NEW: JWT validation middleware
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/

landing-page/
├── src/
│   ├── pages/
│   │   ├── index.astro           # Dashboard
│   │   ├── projects/
│   │   │   └── [id].astro        # Project admin
│   │   └── sessions/
│   │       └── new.astro         # New session form
│   ├── layouts/
│   │   └── Layout.astro          # Base layout with auth
│   ├── components/
│   │   ├── SessionCard.tsx       # React island
│   │   ├── SessionList.tsx       # React island (interactive)
│   │   ├── ProjectSelector.tsx   # React island
│   │   └── ServiceLinks.astro    # Static component
│   └── lib/
│       ├── orpc-client.ts        # oRPC client for orchestrator
│       └── auth.ts               # Auth helpers
└── tests/

cui-commands/
├── suspend.md                    # /suspend command
├── pr.md                         # /pr command
├── share.md                      # /share command
├── extract.md                    # /extract command
└── env.md                        # /env command

cui-skills/
├── mastra-development.md         # Mastra patterns skill
├── artifact-extraction.md        # Extraction patterns skill
└── session-management.md         # Workflow guidance skill
```

**Structure Decision**: Web application pattern with separate orchestrator (backend) and landing-page (Astro frontend) directories. Astro provides static-first pages with React islands for interactive components. oRPC enables type-safe API communication. Built-in commands and skills stored as markdown templates, injected via cui-injection service.

## Complexity Tracking

| Deviation | Justification | Alignment |
|-----------|---------------|-----------|
| (none) | No deviations from constitution | ✅ Fully aligned |

**Note**: Constitution v1.1.0 mandates Astro with React islands for the frontend. Next.js is explicitly forbidden due to RSC/hydration complexity.

## Phase Summary

### Phase 0: Research (Complete)
- Authentication approach: better-auth with OIDC provider
- cui injection mechanism: File-based injection on container startup
- Tailscale share management: ACL updates via Tailscale API

### Phase 1: Design (Complete)
- Data model: New tables for cui config, commands, skills, shares
- API contracts: Extended session API, new auth/config endpoints
- Quickstart: Developer setup guide

### Phase 2: Tasks
Run `/speck:tasks` to generate implementation tasks from this plan.
