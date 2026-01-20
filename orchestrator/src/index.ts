import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/index.ts';
import { runMigrations } from './db/migrator.ts';
import {
  createAuthRoutes,
  healthRoutes,
  projectsRoutes,
  sessionsRoutes,
  createWebhookRoutes,
} from './routes/index.ts';
import { handleORPCRequest } from './orpc/index.ts';

const config = loadConfig();

// Initialize database
const db = createDatabase(config.databasePath);

// Run migrations
await runMigrations(db);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Inject database into context for middleware
app.use('*', async (c, next) => {
  // @ts-expect-error - db is added dynamically to context for middleware use
  c.set('db', db);
  await next();
});

// REST API routes under /api
const api = new Hono();
api.route('/auth', createAuthRoutes(db));
api.route('/health', healthRoutes(db));
api.route('/projects', projectsRoutes(db));
api.route('/sessions', sessionsRoutes(db));

// GitHub webhook handler
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'development-webhook-secret';
api.route('/webhooks', createWebhookRoutes(db, webhookSecret));

// API info route
api.get('/', (c) => {
  return c.json({
    name: 'mastragen-orchestrator',
    version: process.env.npm_package_version ?? '0.1.0',
    docs: '/api/health',
    rpc: '/rpc',
  });
});

app.route('/api', api);

// oRPC handler for type-safe API calls (stays at /rpc)
app.all('/rpc/*', async (c) => {
  return handleORPCRequest(c, db);
});

// Serve Astro's client-side assets (CSS, JS bundles)
app.use('/_astro/*', serveStatic({ root: '../web/dist/client/' }));

// Delegate all other routes to Astro SSR handler
const { handler: astroHandler } = await import('../web/dist/server/entry.mjs');
app.all('*', async (c) => {
  return astroHandler(c.req.raw);
});

// Start server
console.warn(`Starting Mastragen Orchestrator on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
