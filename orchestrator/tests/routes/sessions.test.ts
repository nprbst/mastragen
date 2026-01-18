import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrations/001_initial.ts';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';

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

      const body = (await res.json()) as Record<string, unknown>;
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

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.urls).toBeDefined();
      expect((body.urls as Record<string, unknown>).cui).toMatch(/^http:\/\/localhost:\d+/);
      expect((body.urls as Record<string, unknown>).mastra).toMatch(/^http:\/\/localhost:\d+/);
      expect((body.urls as Record<string, unknown>).vscode).toMatch(/^http:\/\/localhost:\d+/);
      // astro may be null if not configured
    });

    test('returns 404 when project not found', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'AAAAAA', // valid hex format but doesn't exist
          artifactName: 'my-feature',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(404);

      const body = (await res.json()) as Record<string, unknown>;
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

      const body = (await res.json()) as Record<string, unknown>;
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

      const body = (await res.json()) as Record<string, unknown>;
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

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
      expect(body.issues).toBeDefined();
      expect((body.issues as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('POST /sessions/:id/suspend', () => {
    test('suspends an active session and returns 200', async () => {
      // Create a session first
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'to-suspend',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      // Suspend the session
      const res = await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.state).toBe('suspended');
      expect(body.updatedAt).toBeDefined();
    });

    test('returns 404 when session not found', async () => {
      const res = await app.request('/sessions/nonexistent/suspend', {
        method: 'POST',
      });

      expect(res.status).toBe(404);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('not found');
    });

    test('returns 400 when session is already suspended', async () => {
      // Create and suspend a session
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'already-suspended',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      // Suspend once
      await app.request(`/sessions/${id}/suspend`, { method: 'POST' });

      // Try to suspend again
      const res = await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('not active');
    });
  });

  describe('POST /sessions/:id/resume', () => {
    test('resumes a suspended session and returns 200 with URLs', async () => {
      // Create and suspend a session
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'to-resume',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      await app.request(`/sessions/${id}/suspend`, { method: 'POST' });

      // Resume the session
      const res = await app.request(`/sessions/${id}/resume`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.state).toBe('active');
      expect(body.urls).toBeDefined();
      expect((body.urls as Record<string, unknown>).cui).toMatch(/^http:\/\/localhost:\d+/);
    });

    test('returns 404 when session not found', async () => {
      const res = await app.request('/sessions/nonexistent/resume', {
        method: 'POST',
      });

      expect(res.status).toBe(404);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('not found');
    });

    test('returns 400 when session is already active', async () => {
      // Create a session (already active)
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'already-active',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      // Try to resume an active session
      const res = await app.request(`/sessions/${id}/resume`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('already active');
    });
  });

  describe('GET /sessions/:id', () => {
    test('returns session with URLs for active session', async () => {
      // Create a session
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'get-test',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      // Get the session
      const res = await app.request(`/sessions/${id}`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.projectId).toBe(testProjectId);
      expect(body.artifactName).toBe('get-test');
      expect(body.state).toBe('active');
      expect(body.urls).toBeDefined();
      expect((body.urls as Record<string, unknown>).cui).toMatch(/^http:\/\/localhost:\d+/);
      expect((body.urls as Record<string, unknown>).mastra).toMatch(/^http:\/\/localhost:\d+/);
      expect((body.urls as Record<string, unknown>).vscode).toMatch(/^http:\/\/localhost:\d+/);
    });

    test('returns session without URLs for suspended session', async () => {
      // Create and suspend a session
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'suspended-get',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;

      await app.request(`/sessions/${id}/suspend`, { method: 'POST' });

      // Get the session
      const res = await app.request(`/sessions/${id}`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.state).toBe('suspended');
      expect(body.urls).toBeUndefined();
    });

    test('returns 404 when session not found', async () => {
      const res = await app.request('/sessions/nonexistent', {
        method: 'GET',
      });

      expect(res.status).toBe(404);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /sessions', () => {
    test('returns empty array when no sessions exist', async () => {
      const res = await app.request('/sessions', {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    test('returns all sessions', async () => {
      // Create two sessions
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'session-1',
          environment: 'dev',
        }),
      });

      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'session-2',
          environment: 'dev',
        }),
      });

      const res = await app.request('/sessions', {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    test('filters by state=active', async () => {
      // Create two sessions
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'active-session',
          environment: 'dev',
        }),
      });

      const res2 = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'suspended-session',
          environment: 'dev',
        }),
      });
      const { id: suspendedId } = (await res2.json()) as Record<string, unknown>;

      // Suspend one
      await app.request(`/sessions/${suspendedId}/suspend`, { method: 'POST' });

      // Filter by active
      const res = await app.request('/sessions?state=active', {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>[];
      expect(body.length).toBe(1);
      expect(body[0]?.state).toBe('active');
    });

    test('filters by state=suspended', async () => {
      // Create and suspend a session
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'to-suspend-list',
          environment: 'dev',
        }),
      });
      const { id } = (await createRes.json()) as Record<string, unknown>;
      await app.request(`/sessions/${id}/suspend`, { method: 'POST' });

      // Create active session
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'active-list',
          environment: 'dev',
        }),
      });

      // Filter by suspended
      const res = await app.request('/sessions?state=suspended', {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>[];
      expect(body.length).toBe(1);
      expect(body[0]?.state).toBe('suspended');
    });

    test('filters by projectId', async () => {
      // Create another project
      const project2 = await projectsRepo.create({
        name: 'other-project',
        github_repo: 'org/other',
      });
      await projectsRepo.addEnvironment(project2.id, {
        name: 'dev',
        env_vars: {},
      });

      // Create sessions in both projects
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'project1-session',
          environment: 'dev',
        }),
      });

      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project2.id,
          artifactName: 'project2-session',
          environment: 'dev',
        }),
      });

      // Filter by projectId
      const res = await app.request(`/sessions?projectId=${testProjectId}`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>[];
      expect(body.length).toBe(1);
      expect(body[0]?.projectId).toBe(testProjectId);
    });
  });
});
