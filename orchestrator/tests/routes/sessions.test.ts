import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';

const TEST_DB_PATH = './data/test-sessions-routes.db';

describe('Sessions Routes', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);

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
    // Add db to context (like the main app does)
    app.use('*', async (c, next) => {
      // @ts-expect-error - db is added dynamically to context for middleware use
      c.set('db', db);
      await next();
    });
    app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.urls).toBeDefined();
      expect((body.urls as Record<string, unknown>).mastra).toMatch(/^http:\/\/localhost:\d+/);
      expect((body.urls as Record<string, unknown>).vscode).toMatch(/^http:\/\/localhost:\d+/);
      // astro may be null if not configured
    });

    test('returns configMissing field in response', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'config-test',
          environment: 'dev',
          claudeToken: 'test-token',
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as Record<string, unknown>;
      // When Docker is disabled, configMissing should be true (can't check volume)
      expect(body.configMissing).toBe(true);
    });
  });

  describe('POST /sessions/:id/scaffold-config', () => {
    test('scaffolds config and returns 201', async () => {
      // Create a session first
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'scaffold-test',
          environment: 'dev',
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      // Scaffold config
      const res = await app.request(`/sessions/${id}/scaffold-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          components: {
            phoenix: { enabled: true },
          },
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.configPath).toBe('.mastragen/config.yaml');
    });

    test('returns 401 without auth token', async () => {
      const res = await app.request('/sessions/nonexistent/scaffold-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          components: { phoenix: { enabled: true } },
        }),
      });

      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid request body', async () => {
      // Create a session first
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'scaffold-invalid',
          environment: 'dev',
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      // Send invalid body (missing components)
      const res = await app.request(`/sessions/${id}/scaffold-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
    });

    test('returns 404 when project not found', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'AAAAAA', // valid hex format but doesn't exist
          artifactName: 'my-feature',
          environment: 'dev',
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      // Suspend the session (with session token)
      const res = await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.state).toBe('suspended');
      expect(body.updatedAt).toBeDefined();
    });

    test('returns 401 when no token provided', async () => {
      const res = await app.request('/sessions/nonexistent/suspend', {
        method: 'POST',
      });

      expect(res.status).toBe(401);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Unauthorized');
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
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      // Suspend once
      await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      // Try to suspend again
      const res = await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
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
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      // Resume the session (with session token)
      const res = await app.request(`/sessions/${id}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.state).toBe('active');
      expect(body.urls).toBeDefined();
      expect((body.urls as Record<string, unknown>).vscode).toMatch(/^http:\/\/localhost:\d+/);
      expect(body.sessionToken).toBeDefined(); // New token returned on resume
    });

    // Note: resume does NOT require session auth - it's called by CLI when session is suspended

    test('returns 400 when session is already active', async () => {
      // Create a session (already active)
      const createRes = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'already-active',
          environment: 'dev',
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      // Try to resume an active session (with session token)
      const res = await app.request(`/sessions/${id}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
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
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;

      await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

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
          claudeToken: 'test-token',
        }),
      });

      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'session-2',
          environment: 'dev',
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
        }),
      });

      const res2 = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'suspended-session',
          environment: 'dev',
          claudeToken: 'test-token',
        }),
      });
      const { id: suspendedId, sessionToken } = (await res2.json()) as Record<string, unknown>;

      // Suspend one (with session token)
      await app.request(`/sessions/${suspendedId}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

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
          claudeToken: 'test-token',
        }),
      });
      const { id, sessionToken } = (await createRes.json()) as Record<string, unknown>;
      await app.request(`/sessions/${id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      // Create active session
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'active-list',
          environment: 'dev',
          claudeToken: 'test-token',
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
          claudeToken: 'test-token',
        }),
      });

      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project2.id,
          artifactName: 'project2-session',
          environment: 'dev',
          claudeToken: 'test-token',
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
