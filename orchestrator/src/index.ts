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
import { initializeKeyPair } from './lib/crypto.ts';

const config = loadConfig();

// Web UI dist path - configurable for Docker vs local dev
const webDistPath = process.env.WEB_DIST_PATH || '../web/dist';

// Import Astro SSR handler (Hono middleware from hono-astro-adapter)
const { handler: ssrHandler } = await import(`${webDistPath}/server/entry.mjs`);

// Initialize database
const db = createDatabase(config.databasePath);

// Run migrations
await runMigrations(db);

// Initialize encryption key pair for token encryption
initializeKeyPair();

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

// Health check at root (standard for load balancers/monitoring)
app.route('/health', healthRoutes(db));

// oRPC handler for type-safe API calls (stays at /rpc)
app.all('/rpc/*', async (c) => {
  return handleORPCRequest(c, db);
});

// Serve Astro's client-side assets (CSS, JS bundles)
app.use('/_astro/*', serveStatic({ root: `${webDistPath}/client/` }));

// Astro SSR handler (Hono middleware from hono-astro-adapter)
app.use(ssrHandler);

// Start server
console.warn(`Starting Mastragen Orchestrator on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
