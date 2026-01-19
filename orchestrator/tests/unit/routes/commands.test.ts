import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createDatabase } from '../../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../../src/db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from '../../../src/db/migrations/003_cui_config.ts';
import { ProjectsRepository } from '../../../src/repositories/index.ts';

const TEST_DB_PATH = './data/test-commands-routes.db';

/**
 * T064: Unit test for commands CRUD operations
 *
 * Tests the commands routes:
 * - GET /projects/:projectId/commands - List project commands
 * - POST /projects/:projectId/commands - Create a command
 * - GET /projects/:projectId/commands/:id - Get a command
 * - PUT /projects/:projectId/commands/:id - Update a command
 * - DELETE /projects/:projectId/commands/:id - Delete a command
 */
describe('commands routes', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);
    await runMigrations003(db);

    projectsRepo = new ProjectsRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Create test project
    const project = await projectsRepo.create({
      name: 'Test Project',
      github_repo: 'test-org/test-repo',
      default_branch: 'main',
      branch_prefix: 'mg/',
      mastra_path: '.',
      ui_sandbox_path: null,
    });
    testProjectId = project.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.deleteFrom('project_commands').execute();
    await db.deleteFrom('projects').execute();
  });

  describe('GET /projects/:projectId/commands', () => {
    test('should return empty array when no commands exist', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });

    test('should return 404 for non-existent project', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      const res = await app.request('/projects/non-existent/commands');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:projectId/commands', () => {
    test('should create a command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'deploy',
          description: 'Deploy the application',
          content: '# Deploy\n\nRun `npm run deploy`',
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        name: string;
        description: string;
        content: string;
      };
      expect(body.name).toBe('deploy');
      expect(body.description).toBe('Deploy the application');
      expect(body.content).toBe('# Deploy\n\nRun `npm run deploy`');
    });

    test('should return 400 for missing required fields', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'deploy',
          // missing description and content
        }),
      });

      expect(res.status).toBe(400);
    });

    test('should return 409 for duplicate command name', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      // Create first command
      await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'deploy',
          description: 'First deploy',
          content: '# Deploy v1',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'deploy',
          description: 'Second deploy',
          content: '# Deploy v2',
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /projects/:projectId/commands/:id', () => {
    test('should return a command by ID', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-cmd',
          description: 'Test command',
          content: '# Test',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Get command
      const res = await app.request(`/projects/${testProjectId}/commands/${created.id}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe('test-cmd');
    });

    test('should return 404 for non-existent command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands/non-existent`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /projects/:projectId/commands/:id', () => {
    test('should update a command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'old-name',
          description: 'Old description',
          content: '# Old',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Update command
      const res = await app.request(`/projects/${testProjectId}/commands/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'new-name',
          description: 'New description',
          content: '# New',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        name: string;
        description: string;
        content: string;
      };
      expect(body.name).toBe('new-name');
      expect(body.description).toBe('New description');
    });
  });

  describe('DELETE /projects/:projectId/commands/:id', () => {
    test('should delete a command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'to-delete',
          description: 'Will be deleted',
          content: '# Delete me',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Delete command
      const res = await app.request(`/projects/${testProjectId}/commands/${created.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/projects/${testProjectId}/commands/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
