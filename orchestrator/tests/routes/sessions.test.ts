import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { unlinkSync, existsSync } from 'node:fs';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrations/001_initial.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import type { Database } from '../../src/db/types.ts';
import type { Kysely } from 'kysely';

const TEST_DB_PATH = './data/test-sessions-routes.db';

describe('Sessions Routes', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations(db);

    projectsRepo = new ProjectsRepository(db);

    // Create a test project
    const project = await projectsRepo.create({
      name: 'test-project',
      github_repo: 'org/repo',
    });
    testProjectId = project.id;

    // Add dev environment
    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: {},
    });

    app = new Hono();
    app.route('/sessions', sessionsRoutes(db));
  });

  afterEach(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('POST /sessions', () => {
    test('creates a session and returns 201 with session data', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'my-feature',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.projectId).toBe(testProjectId);
      expect(body.artifactName).toBe('my-feature');
      expect(body.environment).toBe('dev');
      expect(body.state).toBe('active');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    test('returns session with URLs for active services', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'with-urls',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.urls).toBeDefined();
      expect(body.urls.cui).toMatch(/^http:\/\/localhost:\d+/);
      expect(body.urls.mastra).toMatch(/^http:\/\/localhost:\d+/);
      expect(body.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
      // astro may be null if not configured
    });

    test('returns 404 when project not found', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'nonexistent',
          artifactName: 'my-feature',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain('Project');
    });

    test('returns 404 when environment not found', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'my-feature',
          environment: 'nonexistent',
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain('Environment');
    });

    test('returns 409 when session already exists', async () => {
      // Create first session
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'duplicate',
          environment: 'dev',
        }),
      });

      // Try to create duplicate
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'duplicate',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body.error).toContain('already exists');
      expect(body.existingSessionId).toBeDefined();
    });

    test('validates artifactName format', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'INVALID_NAME!',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('artifactName');
    });
  });
});
