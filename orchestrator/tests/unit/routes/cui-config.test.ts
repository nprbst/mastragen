import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createDatabase } from '../../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../../src/db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from '../../../src/db/migrations/003_cui_config.ts';
import { ProjectsRepository, ProjectCuiConfigRepository } from '../../../src/repositories/index.ts';

const TEST_DB_PATH = './data/test-cui-config-routes.db';

/**
 * T063: Unit test for cui-config CRUD operations
 *
 * Tests the cui-config routes:
 * - GET /projects/:projectId/cui-config - Get project cui config
 * - PUT /projects/:projectId/cui-config - Update/create project cui config
 * - DELETE /projects/:projectId/cui-config - Delete project cui config
 * - GET /projects/:projectId/cui-config/preview - Preview rendered config
 */
describe('cui-config routes', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let cuiConfigRepo: ProjectCuiConfigRepository;
  let testProjectId: string;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);
    await runMigrations003(db);

    projectsRepo = new ProjectsRepository(db);
    cuiConfigRepo = new ProjectCuiConfigRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Create test project
    const project = await projectsRepo.create({
      name: 'Test Project',
      github_repo: 'test-org/test-repo',
      default_branch: 'main',
      branch_prefix: 'mg/',
      mastra_path: '.',
      ui_sandbox_path: null,
    });
    testProjectId = project.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.deleteFrom('project_cui_config').execute();
    await db.deleteFrom('projects').execute();
  });

  describe('GET /projects/:projectId/cui-config', () => {
    test('should return 404 for non-existent project', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request('/projects/non-existent/cui-config');
      expect(res.status).toBe(404);
    });

    test('should return default config when none exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        projectId: string;
        mcpServers: Record<string, unknown>;
        claudeMd: string | null;
        autoApproveFilePatterns: string[];
        autoApproveMcpTools: string[];
        autoApproveBashCommands: string[];
      };
      expect(body.projectId).toBe(testProjectId);
      expect(body.mcpServers).toEqual({});
      expect(body.autoApproveFilePatterns).toEqual([]);
    });

    test('should return existing config', async () => {
      // Create config first
      await cuiConfigRepo.create({
        project_id: testProjectId,
        mcp_servers: JSON.stringify({ filesystem: { command: 'npx', args: [] } }),
        claude_md: '# Project Guide',
        auto_approve_file_patterns: JSON.stringify(['*.ts']),
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        projectId: string;
        mcpServers: Record<string, unknown>;
        claudeMd: string;
        autoApproveFilePatterns: string[];
      };
      expect(body.claudeMd).toBe('# Project Guide');
      expect(body.mcpServers).toEqual({ filesystem: { command: 'npx', args: [] } });
      expect(body.autoApproveFilePatterns).toEqual(['*.ts']);
    });
  });

  describe('PUT /projects/:projectId/cui-config', () => {
    test('should create config when none exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claudeMd: '# New Guide',
          mcpServers: { test: { command: 'test' } },
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        claudeMd: string;
        mcpServers: Record<string, unknown>;
      };
      expect(body.claudeMd).toBe('# New Guide');
      expect(body.mcpServers).toEqual({ test: { command: 'test' } });
    });

    test('should update existing config', async () => {
      // Create config first
      await cuiConfigRepo.create({
        project_id: testProjectId,
        claude_md: '# Old Guide',
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claudeMd: '# Updated Guide',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as { claudeMd: string };
      expect(body.claudeMd).toBe('# Updated Guide');
    });

    test('should return 400 for invalid data', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServers: 'invalid', // Should be object
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /projects/:projectId/cui-config', () => {
    test('should delete existing config', async () => {
      // Create config first
      await cuiConfigRepo.create({
        project_id: testProjectId,
        claude_md: '# To Delete',
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const config = await cuiConfigRepo.findByProjectId(testProjectId);
      expect(config).toBeUndefined();
    });

    test('should return 200 even when no config exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /projects/:projectId/cui-config/preview', () => {
    test('should return preview of rendered config', async () => {
      // Create config
      await cuiConfigRepo.create({
        project_id: testProjectId,
        mcp_servers: JSON.stringify({ filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } }),
        claude_md: '# Project: {{projectName}}',
        auto_approve_file_patterns: JSON.stringify(['*.ts', '*.tsx']),
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/cui-config/preview`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        settingsJson: Record<string, unknown>;
        claudeMd: string;
      };
      expect(body.settingsJson).toBeDefined();
      expect(body.claudeMd).toBeDefined();
    });

    test('should return 404 for non-existent project', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/cui-config.ts');
      const app = new Hono();
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request('/projects/non-existent/cui-config/preview');
      expect(res.status).toBe(404);
    });
  });
});
