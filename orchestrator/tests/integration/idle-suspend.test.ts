import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import type { Database } from '../../src/db/types.ts';
import { IdleSuspendJob } from '../../src/jobs/idle-suspend.ts';
import { IdleConfigService } from '../../src/services/idle-config-service.ts';

/**
 * T036: Integration tests for idle detection and auto-suspend flow
 *
 * Tests:
 * 1. Session with recent activity is not suspended
 * 2. Session exceeding idle timeout is suspended with reason "auto"
 * 3. Session in warning window gets warning flag
 * 4. Activity update resets idle timer
 * 5. Project-specific config overrides global
 */
describe('Idle suspend integration', () => {
  let db: Kysely<Database>;
  const testDbPath = ':memory:';

  beforeAll(async () => {
    db = createDatabase(testDbPath);
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up sessions and projects between tests
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('idle_config').where('project_id', 'is not', null).execute();
    await db.deleteFrom('projects').execute();
  });

  async function createTestSession(
    id: string,
    projectId: string,
    state: 'active' | 'suspended',
    lastActivityAt: Date
  ) {
    await db
      .insertInto('sessions')
      .values({
        id,
        project_id: projectId,
        state,
        artifact_name: 'test-artifact',
        environment: 'development',
        branch_name: 'test-branch',
        last_activity_at: lastActivityAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  }

  async function createTestProject(id: string) {
    await db
      .insertInto('projects')
      .values({
        id,
        name: 'test-project',
        github_repo: 'test-org/test-project',
        default_branch: 'main',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  }

  describe('IdleSuspendJob run', () => {
    test('should not suspend session with recent activity', async () => {
      const projectId = 'project-recent-activity';
      await createTestProject(projectId);

      // Create session with activity 5 minutes ago (within 30-minute default timeout)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      await createTestSession('session-recent', projectId, 'active', fiveMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(0);
      expect(result.sessionsWarned).toBe(0);

      // Verify session is still active
      const session = await db
        .selectFrom('sessions')
        .selectAll()
        .where('id', '=', 'session-recent')
        .executeTakeFirst();
      expect(session?.state).toBe('active');
    });

    test('should suspend session exceeding idle timeout with reason auto', async () => {
      const projectId = 'project-idle-timeout';
      await createTestProject(projectId);

      // Create session with activity 35 minutes ago (exceeds 30-minute default timeout)
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await createTestSession('session-idle', projectId, 'active', thirtyFiveMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(1);

      // Verify session is suspended with reason 'auto'
      const session = await db
        .selectFrom('sessions')
        .selectAll()
        .where('id', '=', 'session-idle')
        .executeTakeFirst();
      expect(session?.state).toBe('suspended');
      expect(session?.suspension_reason).toBe('auto');
    });

    test('should warn session in warning window', async () => {
      const projectId = 'project-warning';
      await createTestProject(projectId);

      // Create session with activity 26 minutes ago (in 5-minute warning window before 30-min timeout)
      const twentySixMinutesAgo = new Date(Date.now() - 26 * 60 * 1000);
      await createTestSession('session-warning', projectId, 'active', twentySixMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      expect(result.sessionsWarned).toBe(1);
      expect(result.sessionsSuspended).toBe(0);

      // Session should still be active (warning only)
      const session = await db
        .selectFrom('sessions')
        .selectAll()
        .where('id', '=', 'session-warning')
        .executeTakeFirst();
      expect(session?.state).toBe('active');
    });

    test('should not process already suspended sessions', async () => {
      const projectId = 'project-already-suspended';
      await createTestProject(projectId);

      // Create an already suspended session
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await createTestSession('session-suspended', projectId, 'suspended', thirtyFiveMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(0);
      expect(result.sessionsWarned).toBe(0);
    });
  });

  describe('Activity update resets idle timer', () => {
    test('should reset idle status after activity update', async () => {
      const projectId = 'project-activity-reset';
      await createTestProject(projectId);

      // Create session with activity 26 minutes ago (in warning window)
      const twentySixMinutesAgo = new Date(Date.now() - 26 * 60 * 1000);
      await createTestSession('session-reset', projectId, 'active', twentySixMinutesAgo);

      const job = new IdleSuspendJob(db);

      // First check - should be in warning state
      const idleStatus = await job.getIdleStatus('session-reset');
      expect(idleStatus?.warningIssued).toBe(true);

      // Update activity (simulate "Keep Working" button)
      await db
        .updateTable('sessions')
        .set({ last_activity_at: new Date().toISOString() })
        .where('id', '=', 'session-reset')
        .execute();

      // Second check - should no longer be in warning state
      const newIdleStatus = await job.getIdleStatus('session-reset');
      expect(newIdleStatus?.warningIssued).toBe(false);
      expect(newIdleStatus?.idleSinceMinutes).toBeLessThan(1);
    });
  });

  describe('Project-specific config overrides global', () => {
    test('should use project config when available', async () => {
      const projectId = 'project-custom-config';
      await createTestProject(projectId);

      // Set project-specific config with 60-minute timeout
      const idleConfigService = new IdleConfigService(db);
      await idleConfigService.setProjectConfig(projectId, {
        idleTimeoutMinutes: 60,
        warningMinutes: 10,
        enabled: true,
      });

      // Create session with activity 35 minutes ago
      // This would be suspended with global 30-min config, but not with 60-min project config
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await createTestSession('session-custom', projectId, 'active', thirtyFiveMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      // Should NOT be suspended because project config has 60-minute timeout
      expect(result.sessionsSuspended).toBe(0);

      const session = await db
        .selectFrom('sessions')
        .selectAll()
        .where('id', '=', 'session-custom')
        .executeTakeFirst();
      expect(session?.state).toBe('active');
    });

    test('should fall back to global config when project config not set', async () => {
      const projectId = 'project-global-fallback';
      await createTestProject(projectId);

      // No project-specific config - should use global 30-minute default
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await createTestSession('session-global', projectId, 'active', thirtyFiveMinutesAgo);

      const job = new IdleSuspendJob(db);
      const result = await job.run();

      // Should be suspended using global 30-minute config
      expect(result.sessionsSuspended).toBe(1);
    });
  });

  describe('getIdleStatus', () => {
    test('should return correct idle status for active session', async () => {
      const projectId = 'project-status-check';
      await createTestProject(projectId);

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await createTestSession('session-status', projectId, 'active', tenMinutesAgo);

      const job = new IdleSuspendJob(db);
      const status = await job.getIdleStatus('session-status');

      expect(status).not.toBeNull();
      expect(status?.sessionId).toBe('session-status');
      expect(status?.state).toBe('active');
      expect(status?.idleTimeoutMinutes).toBe(30);
      expect(status?.warningMinutes).toBe(5);
      expect(status?.idleSinceMinutes).toBeGreaterThanOrEqual(10);
      expect(status?.warningIssued).toBe(false);
      expect(status?.suspendAt).toBeNull();
    });

    test('should return null for non-existent session', async () => {
      const job = new IdleSuspendJob(db);
      const status = await job.getIdleStatus('non-existent-session');
      expect(status).toBeNull();
    });
  });
});
