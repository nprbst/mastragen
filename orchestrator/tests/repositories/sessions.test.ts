import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';

const TEST_DB_PATH = './data/test-sessions-repo.db';

describe('SessionsRepository', () => {
  let db: Kysely<Database>;
  let sessionsRepo: SessionsRepository;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);
    sessionsRepo = new SessionsRepository(db);
    projectsRepo = new ProjectsRepository(db);

    // Create a test project for sessions
    const project = await projectsRepo.create({
      name: 'session-test-project',
      github_repo: 'org/repo',
    });
    testProjectId = project.id;

    // Add a dev environment
    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: {},
    });
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('create', () => {
    test('creates a session with required fields', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'my-feature',
        environment: 'dev',
      });

      expect(session.id).toBeDefined();
      expect(session.id.length).toBe(6);
      expect(session.project_id).toBe(testProjectId);
      expect(session.artifact_name).toBe('my-feature');
      expect(session.environment).toBe('dev');
      expect(session.state).toBe('active');
      expect(session.container_id).toBeNull();
      expect(session.workspace_volume).toBeNull();
    });

    test('creates a session with container info', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'with-container',
        environment: 'dev',
        container_id: 'container-123',
        workspace_volume: 'volume-456',
      });

      expect(session.container_id).toBe('container-123');
      expect(session.workspace_volume).toBe('volume-456');
    });

    test('throws on duplicate (project_id, artifact_name)', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'duplicate',
        environment: 'dev',
      });

      await expect(
        sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'duplicate',
          environment: 'dev',
        })
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    test('returns session when found', async () => {
      const created = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'findable',
        environment: 'dev',
      });

      const found = await sessionsRepo.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.artifact_name).toBe('findable');
    });

    test('returns undefined when not found', async () => {
      const found = await sessionsRepo.findById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByProjectAndName', () => {
    test('returns session when found', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'unique-artifact',
        environment: 'dev',
      });

      const found = await sessionsRepo.findByProjectAndName(testProjectId, 'unique-artifact');

      expect(found).toBeDefined();
      expect(found?.artifact_name).toBe('unique-artifact');
    });

    test('returns undefined when not found', async () => {
      const found = await sessionsRepo.findByProjectAndName(testProjectId, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    test('returns all sessions when no filters', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'session-1',
        environment: 'dev',
      });
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'session-2',
        environment: 'dev',
      });

      const sessions = await sessionsRepo.findAll();

      expect(sessions.length).toBe(2);
    });

    test('filters by project_id', async () => {
      // Create another project
      const otherProject = await projectsRepo.create({
        name: 'other-project',
        github_repo: 'org/other',
      });

      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'project1-session',
        environment: 'dev',
      });
      await sessionsRepo.create({
        project_id: otherProject.id,
        artifact_name: 'project2-session',
        environment: 'dev',
      });

      const sessions = await sessionsRepo.findAll({ projectId: testProjectId });

      expect(sessions.length).toBe(1);
      expect(sessions[0]?.artifact_name).toBe('project1-session');
    });

    test('filters by state', async () => {
      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'active-session',
        environment: 'dev',
      });
      const session2 = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'suspended-session',
        environment: 'dev',
      });

      // Suspend one session
      await sessionsRepo.updateState(session2.id, 'suspended');

      const activeSessions = await sessionsRepo.findAll({ state: 'active' });
      const suspendedSessions = await sessionsRepo.findAll({ state: 'suspended' });

      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0]?.artifact_name).toBe('active-session');
      expect(suspendedSessions.length).toBe(1);
      expect(suspendedSessions[0]?.artifact_name).toBe('suspended-session');
    });

    test('combines filters', async () => {
      const otherProject = await projectsRepo.create({
        name: 'filter-project',
        github_repo: 'org/filter',
      });

      await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 's1',
        environment: 'dev',
      });
      const s2 = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 's2',
        environment: 'dev',
      });
      await sessionsRepo.create({
        project_id: otherProject.id,
        artifact_name: 's3',
        environment: 'dev',
      });

      await sessionsRepo.updateState(s2.id, 'suspended');

      const sessions = await sessionsRepo.findAll({
        projectId: testProjectId,
        state: 'active',
      });

      expect(sessions.length).toBe(1);
      expect(sessions[0]?.artifact_name).toBe('s1');
    });
  });

  describe('updateState', () => {
    test('transitions from active to suspended', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'to-suspend',
        environment: 'dev',
        container_id: 'container-1',
        workspace_volume: 'vol-1',
      });

      const updated = await sessionsRepo.updateState(session.id, 'suspended', {
        container_id: null,
      });

      expect(updated).toBeDefined();
      expect(updated?.state).toBe('suspended');
      expect(updated?.container_id).toBeNull();
      expect(updated?.workspace_volume).toBe('vol-1'); // preserved
    });

    test('transitions from suspended to active', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'to-resume',
        environment: 'dev',
        workspace_volume: 'vol-1',
      });

      await sessionsRepo.updateState(session.id, 'suspended');

      const resumed = await sessionsRepo.updateState(session.id, 'active', {
        container_id: 'new-container',
      });

      expect(resumed).toBeDefined();
      expect(resumed?.state).toBe('active');
      expect(resumed?.container_id).toBe('new-container');
      expect(resumed?.workspace_volume).toBe('vol-1');
    });

    test('returns undefined when session not found', async () => {
      const updated = await sessionsRepo.updateState('nonexistent', 'suspended');
      expect(updated).toBeUndefined();
    });
  });

  describe('update', () => {
    test('updates session fields', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'to-update',
        environment: 'dev',
      });

      const updated = await sessionsRepo.update(session.id, {
        container_id: 'updated-container',
        workspace_volume: 'updated-volume',
      });

      expect(updated).toBeDefined();
      expect(updated?.container_id).toBe('updated-container');
      expect(updated?.workspace_volume).toBe('updated-volume');
    });

    test('returns undefined when session not found', async () => {
      const updated = await sessionsRepo.update('nonexistent', {
        container_id: 'test',
      });
      expect(updated).toBeUndefined();
    });
  });

  describe('delete', () => {
    test('deletes session and returns true', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'to-delete',
        environment: 'dev',
      });

      const deleted = await sessionsRepo.delete(session.id);
      expect(deleted).toBe(true);

      const found = await sessionsRepo.findById(session.id);
      expect(found).toBeUndefined();
    });

    test('returns false when session not found', async () => {
      const deleted = await sessionsRepo.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});
