# Plan: Serve Web UI Through Orchestrator (SSR) - Using hono-astro-adapter

## Goal
Serve the Astro web UI via SSR through the orchestrator using `hono-astro-adapter`, with REST API routes at `/api/*` and oRPC at `/rpc`.

## Current State
- Directory renamed: `landing-page/` → `web/` ✅
- REST routes prefixed with `/api` ✅
- CLI updated to use `/api/*` paths ✅
- Health check at root `/health` ✅

## Problem
The `@astrojs/node` adapter (middleware mode) expects Node.js `IncomingMessage`/`ServerResponse` objects, but Hono/Bun uses the Fetch API. Current standalone + proxy approach works but adds complexity.

## Solution
Use `hono-astro-adapter` which outputs a native Hono middleware using the Fetch API directly.

---

## Implementation Steps

### 1. Replace @astrojs/node with hono-astro-adapter

**File:** `web/package.json`
```bash
cd web && bun remove @astrojs/node && bun add hono-astro-adapter
```

**File:** `web/astro.config.mjs`
```javascript
import { defineConfig } from 'astro/config';
import honoAstro from 'hono-astro-adapter';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server',
  adapter: honoAstro(),
});
```

### 2. Update Orchestrator to Use Hono Middleware

**File:** `orchestrator/src/index.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
// ... other imports

// Web UI dist path - configurable for Docker vs local dev
const webDistPath = process.env.WEB_DIST_PATH || '../web/dist';

// Import Astro SSR handler (now a Hono middleware)
const { handler as ssrHandler } = await import(`${webDistPath}/server/entry.mjs`);

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// ... db context middleware ...

// REST API routes under /api
const api = new Hono();
api.route('/auth', createAuthRoutes(db));
api.route('/health', healthRoutes(db));
api.route('/projects', projectsRoutes(db));
api.route('/sessions', sessionsRoutes(db));
api.route('/webhooks', createWebhookRoutes(db, webhookSecret));
app.route('/api', api);

// Health check at root (standard for load balancers)
app.route('/health', healthRoutes(db));

// oRPC handler
app.all('/rpc/*', async (c) => handleORPCRequest(c, db));

// Serve Astro's client-side assets (CSS, JS bundles)
app.use('/_astro/*', serveStatic({ root: `${webDistPath}/client/` }));

// Astro SSR handler (already Hono middleware)
app.use(ssrHandler);
```

### 3. Simplify Docker Setup

Remove the separate `web` service - orchestrator serves everything.

**File:** `docker-compose.yml`
- Remove `web` service
- Remove `depends_on: web` from orchestrator
- Remove `ASTRO_URL` environment variable
- Keep web dist volume mount for local dev

**File:** `docker-compose.override.yml`
- Remove `web` service override
- Keep web dist volume mount: `./web/dist:/web/dist:ro`
- Keep `WEB_DIST_PATH=/web/dist`

### 4. Remove Standalone Files

Delete files created for standalone approach:
- `web/Dockerfile`
- `web/Dockerfile.dev`
- `web/.dockerignore`

### 5. Build Process

The orchestrator Dockerfile needs to build the web UI or mount it:

**Option A - Dev (mount dist):**
```yaml
volumes:
  - ./web/dist:/web/dist:ro
environment:
  - WEB_DIST_PATH=/web/dist
```

**Option B - Production (build in Dockerfile):**
```dockerfile
# In orchestrator/Dockerfile
COPY --from=web-builder /app/dist /web/dist
ENV WEB_DIST_PATH=/web/dist
```

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `web/package.json` | Replace `@astrojs/node` with `hono-astro-adapter` |
| `web/astro.config.mjs` | Use `honoAstro()` adapter |
| `orchestrator/src/index.ts` | Import SSR handler as Hono middleware, add `serveStatic` |
| `docker-compose.yml` | Remove `web` service |
| `docker-compose.override.yml` | Remove `web` override, keep volume mount |

---

## Verification

1. **Rebuild web**: `cd web && bun run build`
2. **Run orchestrator**: `cd orchestrator && bun run dev`
3. **Test SSR**: `curl http://localhost:3000/` - should render HTML
4. **Test API**: `curl http://localhost:3000/api/health`
5. **Test health root**: `curl http://localhost:3000/health`
6. **Test oRPC**: Verify `/rpc` endpoints work
7. **Test static assets**: Check `/_astro/*` files load
8. **Run tests**: `cd orchestrator && bun test`
9. **Docker test**: `docker compose up --build` - single service serves everything
