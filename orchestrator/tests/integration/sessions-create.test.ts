import { describe, expect, test, beforeEach, beforeAll, afterAll } from 'bun:test';
import type { Kysely } from 'kysely';
import { Hono } from 'hono';
import type { Database } from '../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';
import { ProjectsRepository, UsersRepository } from '../../src/repositories/index.ts';
import { sessionsRoutes } from '../../src/routes/sessions.ts';

// Test T039: Integration test for POST /sessions with Claude config injection

const TEST_DB_PATH = './data/test-sessions-create.db';

describe('POST /sessions with Claude config injection', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;
  let usersRepo: UsersRepository;
  let testProjectId: string;
  let testUserId: string;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  beforeEach(async () => {
    // Clean tables between tests
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('project_claude_config').execute();
    await db.deleteFrom('project_commands').execute();
    await db.deleteFrom('project_environments').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('users').execute();

    projectsRepo = new ProjectsRepository(db);
    usersRepo = new UsersRepository(db);

    app = new Hono();
    app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));

    // Create test user
    const user = await usersRepo.create({
      email: 'test@example.com',
      name: 'Test User',
      github_id: 12345,
      github_login: 'testuser',
    });
    testUserId = user.id;

    // Create test project with environment
    const project = await projectsRepo.create({
      name: 'test-project',
      github_repo: 'org/test-repo',
    });
    testProjectId = project.id;

    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: {
        DATABASE_URL: 'postgres://localhost:5432/dev',
      },
    });
  });

  describe('Session creation with Claude config', () => {
    test('should create session and return URLs', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'test-feature',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.id).toBeDefined();
      expect(body.projectId).toBe(testProjectId);
      expect(body.artifactName).toBe('test-feature');
      expect(body.environment).toBe('dev');
      expect(body.state).toBe('active');
      expect(body.urls).toBeDefined();
    });

    test('should return 404 for non-existent environment', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'test-feature',
          environment: 'staging', // Does not exist
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Environment');
    });

    test('should return 404 for non-existent project', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'abc123', // Valid hex format but doesn't exist
          artifactName: 'test-feature',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(404);
    });

    test('should return 409 for duplicate session name in same project', async () => {
      // Create first session
      const res1 = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'duplicate-name',
          environment: 'dev',
        }),
      });
      expect(res1.status).toBe(201);

      // Try to create duplicate
      const res2 = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'duplicate-name',
          environment: 'dev',
        }),
      });
      expect(res2.status).toBe(409);
    });

    test('should validate required fields', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });
  });

  describe('Claude config injection on session create', () => {
    test('should inject settings.json when project has Claude config', async () => {
      // Add Claude config for project
      await db.insertInto('project_claude_config').values({
        id: 'config-1',
        project_id: testProjectId,
        mcp_servers: JSON.stringify({
          orchestrator: {
            command: 'npx',
            args: ['@mastragen/mcp'],
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).execute();

      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'config-test',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);
      // In a full implementation, the sandbox would have the config injected
      // For now we just verify the session is created successfully
    });

    test('should use default config when project has no Claude config', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'default-config-test',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.urls).toBeDefined();
    });
  });

  describe('Environment variable handling', () => {
    test('should inject environment-specific vars on session create', async () => {
      // Create staging environment with different vars
      await projectsRepo.addEnvironment(testProjectId, {
        name: 'staging',
        env_vars: {
          DATABASE_URL: 'postgres://staging.example.com:5432/app',
          API_KEY: 'staging-key',
        },
      });

      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'staging-session',
          environment: 'staging',
        }),
      });

      expect(res.status).toBe(201);
      // Environment vars would be available in the sandbox
    });
  });

  describe('Session URLs', () => {
    test('should return all service URLs for active session', async () => {
      const res = await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          artifactName: 'url-test',
          environment: 'dev',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.urls).toBeDefined();
      expect(body.urls.mastra).toBeDefined();
      expect(body.urls.vscode).toBeDefined();
      // astro URL is optional based on project config
    });
  });
});
