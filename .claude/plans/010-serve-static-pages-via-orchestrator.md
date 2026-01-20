# Plan: Serve Web UI Through Orchestrator (SSR)

## Goal
Serve the Astro web UI via SSR through the orchestrator, with REST API routes at `/api/*` and oRPC at `/rpc`.

## Changes Overview

| Area | Change |
|------|--------|
| Directory rename | `landing-page/` → `web/` |
| Web UI | Keep SSR, add `@astrojs/node` adapter in middleware mode |
| REST API routes | Prefix with `/api` (auth, health, projects, sessions, webhooks) |
| oRPC | Keep at `/rpc` (not moved) |
| Orchestrator | Import Astro handler, delegate non-API routes to it |
| Tests | Update REST route paths to `/api/*` |

**Why SSR over Static:**
- Keeps Astro middleware for server-side auth checks
- Dynamic routes like `/projects/[id]` work naturally
- No SPA fallback complexity or client-side URL parsing
- Simpler overall architecture

---

## Implementation Steps

### 1. Rename Directory

```bash
git mv landing-page web
```

Update any workspace references (package.json, docker-compose, etc.) to use `web/` instead of `landing-page/`.

### 2. Add Astro Node Adapter

**File:** `web/package.json`
```bash
cd web && bun add @astrojs/node
```

**File:** `web/astro.config.mjs`
```javascript
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server',
  adapter: node({ mode: 'middleware' }),
});
```

### 3. Update Orchestrator Routes to `/api/*` Prefix

**File:** `orchestrator/src/index.ts`

- Create an `api` sub-router for REST endpoints
- Keep oRPC at `/rpc`
- Import and delegate to Astro handler for UI routes

```typescript
import { handler as astroHandler } from '../web/dist/server/entry.mjs';

// REST API routes under /api
const api = new Hono();
api.route('/auth', createAuthRoutes(db));
api.route('/health', healthRoutes(db));
api.route('/projects', projectsRoutes(db));
api.route('/sessions', sessionsRoutes(db));
api.route('/webhooks', createWebhookRoutes(db, webhookSecret));

app.route('/api', api);

// oRPC stays at /rpc
app.all('/rpc/*', async (c) => handleORPCRequest(c, db));

// Delegate all other routes to Astro SSR
app.all('*', async (c) => {
  return astroHandler(c.req.raw);
});
```

### 4. Revert Static-Related Changes

Undo the static-related changes made earlier:

**File:** `web/src/pages/projects/index.astro`
- Rename back to `[id].astro` (git mv)
- Restore `Astro.params.id` usage
- Restore `orchestratorUrl` prop passing

**Files to restore/update:**
- `web/src/components/ProjectTabs.tsx` - restore props interface
- `web/src/components/admin/*.tsx` - restore `orchestratorUrl` prop
- `web/src/pages/index.astro` - restore prop passing
- `web/src/pages/sessions/new.astro` - restore prop passing

### 5. Update Web UI API Calls for `/api` Prefix

The API base URL changes from root to `/api`:

**Files to update:**
- `web/src/lib/orpc-client.ts` - Use `/api` for REST calls
- `web/src/lib/auth.ts` - Use `/api/auth/*` for auth endpoints

```typescript
// Both files use /api as base
const API_BASE = '/api';
```

**Note:** The existing changes to use `/api` prefix are correct and should be kept.

### 6. Keep Astro Middleware for Auth

**File:** `web/src/middleware.ts` - Keep as-is

The Astro middleware handles server-side auth checks before rendering protected pages. This stays because we're keeping SSR.

### 7. Update All Tests

Update route paths in test files from `/path` to `/api/path`:

**Test files to update:**
- `orchestrator/tests/routes/*.test.ts`
- `orchestrator/tests/unit/routes/*.test.ts`
- `orchestrator/tests/unit/middleware/*.test.ts`
- `orchestrator/tests/integration/*.test.ts`
- `orchestrator/tests/e2e/*.test.ts`

### 8. Update Build Process

**Web UI builds to `dist/server/` for SSR:**
```bash
cd web && bun run build
# Output: dist/server/entry.mjs (the handler)
# Output: dist/client/ (static assets)
```

**Orchestrator needs to:**
1. Serve Astro's static client assets from `dist/client/`
2. Import the SSR handler from `dist/server/entry.mjs`

```typescript
import { serveStatic } from 'hono/bun';

// Serve Astro's client-side assets (CSS, JS bundles)
app.use('/_astro/*', serveStatic({ root: '../web/dist/client/' }));
```

---

## Critical Files

| File | Purpose |
|------|---------|
| `orchestrator/src/index.ts` | Add `/api` prefix, import Astro handler |
| `web/astro.config.mjs` | Add node adapter in middleware mode |
| `web/src/lib/orpc-client.ts` | Update base to `/api` |
| `web/src/lib/auth.ts` | Update to `/api/auth/*` |
| `web/src/middleware.ts` | Keep for SSR auth (no changes) |

---

## Verification

1. **Build web UI**: `cd web && bun run build`
2. **Run orchestrator**: `cd orchestrator && bun run dev`
3. **Test SSR**: Navigate to `http://localhost:3000/` - should see web UI (SSR)
4. **Test API routes**: `curl http://localhost:3000/api/health` - should return health status
5. **Test oRPC**: Verify `/rpc` endpoints work
6. **Test auth flow**: Login via `/auth/login`, verify Astro middleware redirects work
7. **Test dynamic route**: Navigate to `/projects/<id>` - should work with SSR params
8. **Run tests**: `cd orchestrator && bun test` - all tests should pass with `/api/*` paths
