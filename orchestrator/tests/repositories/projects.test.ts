import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { cleanupTestDb, createTestDb } from '../helpers/test-db.ts';

const TEST_DB_PATH = './data/test-projects-repo.db';

describe('ProjectsRepository', () => {
  let db: Kysely<Database>;
  let repo: ProjectsRepository;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);
    repo = new ProjectsRepository(db);
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('create', () => {
    test('creates a project with required fields', async () => {
      const project = await repo.create({
        name: 'my-project',
        github_repo: 'myorg/myrepo',
      });

      expect(project.id).toBeDefined();
      expect(project.id.length).toBe(6);
      expect(project.name).toBe('my-project');
      expect(project.github_repo).toBe('myorg/myrepo');
      expect(project.default_branch).toBe('main');
      expect(project.branch_prefix).toBe('mg/');
      expect(project.mastra_path).toBe('.');
      expect(project.ui_sandbox_path).toBeNull();
    });

    test('creates a project with custom fields', async () => {
      const project = await repo.create({
        name: 'custom-project',
        github_repo: 'org/repo',
        default_branch: 'develop',
        branch_prefix: 'feature/',
        mastra_path: 'packages/mastra',
        ui_sandbox_path: 'packages/ui',
      });

      expect(project.default_branch).toBe('develop');
      expect(project.branch_prefix).toBe('feature/');
      expect(project.mastra_path).toBe('packages/mastra');
      expect(project.ui_sandbox_path).toBe('packages/ui');
    });

    test('throws on duplicate project name', async () => {
      await repo.create({
        name: 'duplicate-name',
        github_repo: 'org/repo1',
      });

      await expect(
        repo.create({
          name: 'duplicate-name',
          github_repo: 'org/repo2',
        })
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    test('returns project when found', async () => {
      const created = await repo.create({
        name: 'find-me',
        github_repo: 'org/repo',
      });

      const found = await repo.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('find-me');
    });

    test('returns undefined when not found', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByName', () => {
    test('returns project when found', async () => {
      await repo.create({
        name: 'unique-name',
        github_repo: 'org/repo',
      });

      const found = await repo.findByName('unique-name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('unique-name');
    });

    test('returns undefined when not found', async () => {
      const found = await repo.findByName('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    test('returns empty array when no projects exist', async () => {
      const projects = await repo.findAll();
      expect(projects).toEqual([]);
    });

    test('returns all projects', async () => {
      await repo.create({ name: 'project-1', github_repo: 'org/repo1' });
      await repo.create({ name: 'project-2', github_repo: 'org/repo2' });
      await repo.create({ name: 'project-3', github_repo: 'org/repo3' });

      const projects = await repo.findAll();

      expect(projects.length).toBe(3);
      expect(projects.map((p) => p.name).sort()).toEqual(['project-1', 'project-2', 'project-3']);
    });
  });

  describe('update', () => {
    test('updates project fields', async () => {
      const created = await repo.create({
        name: 'to-update',
        github_repo: 'org/repo',
      });

      const updated = await repo.update(created.id, {
        default_branch: 'develop',
        mastra_path: 'src/mastra',
      });

      expect(updated).toBeDefined();
      expect(updated?.default_branch).toBe('develop');
      expect(updated?.mastra_path).toBe('src/mastra');
      expect(updated?.name).toBe('to-update');
    });

    test('returns undefined when project not found', async () => {
      const updated = await repo.update('nonexistent', {
        default_branch: 'develop',
      });
      expect(updated).toBeUndefined();
    });
  });

  describe('delete', () => {
    test('deletes project and returns true', async () => {
      const created = await repo.create({
        name: 'to-delete',
        github_repo: 'org/repo',
      });

      const deleted = await repo.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repo.findById(created.id);
      expect(found).toBeUndefined();
    });

    test('returns false when project not found', async () => {
      const deleted = await repo.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('addEnvironment', () => {
    test('adds environment to project', async () => {
      const project = await repo.create({
        name: 'env-project',
        github_repo: 'org/repo',
      });

      const env = await repo.addEnvironment(project.id, {
        name: 'staging',
        env_vars: { API_URL: 'https://staging.api.com' },
      });

      expect(env.id).toBeDefined();
      expect(env.project_id).toBe(project.id);
      expect(env.name).toBe('staging');
      expect(JSON.parse(env.env_vars)).toEqual({ API_URL: 'https://staging.api.com' });
    });

    test('throws on duplicate environment name for same project', async () => {
      const project = await repo.create({
        name: 'env-project',
        github_repo: 'org/repo',
      });

      await repo.addEnvironment(project.id, { name: 'dev', env_vars: {} });

      await expect(
        repo.addEnvironment(project.id, { name: 'dev', env_vars: {} })
      ).rejects.toThrow();
    });
  });

  describe('findEnvironments', () => {
    test('returns all environments for a project', async () => {
      const project = await repo.create({
        name: 'multi-env',
        github_repo: 'org/repo',
      });

      await repo.addEnvironment(project.id, { name: 'dev', env_vars: {} });
      await repo.addEnvironment(project.id, { name: 'staging', env_vars: {} });
      await repo.addEnvironment(project.id, { name: 'prod', env_vars: {} });

      const envs = await repo.findEnvironments(project.id);

      expect(envs.length).toBe(3);
      expect(envs.map((e) => e.name).sort()).toEqual(['dev', 'prod', 'staging']);
    });

    test('returns empty array when project has no environments', async () => {
      const project = await repo.create({
        name: 'no-env',
        github_repo: 'org/repo',
      });

      const envs = await repo.findEnvironments(project.id);
      expect(envs).toEqual([]);
    });
  });

  describe('findEnvironmentByName', () => {
    test('returns environment when found', async () => {
      const project = await repo.create({
        name: 'find-env',
        github_repo: 'org/repo',
      });

      await repo.addEnvironment(project.id, {
        name: 'production',
        env_vars: { SECRET: 'value' },
      });

      const env = await repo.findEnvironmentByName(project.id, 'production');

      expect(env).toBeDefined();
      expect(env?.name).toBe('production');
    });

    test('returns undefined when environment not found', async () => {
      const project = await repo.create({
        name: 'no-match',
        github_repo: 'org/repo',
      });

      const env = await repo.findEnvironmentByName(project.id, 'nonexistent');
      expect(env).toBeUndefined();
    });
  });
});
