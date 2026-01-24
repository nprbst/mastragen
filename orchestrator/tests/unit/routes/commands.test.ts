import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../../helpers/test-db.ts';
import { createTestJwt } from '../../helpers/jwt.ts';

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
  let testProjectId: string;
  let testUserId: string;
  let testInstallationId: string;
  let authToken: string;
  let authHeaders: Record<string, string>;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  beforeEach(async () => {
    const now = new Date().toISOString();

    // Create test user
    testUserId = 'user-commands-test';
    await db
      .insertInto('users')
      .values({
        id: testUserId,
        email: 'commands@test.com',
        name: 'Test User',
        github_id: 12345,
        github_login: 'testuser',
        github_access_token: 'test-token',
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test GitHub installation
    testInstallationId = 'inst-commands-test';
    await db
      .insertInto('github_app_installations')
      .values({
        id: testInstallationId,
        installation_id: 99999,
        account_type: 'Organization',
        account_login: 'test-org',
        account_id: 67890,
        permissions: '{}',
        repository_selection: 'all',
        suspended_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test project linked to installation
    testProjectId = 'proj-commands-test';
    await db
      .insertInto('projects')
      .values({
        id: testProjectId,
        name: 'Test Project',
        github_repo: 'test-org/test-repo',
        default_branch: 'main',
        branch_prefix: 'mg/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: testInstallationId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create auth token
    authToken = await createTestJwt({ sub: testUserId, email: 'commands@test.com', name: 'Test User' });
    authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // Mock GitHub API calls for auth middleware
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url instanceof Request ? url.url : url.toString();

      if (urlStr.includes('api.github.com/repos/')) {
        return new Response(JSON.stringify({
          permissions: { admin: true, push: true, pull: true }
        }), { status: 200 });
      }

      if (urlStr.includes('api.github.com/user/installations')) {
        return new Response(JSON.stringify({
          installations: [{ id: 99999 }]
        }), { status: 200 });
      }

      return originalFetch(url);
    }) as typeof fetch;
  });

  afterEach(async () => {
    // Restore fetch
    globalThis.fetch = originalFetch;

    // Clean up test data
    await db.deleteFrom('project_commands').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('github_app_installations').execute();
    await db.deleteFrom('users').execute();
  });

  describe('GET /projects/:projectId/commands', () => {
    test('should return empty array when no commands exist', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });

    test('should return 404 for non-existent project', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      const res = await app.request('/projects/non-existent/commands');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:projectId/commands', () => {
    test('should create a command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      // Create first command
      await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'deploy',
          description: 'First deploy',
          content: '# Deploy v1',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/commands/non-existent`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /projects/:projectId/commands/:id', () => {
    test('should update a command', async () => {
      const { commandsRoutes } = await import('../../../src/routes/commands.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
        headers: authHeaders,
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
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', commandsRoutes(db));

      // Create command
      const createRes = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
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
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/projects/${testProjectId}/commands/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
