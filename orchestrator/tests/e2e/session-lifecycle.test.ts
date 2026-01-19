import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { healthRoutes } from '../../src/routes/health.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';

const TEST_DB_PATH = './data/test-e2e-lifecycle.db';

describe('Session Lifecycle E2E', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);

    projectsRepo = new ProjectsRepository(db);

    // Create a test project with environment
    const project = await projectsRepo.create({
      name: 'e2e-test-project',
      github_repo: 'org/e2e-repo',
    });
    testProjectId = project.id;

    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: { TEST_VAR: 'test-value' },
    });

    // Setup app with all routes
    app = new Hono();
    app.route('/health', healthRoutes(db));
    app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  test('complete session lifecycle: create → suspend → resume → list → get', async () => {
    // Step 1: Verify health endpoint
    const healthRes = await app.request('/health');
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as Record<string, unknown>;
    expect(health.status).toBe('ok');

    // Step 2: Create a session
    const createRes = await app.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: testProjectId,
        artifactName: 'lifecycle-test',
        environment: 'dev',
      }),
    });
    expect(createRes.status).toBe(201);

    const session = (await createRes.json()) as Record<string, unknown>;
    expect(session.id).toBeDefined();
    expect(session.state).toBe('active');
    expect(session.urls).toBeDefined();
    expect((session.urls as Record<string, unknown>).vscode).toMatch(/^http:\/\/localhost:\d+/);

    const sessionId = session.id;

    // Step 3: Verify session appears in list
    const listRes1 = await app.request('/sessions');
    expect(listRes1.status).toBe(200);
    const sessions1 = (await listRes1.json()) as Record<string, unknown>[];
    expect(sessions1.length).toBe(1);
    expect(sessions1[0]?.id).toBe(sessionId);

    // Step 4: Get session details
    const getRes1 = await app.request(`/sessions/${sessionId}`);
    expect(getRes1.status).toBe(200);
    const sessionDetails1 = (await getRes1.json()) as Record<string, unknown>;
    expect(sessionDetails1.id).toBe(sessionId);
    expect(sessionDetails1.state).toBe('active');
    expect(sessionDetails1.urls).toBeDefined();

    // Step 5: Suspend the session
    const suspendRes = await app.request(`/sessions/${sessionId}/suspend`, {
      method: 'POST',
    });
    expect(suspendRes.status).toBe(200);
    const suspended = (await suspendRes.json()) as Record<string, unknown>;
    expect(suspended.state).toBe('suspended');

    // Step 6: Verify session state changed
    const getRes2 = await app.request(`/sessions/${sessionId}`);
    expect(getRes2.status).toBe(200);
    const sessionDetails2 = (await getRes2.json()) as Record<string, unknown>;
    expect(sessionDetails2.state).toBe('suspended');
    expect(sessionDetails2.urls).toBeUndefined();

    // Step 7: Filter list by state=active (should be empty)
    const listActiveRes = await app.request('/sessions?state=active');
    expect(listActiveRes.status).toBe(200);
    const activeSessions = (await listActiveRes.json()) as Record<string, unknown>[];
    expect(activeSessions.length).toBe(0);

    // Step 8: Filter list by state=suspended
    const listSuspendedRes = await app.request('/sessions?state=suspended');
    expect(listSuspendedRes.status).toBe(200);
    const suspendedSessions = (await listSuspendedRes.json()) as Record<string, unknown>[];
    expect(suspendedSessions.length).toBe(1);
    expect(suspendedSessions[0]?.id).toBe(sessionId);

    // Step 9: Resume the session
    const resumeRes = await app.request(`/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
    expect(resumeRes.status).toBe(200);
    const resumed = (await resumeRes.json()) as Record<string, unknown>;
    expect(resumed.state).toBe('active');
    expect(resumed.urls).toBeDefined();

    // Step 10: Final verification - session is active again
    const getRes3 = await app.request(`/sessions/${sessionId}`);
    expect(getRes3.status).toBe(200);
    const sessionDetails3 = (await getRes3.json()) as Record<string, unknown>;
    expect(sessionDetails3.state).toBe('active');
    expect(sessionDetails3.urls).toBeDefined();

    // Step 11: Filter by projectId
    const listByProjectRes = await app.request(`/sessions?projectId=${testProjectId}`);
    expect(listByProjectRes.status).toBe(200);
    const projectSessions = (await listByProjectRes.json()) as Record<string, unknown>[];
    expect(projectSessions.length).toBe(1);
    expect(projectSessions[0]?.projectId).toBe(testProjectId);
  });

  test('handles multiple sessions correctly', async () => {
    // Create multiple sessions
    const session1Res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: testProjectId,
        artifactName: 'multi-1',
        environment: 'dev',
      }),
    });
    const session1 = (await session1Res.json()) as Record<string, unknown>;

    const session2Res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: testProjectId,
        artifactName: 'multi-2',
        environment: 'dev',
      }),
    });
    await session2Res.json(); // Consume response

    // Suspend one session
    await app.request(`/sessions/${session1.id}/suspend`, { method: 'POST' });

    // Verify filter returns correct counts
    const activeRes = await app.request('/sessions?state=active');
    const suspendedRes = await app.request('/sessions?state=suspended');

    const active = (await activeRes.json()) as Record<string, unknown>[];
    const suspended = (await suspendedRes.json()) as Record<string, unknown>[];

    // Should have the session from previous test (resumed) + session2 active
    expect(active.filter((s) => (s.artifactName as string).startsWith('multi-')).length).toBe(1);
    // Should have session1 suspended + session from previous test that was never unsuspended
    expect(suspended.filter((s) => (s.artifactName as string).startsWith('multi-')).length).toBe(1);
  });
});
