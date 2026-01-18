import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/index.ts';
import { runMigrations as runMigrations001 } from './db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from './db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from './db/migrations/003_cui_config.ts';
import { authRoutes, healthRoutes, projectsRoutes, sessionsRoutes } from './routes/index.ts';

const config = loadConfig();

// Initialize database
const db = createDatabase(config.databasePath);

// Run migrations in order
await runMigrations001(db);
await runMigrations002(db);
await runMigrations003(db);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Routes
app.route('/auth', authRoutes(db));
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
