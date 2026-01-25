import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { projectsRoutes } from '../../src/routes/projects.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';

const TEST_DB_PATH = './data/test-projects-routes.db';

describe('Projects Routes', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let projectsRepo: ProjectsRepository;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);
    projectsRepo = new ProjectsRepository(db);
    app = new Hono();
    app.route('/projects', projectsRoutes(db));
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('GET /projects', () => {
    test('returns empty array when no projects exist', async () => {
      const res = await app.request('/projects', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>[];
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
      const body = (await res.json()) as Record<string, unknown>[];
      expect(body).toHaveLength(2);
      expect(body[0]?.name).toBe('project-one');
      expect(body[0]?.githubRepo).toBe('org/repo-one');
      expect(body[1]?.name).toBe('project-two');
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
      const body = (await res.json()) as Record<string, unknown>[];
      expect(body[0]?.githubRepo).toBe('org/repo');
      expect(body[0]?.defaultBranch).toBe('develop');
      expect(body[0]?.branchPrefix).toBe('feature/');
      expect(body[0]?.mastraPath).toBeDefined();
      expect(body[0]?.createdAt).toBeDefined();
      expect(body[0]?.updatedAt).toBeDefined();
    });
  });

  describe('GET /projects/:id', () => {
    test('returns 404 for nonexistent project', async () => {
      const res = await app.request('/projects/AAAAAA', {
        method: 'GET',
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
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
      const body = (await res.json()) as Record<string, unknown>;
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
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.environments).toEqual([]);
    });
  });

  describe('PUT /projects/:id', () => {
    test('returns 404 for nonexistent project', async () => {
      const res = await app.request('/projects/AAAAAA', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-name' }),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Project not found: AAAAAA');
    });

    test('updates a single field', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
        default_branch: 'main',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultBranch: 'develop' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(project.id);
      expect(body.name).toBe('test-project');
      expect(body.defaultBranch).toBe('develop');
    });

    test('updates multiple fields', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
        default_branch: 'main',
        branch_prefix: 'mg/',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'updated-project',
          defaultBranch: 'feature/mastragen',
          branchPrefix: 'dev/',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(project.id);
      expect(body.name).toBe('updated-project');
      expect(body.defaultBranch).toBe('feature/mastragen');
      expect(body.branchPrefix).toBe('dev/');
      expect(body.githubRepo).toBe('org/repo'); // unchanged
    });

    test('returns 400 for invalid githubRepo format', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubRepo: 'invalid-format' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain('Validation failed');
    });

    test('returns 409 for duplicate name conflict', async () => {
      await projectsRepo.create({
        name: 'existing-project',
        github_repo: 'org/repo-one',
      });
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo-two',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'existing-project' }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Project already exists: existing-project');
    });

    test('allows keeping the same name', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-project', defaultBranch: 'develop' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.name).toBe('test-project');
      expect(body.defaultBranch).toBe('develop');
    });

    test('can update uiSandboxPath to null', async () => {
      const project = await projectsRepo.create({
        name: 'test-project',
        github_repo: 'org/repo',
        ui_sandbox_path: 'packages/ui',
      });

      const res = await app.request(`/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiSandboxPath: null }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.uiSandboxPath).toBeNull();
    });
  });
});
