import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
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

// Routes
app.route('/auth', createAuthRoutes(db));
app.route('/health', healthRoutes(db));
app.route('/projects', projectsRoutes(db));
app.route('/sessions', sessionsRoutes(db));

// GitHub webhook handler
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'development-webhook-secret';
app.route('/webhooks', createWebhookRoutes(db, webhookSecret));

// oRPC handler for type-safe API calls
app.all('/rpc/*', async (c) => {
  return handleORPCRequest(c, db);
});

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'mastragen-orchestrator',
    version: process.env.npm_package_version ?? '0.1.0',
    docs: '/health',
    rpc: '/rpc',
  });
});

// Start server
console.warn(`Starting Mastragen Orchestrator on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
