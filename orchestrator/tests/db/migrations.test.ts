import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrations/001_initial.ts';
import type { Database } from '../../src/db/types.ts';

const TEST_DB_PATH = './data/test-migrations.db';

describe('Database Migrations', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
  });

  afterEach(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Initial Migration (001)', () => {
    test('creates projects table with correct columns', async () => {
      await runMigrations(db);

      // Verify table exists by inserting a row
      const result = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
          ui_sandbox_path: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(result.id).toBeDefined();
      expect(result.name).toBe('test-project');
      expect(result.github_repo).toBe('org/repo');
      expect(result.default_branch).toBe('main');
      expect(result.branch_prefix).toBe('mg/');
      expect(result.mastra_path).toBe('.');
      expect(result.ui_sandbox_path).toBeNull();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    test('creates project_environments table with correct columns', async () => {
      await runMigrations(db);

      // First create a project
      const project = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Then create an environment
      const result = await db
        .insertInto('project_environments')
        .values({
          project_id: project.id,
          name: 'dev',
          env_vars: JSON.stringify({ API_KEY: 'secret' }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(result.id).toBeDefined();
      expect(result.project_id).toBe(project.id);
      expect(result.name).toBe('dev');
      expect(result.env_vars).toBe(JSON.stringify({ API_KEY: 'secret' }));
      expect(result.created_at).toBeDefined();
    });

    test('creates sessions table with correct columns', async () => {
      await runMigrations(db);

      // First create a project
      const project = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Then create a session
      const result = await db
        .insertInto('sessions')
        .values({
          project_id: project.id,
          artifact_name: 'my-feature',
          environment: 'dev',
          state: 'active',
          container_id: 'abc123',
          workspace_volume: 'vol-123',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(result.id).toBeDefined();
      expect(result.project_id).toBe(project.id);
      expect(result.artifact_name).toBe('my-feature');
      expect(result.environment).toBe('dev');
      expect(result.state).toBe('active');
      expect(result.container_id).toBe('abc123');
      expect(result.workspace_volume).toBe('vol-123');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    test('enforces unique project names', async () => {
      await runMigrations(db);

      await db
        .insertInto('projects')
        .values({
          name: 'unique-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .execute();

      // Should throw on duplicate name
      await expect(
        db
          .insertInto('projects')
          .values({
            name: 'unique-project',
            github_repo: 'org/other-repo',
            default_branch: 'main',
            branch_prefix: 'mg/',
            mastra_path: '.',
          })
          .execute()
      ).rejects.toThrow();
    });

    test('enforces unique (project_id, artifact_name) for sessions', async () => {
      await runMigrations(db);

      const project = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('sessions')
        .values({
          project_id: project.id,
          artifact_name: 'my-feature',
          environment: 'dev',
          state: 'active',
        })
        .execute();

      // Should throw on duplicate (project_id, artifact_name)
      await expect(
        db
          .insertInto('sessions')
          .values({
            project_id: project.id,
            artifact_name: 'my-feature',
            environment: 'staging',
            state: 'active',
          })
          .execute()
      ).rejects.toThrow();
    });

    test('enforces session state constraint (active or suspended)', async () => {
      await runMigrations(db);

      const project = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Should throw on invalid state
      await expect(
        db
          .insertInto('sessions')
          .values({
            project_id: project.id,
            artifact_name: 'my-feature',
            environment: 'dev',
            state: 'invalid' as 'active',
          })
          .execute()
      ).rejects.toThrow();
    });

    test('enforces unique (project_id, name) for project_environments', async () => {
      await runMigrations(db);

      const project = await db
        .insertInto('projects')
        .values({
          name: 'test-project',
          github_repo: 'org/repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('project_environments')
        .values({
          project_id: project.id,
          name: 'dev',
          env_vars: '{}',
        })
        .execute();

      // Should throw on duplicate (project_id, name)
      await expect(
        db
          .insertInto('project_environments')
          .values({
            project_id: project.id,
            name: 'dev',
            env_vars: '{}',
          })
          .execute()
      ).rejects.toThrow();
    });
  });
});
