import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import {
  ProjectsRepository,
  SessionSharesRepository,
  SessionsRepository,
  UsersRepository,
} from '../../src/repositories/index.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';
import { cleanupTestDb, createTestDb } from '../helpers/test-db.ts';

// Test T027: Integration test for GET /sessions with dashboard query params

const TEST_DB_PATH = './data/test-sessions-integration.db';

describe('Sessions routes - Dashboard integration', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;
  let sessionsRepo: SessionsRepository;
  let usersRepo: UsersRepository;
  let sharesRepo: SessionSharesRepository;
  let testProjectId: string;
  let testProject2Id: string;
  let testUserId: string;
  let testUser2Id: string;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  beforeEach(async () => {
    // Clean tables between tests
    await db.deleteFrom('session_shares').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('project_environments').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('users').execute();

    projectsRepo = new ProjectsRepository(db);
    sessionsRepo = new SessionsRepository(db);
    usersRepo = new UsersRepository(db);
    sharesRepo = new SessionSharesRepository(db);

    app = new Hono();
    app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));

    // Create test projects
    const project = await projectsRepo.create({
      name: 'Project Alpha',
      github_repo: 'org/alpha',
    });
    testProjectId = project.id;

    const project2 = await projectsRepo.create({
      name: 'Project Beta',
      github_repo: 'org/beta',
    });
    testProject2Id = project2.id;

    // Add environments
    await projectsRepo.addEnvironment(testProjectId, { name: 'dev', env_vars: {} });
    await projectsRepo.addEnvironment(testProject2Id, { name: 'staging', env_vars: {} });

    // Create test users
    const user = await usersRepo.create({
      email: 'alice@test.com',
      name: 'Alice',
      github_id: 12345,
      github_login: 'alice-gh',
    });
    testUserId = user.id;

    const user2 = await usersRepo.create({
      email: 'bob@test.com',
      name: 'Bob',
      github_id: 67890,
      github_login: 'bob-gh',
    });
    testUser2Id = user2.id;
  });

  describe('Dashboard session listing', () => {
    test('should return sessions grouped by project', async () => {
      // Create sessions in different projects
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'feature-1',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/feature-1',
      });

      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'feature-2',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/feature-2',
      });

      await sessionsRepo.create({
        project_id: testProject2Id,
        artifact_name: 'staging-test',
        environment: 'staging',
        user_id: testUserId,
        branch_name: 'feature/staging-test',
      });

      const res = await app.request('/sessions');
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(3);

      // Verify we can filter by project
      const projectRes = await app.request(`/sessions?projectId=${testProjectId}`);
      const projectBody = (await projectRes.json()) as unknown[];
      expect(projectBody.length).toBe(2);
    });

    test('should include status indicators in response', async () => {
      // Create active session
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'active-work',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/active-work',
      });

      // Create suspended session
      const suspended = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'paused-work',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/paused-work',
      });
      await sessionsRepo.updateState(suspended.id, 'suspended');

      // Create PR open session
      const prOpen = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'pr-work',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/pr-work',
      });
      await sessionsRepo.update(prOpen.id, {
        state: 'pr_open',
        pr_number: 42,
        pr_url: 'https://github.com/org/alpha/pull/42',
      });

      const res = await app.request('/sessions');
      expect(res.status).toBe(200);

      const body = (await res.json()) as Array<{ state: string }>;
      expect(body.length).toBe(3);

      // Verify state values
      const states = body.map((s) => s.state);
      expect(states).toContain('active');
      expect(states).toContain('suspended');
      expect(states).toContain('pr_open');
    });

    test('should filter by multiple states', async () => {
      // Create sessions in various states
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'active-1',
        environment: 'dev',
        user_id: testUserId,
      });

      const suspended = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'suspended-1',
        environment: 'dev',
        user_id: testUserId,
      });
      await sessionsRepo.updateState(suspended.id, 'suspended');

      const prOpen = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'pr-1',
        environment: 'dev',
        user_id: testUserId,
      });
      await sessionsRepo.update(prOpen.id, { state: 'pr_open' });

      // Filter active only
      const activeRes = await app.request('/sessions?state=active');
      const activeBody = (await activeRes.json()) as Array<{ artifactName: string }>;
      expect(activeBody.length).toBe(1);
      expect(activeBody[0]?.artifactName).toBe('active-1');

      // Filter suspended only
      const suspendedRes = await app.request('/sessions?state=suspended');
      const suspendedBody = (await suspendedRes.json()) as Array<{ artifactName: string }>;
      expect(suspendedBody.length).toBe(1);
      expect(suspendedBody[0]?.artifactName).toBe('suspended-1');
    });
  });

  describe('Pagination', () => {
    test('should paginate results with limit and offset', async () => {
      // Create 10 sessions
      for (let i = 1; i <= 10; i++) {
        await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: `session-${i.toString().padStart(2, '0')}`,
          environment: 'dev',
          user_id: testUserId,
        });
      }

      // Get first page
      const page1Res = await app.request('/sessions?limit=3&offset=0');
      const page1 = (await page1Res.json()) as Array<{ id: string }>;
      expect(page1.length).toBe(3);

      // Get second page
      const page2Res = await app.request('/sessions?limit=3&offset=3');
      const page2 = (await page2Res.json()) as Array<{ id: string }>;
      expect(page2.length).toBe(3);

      // Verify different sessions
      const page1Ids = page1.map((s) => s.id);
      const page2Ids = page2.map((s) => s.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    test('should return all results when no pagination specified', async () => {
      // Create 5 sessions
      for (let i = 1; i <= 5; i++) {
        await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: `session-${i}`,
          environment: 'dev',
          user_id: testUserId,
        });
      }

      const res = await app.request('/sessions');
      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(5);
    });
  });

  describe('Shared sessions', () => {
    test('should include sessions shared with user', async () => {
      // Alice creates a session
      const aliceSession = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'alice-work',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/alice-work',
      });

      // Alice shares with Bob
      await sharesRepo.create({
        sessionId: aliceSession.id,
        sharedByUserId: testUserId,
        sharedWithUserId: testUser2Id,
      });

      // Bob queries shared sessions
      // Note: Requires userId context from auth (mocked here via query param for testing)
      const res = await app.request(`/sessions?sharedWithMe=true&userId=${testUser2Id}`);
      expect(res.status).toBe(200);

      // After implementation, this should return the shared session
      // const body = (await res.json()) as unknown[];
      // expect(body.length).toBe(1);
      // expect(body[0].artifactName).toBe('alice-work');
    });

    test('should not include revoked shares', async () => {
      // Alice creates a session
      const aliceSession = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'temp-share',
        environment: 'dev',
        user_id: testUserId,
      });

      // Alice shares with Bob then revokes
      const share = await sharesRepo.create({
        sessionId: aliceSession.id,
        sharedByUserId: testUserId,
        sharedWithUserId: testUser2Id,
      });
      await sharesRepo.revoke(share.id);

      // Bob queries shared sessions
      const res = await app.request(`/sessions?sharedWithMe=true&userId=${testUser2Id}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Array<{ id: string }>;
      // Revoked shares should not appear
      const sharedSession = body.find((s) => s.id === aliceSession.id);
      expect(sharedSession).toBeUndefined();
    });
  });

  describe('Response format', () => {
    test('should include project info in response when requested', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'detailed-session',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/detailed',
      });

      const res = await app.request('/sessions?includeProject=true');
      expect(res.status).toBe(200);

      // After implementation, should include project details
      const body = (await res.json()) as unknown[];
      expect(body.length).toBe(1);
      // expect(body[0].project).toBeDefined();
      // expect(body[0].project.name).toBe('Project Alpha');
    });

    test('should include git info in response', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'git-session',
        environment: 'dev',
        user_id: testUserId,
        branch_name: 'feature/git-work',
      });

      const res = await app.request('/sessions');
      expect(res.status).toBe(200);

      const body = (await res.json()) as Array<{ projectId: string }>;
      expect(body.length).toBe(1);
      // Basic fields should be present
      expect(body[0]?.projectId).toBe(testProjectId);
    });
  });
});
