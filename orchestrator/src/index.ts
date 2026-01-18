import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/index.ts';
import { runMigrations } from './db/migrations/001_initial.ts';
import { healthRoutes, projectsRoutes, sessionsRoutes } from './routes/index.ts';

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

// Routes
app.route('/health', healthRoutes(db));
app.route('/projects', projectsRoutes(db));
app.route('/sessions', sessionsRoutes(db));

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'mastragen-orchestrator',
    version: process.env.npm_package_version ?? '0.1.0',
    docs: '/health',
  });
});

// Start server
console.warn(`Starting Mastragen Orchestrator on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
