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
    await db.deleteFrom('project_skills').execute();
    await db.deleteFrom('projects').execute();
  });

  describe('GET /projects/:projectId/skills', () => {
    test('should return empty array when no skills exist', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });

    test('should return 404 for non-existent project', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.route('/projects', skillsRoutes(db));

      const res = await app.request('/projects/non-existent/skills');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:projectId/skills', () => {
    test('should create a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      app.route('/projects', skillsRoutes(db));

      // Create first skill
      await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-skill',
          description: 'First skill',
          content: '# First',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      app.route('/projects', skillsRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/skills/non-existent`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /projects/:projectId/skills/:id', () => {
    test('should update a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  describe('DELETE /projects/:projectId/skills/:id', () => {
    test('should delete a skill', async () => {
      const { skillsRoutes } = await import('../../../src/routes/skills.ts');
      const app = new Hono();
      app.route('/projects', skillsRoutes(db));

      // Create skill
      const createRes = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/projects/${testProjectId}/skills/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
