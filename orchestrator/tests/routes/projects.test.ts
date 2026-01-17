import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { unlinkSync, existsSync } from 'node:fs';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrations/001_initial.ts';
import { projectsRoutes } from '../../src/routes/projects.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import type { Database } from '../../src/db/types.ts';
import type { Kysely } from 'kysely';

const TEST_DB_PATH = './data/test-projects-routes.db';

describe('Projects Routes', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations(db);

    projectsRepo = new ProjectsRepository(db);

    app = new Hono();
    app.route('/projects', projectsRoutes(db));
  });

  afterEach(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('GET /projects', () => {
    test('returns empty array when no projects exist', async () => {
      const res = await app.request('/projects', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    test('returns all projects', async () => {
      await projectsRepo.create({
        name: 'project-one',
        github_repo: 'org/repo-one',
      });
      await projectsRepo.create({
        name: 'project-two',
        github_repo: 'org/repo-two',
      });

      const res = await app.request('/projects', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('project-one');
      expect(body[0].githubRepo).toBe('org/repo-one');
      expect(body[1].name).toBe('project-two');
    });

    test('returns projects with camelCase field names', async () => {
      await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
        default_branch: 'develop',
        branch_prefix: 'feature/',
      });

      const res = await app.request('/projects', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0].githubRepo).toBe('org/repo');
      expect(body[0].defaultBranch).toBe('develop');
      expect(body[0].branchPrefix).toBe('feature/');
      expect(body[0].mastraPath).toBeDefined();
      expect(body[0].createdAt).toBeDefined();
      expect(body[0].updatedAt).toBeDefined();
    });
  });

  describe('GET /projects/:id', () => {
    test('returns 404 for nonexistent project', async () => {
      const res = await app.request('/projects/AAAAAA', {
        method: 'GET',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Project not found: AAAAAA');
    });

    test('returns project with environments', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
      });

      await projectsRepo.addEnvironment(project.id, {
        name: 'dev',
        env_vars: {},
      });
      await projectsRepo.addEnvironment(project.id, {
        name: 'staging',
        env_vars: {},
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(project.id);
      expect(body.name).toBe('test-project');
      expect(body.githubRepo).toBe('org/repo');
      expect(body.environments).toEqual(['dev', 'staging']);
    });

    test('returns empty environments array when project has no environments', async () => {
      const project = await projectsRepo.create({
        name: 'no-env-project',
        github_repo: 'org/repo',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.environments).toEqual([]);
    });
  });
});
