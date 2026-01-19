# Implementation Plan: Full Conversion to Authenticated oRPC

**Feature**: Replace REST with authenticated oRPC for all API communication
**Branch**: `003-cui-config-landing-page`
**Date**: 2026-01-18

## Summary

Convert all API communication to use authenticated oRPC+Valibot instead of REST. This affects:
1. Orchestrator oRPC handlers (currently stubs throwing `NOT_IMPLEMENTED`)
2. CLI client (uses REST via `this.request()`, oRPC client exists but unused)
3. Landing page client (uses raw `fetch()`, oRPC client broken)

## Current State

| Component | Status |
|-----------|--------|
| **Orchestrator oRPC Router** | Handlers exist but throw `NOT_IMPLEMENTED` |
| **CLI MgenClient** | Uses `this.request()` for REST, `this.rpcClient` exists but unused |
| **Landing Page** | Uses raw `fetch()`, oRPC client broken (wrong API) |
| **Auth on oRPC** | Handler extracts `authUser` from Hono context, not connected to handlers |

## Implementation Plan

### Phase 1: Server-Side oRPC Handler Implementation

#### Step 1.1: Enhance oRPC Context

**File**: [orchestrator/src/orpc/router.ts](orchestrator/src/orpc/router.ts)

Update `ORPCContext` interface to include typed services:
```typescript
export interface ORPCContext {
  db: Kysely<Database>;
  repos: {
    projects: ProjectsRepository;
    sessions: SessionsRepository;
    users: UsersRepository;
    installations: GithubAppInstallationsRepository;
  };
  services: {
    sandbox: SandboxService;
    auth: AuthService;
    health: HealthService;
  };
  user?: { id: string; email: string; name?: string | null };
}
```

#### Step 1.2: Create oRPC Auth Middleware

**File**: [orchestrator/src/orpc/middleware.ts](orchestrator/src/orpc/middleware.ts) (NEW)

Create middleware procedures for authentication:
- `authenticated` - requires valid JWT, throws UNAUTHORIZED if missing
- `withProjectAccess` - verifies GitHub installation access for project operations

#### Step 1.3: Update Handler to Inject Services

**File**: [orchestrator/src/orpc/handler.ts](orchestrator/src/orpc/handler.ts)

Instantiate repositories and services, pass them to oRPC context:
- Create all repositories from `db`
- Create SandboxService, AuthService, HealthService
- Pass full context to handler

#### Step 1.4: Implement oRPC Handlers

**File**: [orchestrator/src/orpc/router.ts](orchestrator/src/orpc/router.ts)

Replace all stub handlers with real implementations using context services:

**Sessions:**
- `list` → `context.repos.sessions.findAll(filter)`
- `get` → `context.repos.sessions.findById(id)` + URLs for active
- `create` → `context.services.sandbox.create(input)` (requires auth)
- `suspend` → `context.services.sandbox.suspend(id)` (requires auth)
- `resume` → `context.services.sandbox.resume(id, options)` (requires auth)
- `delete` → `context.services.sandbox.cleanup(id, options)` (requires auth)
- `createPR` → `context.services.sandbox.createPullRequest(id, input)` (requires auth)

**Projects:**
- `list` → `context.repos.projects.findAll()`
- `get` → `context.repos.projects.findById(id)` + environments
- `create` → `context.repos.projects.create(input)` (requires auth)
- `listEnvironments` → `context.repos.projects.findEnvironments(projectId)`
- `addEnvironment` → `context.repos.projects.addEnvironment(...)` (requires auth)

**Auth:**
- `me` → `context.services.auth.getUser(userId)` (requires auth)
- `installations` → `context.services.auth.getUserInstallations(userId)` (requires auth)
- `installationRepos` → `context.services.auth.getInstallationRepositories(...)` (requires auth)

#### Step 1.5: Add Auth Middleware to oRPC Route

**File**: [orchestrator/src/index.ts](orchestrator/src/index.ts)

Apply `optionalAuth()` middleware before oRPC handler to populate `authUser` in Hono context.

---

### Phase 2: Migrate CLI to oRPC

#### Step 2.1: Add Auth Token Support

**File**: [cli/src/client.ts](cli/src/client.ts)

Update constructor to accept optional auth token and include in oRPC headers:
```typescript
constructor(baseUrl: string, authToken?: string) {
  // ... RPCLink with Authorization header when authToken provided
}
```

#### Step 2.2: Migrate Methods to oRPC

Replace all REST `this.request()` calls with oRPC client calls:

| Method | REST → oRPC |
|--------|-------------|
| `createSession(req)` | `this.rpcClient.sessions.create(req)` |
| `listSessions(filter)` | `this.rpcClient.sessions.list(filter)` |
| `getSession(id)` | `this.rpcClient.sessions.get({ id })` |
| `suspendSession(id)` | `this.rpcClient.sessions.suspend({ id })` |
| `resumeSession(id, opts)` | `this.rpcClient.sessions.resume({ id, ...opts })` |
| `deleteSession(id, opts)` | `this.rpcClient.sessions.delete({ id, ...opts })` |
| `listProjects()` | `this.rpcClient.projects.list()` |
| `getProject(id)` | `this.rpcClient.projects.get({ id })` |
| `createProject(req)` | `this.rpcClient.projects.create(req)` |
| `addEnvironment(pid, req)` | `this.rpcClient.projects.addEnvironment({ projectId: pid, ...req })` |
| `listEnvironments(pid)` | `this.rpcClient.projects.listEnvironments({ projectId: pid })` |

#### Step 2.3: Remove REST Helper

Delete the private `request<T>()` method once all methods migrated.

---

### Phase 3: Migrate Landing Page to oRPC

#### Step 3.1: Fix oRPC Client

**File**: [landing-page/src/lib/orpc-client.ts](landing-page/src/lib/orpc-client.ts)

Replace broken client with proper RPCLink setup:
- Import `Router` type from orchestrator
- Use `RPCLink` with proper URL and headers
- Add `credentials: 'include'` for cookie auth
- Export factory function `createApiClient(authToken?)`

#### Step 3.2: Remove Duplicate Types

Delete local `Session`, `Project` interfaces. Import from orchestrator schemas:
```typescript
import type { SessionResponse, ProjectResponse } from '../../../orchestrator/src/schemas/index.ts';
export type Session = SessionResponse;
```

#### Step 3.3: Replace fetch() with oRPC

Convert all helper functions:
- `fetchSessions(params)` → `client.sessions.list(params)`
- `fetchProjects()` → `client.projects.list()`
- `fetchSession(id)` → `client.sessions.get({ id })`
- `createSession(params)` → `client.sessions.create(params)`

---

### Phase 4: Testing

#### Step 4.1: Unit Tests for oRPC Handlers

**File**: `orchestrator/tests/unit/orpc/handlers.test.ts` (NEW)

Test each handler with mocked context - verify auth requirements, input validation, service calls.

#### Step 4.2: Integration Tests

**File**: `orchestrator/tests/integration/orpc.test.ts` (NEW)

Test full request flow including JWT auth.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| [orchestrator/src/orpc/router.ts](orchestrator/src/orpc/router.ts) | EDIT | Implement real handlers |
| [orchestrator/src/orpc/handler.ts](orchestrator/src/orpc/handler.ts) | EDIT | Inject repos and services |
| orchestrator/src/orpc/middleware.ts | CREATE | Auth middleware for oRPC |
| [orchestrator/src/orpc/index.ts](orchestrator/src/orpc/index.ts) | EDIT | Export middleware |
| [orchestrator/src/index.ts](orchestrator/src/index.ts) | EDIT | Add optionalAuth to /rpc |
| [cli/src/client.ts](cli/src/client.ts) | EDIT | Add auth token, migrate to oRPC |
| [landing-page/src/lib/orpc-client.ts](landing-page/src/lib/orpc-client.ts) | EDIT | Fix client, remove duplicates |
| orchestrator/tests/unit/orpc/handlers.test.ts | CREATE | Handler unit tests |
| orchestrator/tests/integration/orpc.test.ts | CREATE | Integration tests |

## Execution Order

1. Step 1.1-1.3: Context + handler setup
2. Step 1.4: Implement oRPC handlers (TDD - write tests first)
3. Step 1.5: Wire optionalAuth middleware
4. Step 2.1-2.3: Migrate CLI client
5. Step 3.1-3.3: Migrate landing page client
6. Step 4.1-4.2: Complete test coverage

## Verification

1. **Unit tests pass**:
   ```bash
   cd orchestrator && bun test tests/unit/
   ```

2. **Integration tests pass**:
   ```bash
   cd orchestrator && bun test tests/integration/
   ```

3. **CLI works with oRPC**:
   ```bash
   cd cli && bun run src/index.ts session ls
   bun run src/index.ts project ls
   ```

4. **Landing page works**:
   - Start orchestrator: `cd orchestrator && bun run dev`
   - Start landing page: `cd landing-page && bun run dev`
   - Verify sessions and projects load

5. **oRPC health check**:
   ```bash
   curl -X POST http://localhost:4000/rpc \
     -H "Content-Type: application/json" \
     -d '{"method":"health.check"}'
   ```

## Notes

- **Keep REST routes** as fallback during migration (don't delete)
- **Health endpoint** stays REST for monitoring tools
- **Auth login/callback/refresh** stay REST (OAuth redirects)
- **Webhooks** stay REST (GitHub sends HTTP POST)
- Types flow from orchestrator schemas → clients (single source of truth)
