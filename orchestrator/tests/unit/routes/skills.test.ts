import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../../helpers/test-db.ts';
import { createTestJwt } from '../../helpers/jwt.ts';

const TEST_DB_PATH = './data/test-skills-routes.db';

/**
 * T065: Unit test for skills CRUD operations
 *
 * Tests the skills routes:
 * - GET /projects/:projectId/skills - List project skills
 * - POST /projects/:projectId/skills - Create a skill
 * - GET /projects/:projectId/skills/:id - Get a skill
 * - PUT /projects/:projectId/skills/:id - Update a skill
 * - DELETE /projects/:projectId/skills/:id - Delete a skill
 */
describe('skills routes', () => {
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
    testUserId = 'user-skills-test';
    await db
      .insertInto('users')
      .values({
        id: testUserId,
        email: 'skills@test.com',
        name: 'Test User',
        github_id: 12345,
        github_login: 'testuser',
        github_access_token: 'test-token',
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test GitHub installation
    testInstallationId = 'inst-skills-test';
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
    testProjectId = 'proj-skills-test';
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
    authToken = await createTestJwt({ sub: testUserId, email: 'skills@test.com', name: 'Test User' });
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
    await db.deleteFrom('project_skills').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('github_app_installations').execute();
    await db.deleteFrom('users').execute();
  });

  describe('GET /projects/:projectId/skills', () => {
    test('should return empty array when no skills exist', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });

    test('should return 404 for non-existent project', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      const res = await app.request('/projects/non-existent/skills');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:projectId/skills', () => {
    test('should create a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'mastra-development',
          description: 'Mastra framework development patterns',
          content: '# Mastra Development\n\nUse Mastra patterns...',
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        name: string;
        description: string;
        content: string;
      };
      expect(body.name).toBe('mastra-development');
      expect(body.description).toBe('Mastra framework development patterns');
    });

    test('should return 400 for missing required fields', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'test-skill',
          // missing description and content
        }),
      });

      expect(res.status).toBe(400);
    });

    test('should return 409 for duplicate skill name', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      // Create first skill
      await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'test-skill',
          description: 'First skill',
          content: '# First',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'test-skill',
          description: 'Second skill',
          content: '# Second',
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /projects/:projectId/skills/:id', () => {
    test('should return a skill by ID', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'test-skill',
          description: 'Test skill',
          content: '# Test',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Get skill
      const res = await app.request(`/projects/${testProjectId}/skills/${created.id}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe('test-skill');
    });

    test('should return 404 for non-existent skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills/non-existent`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /projects/:projectId/skills/:id', () => {
    test('should update a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'old-name',
          description: 'Old description',
          content: '# Old',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Update skill
      const res = await app.request(`/projects/${testProjectId}/skills/${created.id}`, {
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

  describe('DELETE /projects/:projectId/skills/:id', () => {
    test('should delete a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'to-delete',
          description: 'Will be deleted',
          content: '# Delete me',
        }),
      });
      const created = (await createRes.json()) as { id: string };

      // Delete skill
      const res = await app.request(`/projects/${testProjectId}/skills/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/projects/${testProjectId}/skills/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
