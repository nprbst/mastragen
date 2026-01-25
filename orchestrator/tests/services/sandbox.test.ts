import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';
import { SandboxService } from '../../src/services/sandbox.ts';
import { cleanupTestDb, createTestDb } from '../helpers/test-db.ts';

const TEST_DB_PATH = './data/test-sandbox-service.db';

describe('SandboxService', () => {
  let db: Kysely<Database>;
  let sandboxService: SandboxService;
  let projectsRepo: ProjectsRepository;
  let sessionsRepo: SessionsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);

    projectsRepo = new ProjectsRepository(db);
    sessionsRepo = new SessionsRepository(db);

    // Create sandbox service with mocked Docker
    sandboxService = new SandboxService({
      projectsRepo,
      sessionsRepo,
      dockerEnabled: false, // Disable Docker for unit tests
    });

    // Create a test project
    const project = await projectsRepo.create({
      name: 'sandbox-test-project',
      github_repo: 'org/repo',
    });
    testProjectId = project.id;

    // Add dev environment
    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: { API_KEY: 'test-key' },
    });
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('create', () => {
    test('creates a new session', async () => {
      const result = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'my-sandbox',
        environment: 'dev',
      });

      expect(result.session).toBeDefined();
      expect(result.session.id).toBeDefined();
      expect(result.session.project_id).toBe(testProjectId);
      expect(result.session.artifact_name).toBe('my-sandbox');
      expect(result.session.environment).toBe('dev');
      expect(result.session.state).toBe('active');
    });

    test('returns service URLs', async () => {
      const result = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'with-urls',
        environment: 'dev',
      });

      expect(result.urls).toBeDefined();
      expect(result.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
      expect(result.urls.mastra).toMatch(/^http:\/\/localhost:\d+/);
      expect(result.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
    });

    test('throws when project not found', async () => {
      await expect(
        sandboxService.create({
          projectId: 'nonexistent',
          artifactName: 'test',
          environment: 'dev',
        })
      ).rejects.toThrow(/Project not found/);
    });

    test('throws when environment not found', async () => {
      await expect(
        sandboxService.create({
          projectId: testProjectId,
          artifactName: 'test',
          environment: 'nonexistent',
        })
      ).rejects.toThrow(/Environment not found/);
    });

    test('throws when session already exists', async () => {
      await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'duplicate',
        environment: 'dev',
      });

      await expect(
        sandboxService.create({
          projectId: testProjectId,
          artifactName: 'duplicate',
          environment: 'dev',
        })
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('getServiceUrls', () => {
    test('returns URLs for all services', async () => {
      const result = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'url-test',
        environment: 'dev',
      });

      const urls = sandboxService.getServiceUrls(result.session.id);

      expect(urls.mastra).toBe('http://localhost:4111');
      expect(urls.vscode).toBe('http://localhost:8080');
    });

    test('returns astro URL when configured', async () => {
      // Create project with UI sandbox
      const projectWithUi = await projectsRepo.create({
        name: 'ui-project',
        github_repo: 'org/ui-repo',
        ui_sandbox_path: 'packages/ui',
      });
      await projectsRepo.addEnvironment(projectWithUi.id, {
        name: 'dev',
        env_vars: {},
      });

      const result = await sandboxService.create({
        projectId: projectWithUi.id,
        artifactName: 'ui-test',
        environment: 'dev',
      });

      expect(result.urls.astro).toBe('http://localhost:4321');
    });

    test('returns null for astro when not configured', async () => {
      const result = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'no-astro',
        environment: 'dev',
      });

      expect(result.urls.astro).toBeNull();
    });
  });

  describe('generateWorkspaceVolumeName', () => {
    test('generates consistent volume name for session', () => {
      const volumeName1 = sandboxService.generateWorkspaceVolumeName(testProjectId, 'my-feature');
      const volumeName2 = sandboxService.generateWorkspaceVolumeName(testProjectId, 'my-feature');

      expect(volumeName1).toBe(volumeName2);
      expect(volumeName1).toContain('mastragen');
      expect(volumeName1).toContain('my-feature');
    });

    test('generates different names for different sessions', () => {
      const volumeName1 = sandboxService.generateWorkspaceVolumeName(testProjectId, 'feature-a');
      const volumeName2 = sandboxService.generateWorkspaceVolumeName(testProjectId, 'feature-b');

      expect(volumeName1).not.toBe(volumeName2);
    });
  });

  describe('suspend', () => {
    test('suspends an active session', async () => {
      const { session } = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'to-suspend',
        environment: 'dev',
      });

      const result = await sandboxService.suspend(session.id);

      expect(result.state).toBe('suspended');
      expect(result.id).toBe(session.id);
    });

    test('throws when session not found', async () => {
      await expect(sandboxService.suspend('nonexistent')).rejects.toThrow(/Session not found/);
    });

    test('throws when session is already suspended', async () => {
      const { session } = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'already-suspended',
        environment: 'dev',
      });

      await sandboxService.suspend(session.id);

      await expect(sandboxService.suspend(session.id)).rejects.toThrow(/not active/);
    });
  });

  describe('resume', () => {
    test('resumes a suspended session', async () => {
      const { session } = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'to-resume',
        environment: 'dev',
      });

      await sandboxService.suspend(session.id);

      const result = await sandboxService.resume(session.id);

      expect(result.session.state).toBe('active');
      expect(result.session.id).toBe(session.id);
      expect(result.urls).toBeDefined();
    });

    test('throws when session not found', async () => {
      await expect(sandboxService.resume('nonexistent')).rejects.toThrow(/Session not found/);
    });

    test('throws when session is already active', async () => {
      const { session } = await sandboxService.create({
        projectId: testProjectId,
        artifactName: 'already-active',
        environment: 'dev',
      });

      await expect(sandboxService.resume(session.id)).rejects.toThrow(/already active/);
    });
  });
});
