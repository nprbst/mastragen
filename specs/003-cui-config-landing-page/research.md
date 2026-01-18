# Research: cui Configuration & Landing Page (Phase 3)

**Feature**: 003-cui-config-landing-page
**Date**: 2026-01-18
**Status**: Complete

## Research Topics

### 1. Authentication Architecture

**Question**: How should we implement OIDC/SSO authentication with JWT tokens for the orchestrator API?

**Decision**: Use better-auth library with OIDC provider integration

**Rationale**:
- better-auth is the recommended auth library for modern TypeScript applications
- Native Hono integration via `@better-auth/hono`
- Built-in OIDC/OAuth2 support for common providers (Google, GitHub, Azure AD)
- JWT-based session tokens that work with stateless API authentication
- Supports both server-side sessions and client-side JWT tokens

**Implementation Approach**:
1. Configure better-auth in orchestrator with OIDC provider settings
2. Use `betterAuth()` middleware for protected routes
3. Issue JWT tokens after successful OIDC authentication
4. Store user info in new `users` table (id, email, name, avatar, provider)
5. Add `user_id` foreign key to sessions table (already exists)

**Alternatives Considered**:
- **Lucia Auth**: Good but less feature-complete for OIDC
- **Auth.js (NextAuth)**: Designed for Next.js, not ideal for Hono
- **Custom JWT + passport**: More complexity, harder to maintain

### 2. cui Configuration Injection

**Question**: How should we inject project-specific cui configuration into sandbox containers?

**Decision**: File-based injection during container startup via init container

**Rationale**:
- cui reads configuration from specific file paths:
  - `~/.claude/settings.json` for MCP servers and auto-approve patterns
  - `~/.claude/commands/*.md` for custom slash commands
  - `/mnt/skills/` for skills (knowledge files)
  - `/workspace/CLAUDE.md` for project context
- Init container already runs before service containers start
- Can write configuration files to shared volume before cui starts

**Implementation Approach**:
1. Store cui config in database (project_cui_config, project_commands, project_skills tables)
2. Extend init container to:
   a. Clone repository (existing)
   b. Fetch cui config from orchestrator API
   c. Write config files to appropriate locations on shared volume
3. cui container reads config on startup

**Configuration File Locations**:
```
/workspace/
├── .cui/                    # Session metadata (already exists)
├── CLAUDE.md               # Project context (injected)
└── .claude/
    ├── settings.json       # MCP servers, auto-approve patterns
    └── commands/
        ├── suspend.md      # Built-in commands
        ├── pr.md
        ├── share.md
        ├── extract.md
        ├── env.md
        └── {custom}.md     # Project-specific commands
```

**Alternatives Considered**:
- **Environment variables**: Not suitable for complex JSON configs
- **ConfigMap injection**: Requires Kubernetes, init container is simpler
- **Runtime API calls**: Would require cui to know about orchestrator API

### 3. Tailscale Share Management

**Question**: How do we grant/revoke Tailscale access when users run /share?

**Decision**: Use Tailscale API to manage ACL tags and device access

**Rationale**:
- Each sandbox pod has a Tailscale sidecar with a unique device identity
- Tailscale ACLs can control access based on user identity
- /share command should grant access without requiring admin intervention

**Implementation Approach**:
1. Store share records in `session_shares` table (session_id, shared_with_user_id, granted_at, revoked_at)
2. When /share is called:
   a. Validate target user exists (by email or username)
   b. Create share record in database
   c. Call Tailscale API to update ACL for the device
3. When share is revoked or session terminates:
   a. Update share record (set revoked_at)
   b. Call Tailscale API to remove ACL entry

**Tailscale API Operations**:
- `GET /api/v2/device/{deviceId}` - Get device info
- `POST /api/v2/device/{deviceId}/tags` - Update device tags
- ACLs reference tags to grant access

**Alternatives Considered**:
- **VPN-based sharing**: More complex, requires VPN infrastructure
- **SSH tunneling**: Works but not as secure as Tailscale
- **Public URLs with auth**: Violates Constitution principle II (Tailscale-only access)

### 4. Landing Page Architecture

**Question**: How should the landing page communicate with the orchestrator?

**Decision**: Astro with React islands + oRPC for type-safe API calls

**Rationale**:
- Astro provides static-first approach - faster initial load, simpler architecture
- React islands only where interactivity is needed (session lists, forms)
- oRPC provides end-to-end type safety between orchestrator and landing page
- Simpler than Next.js - no RSC complexity, no hydration issues
- Aligns with Constitution principle V (Simplicity First)

**Implementation Approach**:
1. Landing page uses Astro with file-based routing
2. Static pages rendered at build time where possible
3. React islands (`client:load`) for interactive components:
   - SessionList (real-time updates, filtering)
   - ProjectSelector (form interactions)
   - NewSessionForm (form submission)
4. oRPC client generated from orchestrator router types
5. Auth flow:
   a. User clicks "Sign in"
   b. Redirect to OIDC provider
   c. Callback to orchestrator `/auth/callback`
   d. Orchestrator issues JWT, sets cookie
   e. Redirect to landing page

**oRPC Integration**:
```typescript
// orchestrator/src/orpc/router.ts
import { ORPCRouter } from '@orpc/hono';
export const router = new ORPCRouter()
  .prefix('/api')
  .get('/sessions', sessionsHandler)
  .post('/sessions', createSessionHandler);

// landing-page/src/lib/orpc-client.ts
import { createORPCClient } from '@orpc/client';
import type { Router } from 'orchestrator/src/orpc/router';
export const api = createORPCClient<Router>({ baseUrl: '/api' });
```

**Port Assignment** (per Constitution - port-based routing):
- Landing page: 3000
- Orchestrator: 8000 (existing)
- Sandbox services: 3001, 4111, 4321, 8080 (existing)

### 5. Built-in Commands Implementation

**Question**: How should built-in commands (/suspend, /pr, /share, /extract, /env) interact with the orchestrator?

**Decision**: Commands call orchestrator API via environment-injected base URL

**Rationale**:
- Commands are markdown files executed by cui
- Commands can use Bash tool to make HTTP requests
- Environment variables provide orchestrator URL and session context

**Implementation Approach**:
1. Inject environment variables during session creation:
   - `MASTRAGEN_SESSION_ID`: Current session ID
   - `MASTRAGEN_API_URL`: Orchestrator base URL
   - `MASTRAGEN_USER_TOKEN`: JWT for API auth
2. Commands use `curl` or `fetch` to call orchestrator endpoints:
   - `/suspend` → POST /sessions/:id/suspend
   - `/pr` → POST /sessions/:id/pr
   - `/share` → POST /sessions/:id/share
   - `/env` → GET /sessions/:id (display info)
3. `/extract` is cui-only (helps write artifact code, no API call)

**Command Template Structure**:
```markdown
# /suspend

Suspend this session, committing all changes and pushing to remote.

## Steps
1. Call orchestrator API to suspend session
2. Display confirmation with commit info

## Implementation
[Bash commands to call API]
```

### 6. Session Dashboard Performance

**Question**: How do we ensure dashboard loads in < 2 seconds with many sessions?

**Decision**: Indexed queries with pagination and lazy loading

**Rationale**:
- Users may have many sessions across projects
- Initial load should show most recent/relevant sessions
- Full list can load progressively

**Implementation Approach**:
1. Add database indexes on frequently queried columns:
   - sessions(user_id, state, updated_at)
   - sessions(project_id, state)
2. Default dashboard query: active + recent suspended, limit 20
3. "Load more" for older sessions
4. Client-side caching with SWR (stale-while-revalidate)

### 7. Audit Logging

**Question**: How should we implement structured audit logs for security-sensitive actions?

**Decision**: Structured logging to stdout with JSON format, queryable via log aggregator

**Rationale**:
- FR-032 requires audit logs for session creation, sharing, PR creation
- Constitution specifies "queryable via log aggregator" in clarifications
- Stdout logging integrates with any log aggregator (ELK, Datadog, CloudWatch)

**Implementation Approach**:
1. Create `AuditLogger` service with structured log format:
   ```json
   {
     "timestamp": "2026-01-18T12:00:00Z",
     "event": "session.created",
     "userId": "user_123",
     "resourceId": "session_456",
     "resourceType": "session",
     "metadata": { "projectId": "proj_789", "environment": "staging" }
   }
   ```
2. Call AuditLogger from services on security-sensitive operations
3. Log to stdout in JSON format for aggregator ingestion

### 8. Data Retention and Cleanup

**Question**: How do we implement 90-day auto-deletion of inactive sessions?

**Decision**: Scheduled job that deletes old sessions and their git branches

**Rationale**:
- FR-033 requires auto-delete after 90 days of inactivity
- Need to clean up both database records and git branches

**Implementation Approach**:
1. Add `last_activity_at` column to sessions table (updated on any session action)
2. Scheduled job (cron or similar) runs daily:
   a. Find sessions where state in (suspended, archived) and last_activity_at < 90 days ago
   b. For each session:
      - Delete git branch via GitHub API
      - Delete session record from database
3. Log deletions for audit trail

## Summary

All research questions resolved. Ready to proceed with Phase 1 design artifacts.

| Topic | Decision | Implementation Complexity |
|-------|----------|--------------------------|
| Authentication | better-auth + OIDC | Medium |
| cui Injection | File-based via init container | Low |
| Tailscale Shares | Tailscale API for ACL management | Medium |
| Landing Page | Next.js with direct API calls | Low |
| Built-in Commands | Markdown + orchestrator API | Low |
| Dashboard Performance | Indexed queries + pagination | Low |
| Audit Logging | Structured JSON to stdout | Low |
| Data Retention | Scheduled cleanup job | Low |
