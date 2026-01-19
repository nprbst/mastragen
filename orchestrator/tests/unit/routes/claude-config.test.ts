import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createDatabase } from '../../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../../src/db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from '../../../src/db/migrations/003_cui_config.ts';
import { ProjectsRepository, ProjectClaudeConfigRepository } from '../../../src/repositories/index.ts';
import { createTestJwt } from '../../helpers/jwt.ts';

const TEST_DB_PATH = './data/test-claude-config-routes.db';

/**
 * T063: Unit test for claude-config CRUD operations
 *
 * Tests the claude-config routes:
 * - GET /projects/:projectId/claude-config - Get project cui config
 * - PUT /projects/:projectId/claude-config - Update/create project cui config
 * - DELETE /projects/:projectId/claude-config - Delete project cui config
 * - GET /projects/:projectId/claude-config/preview - Preview rendered config
 */
describe('claude-config routes', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let claudeConfigRepo: ProjectClaudeConfigRepository;
  let testProjectId: string;
  let testUserId: string;
  let testInstallationId: string;
  let authToken: string;
  let authHeaders: Record<string, string>;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);
    await runMigrations003(db);

    projectsRepo = new ProjectsRepository(db);
    claudeConfigRepo = new ProjectClaudeConfigRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    const now = new Date().toISOString();

    // Create test user
    testUserId = 'user-claude-config-test';
    await db
      .insertInto('users')
      .values({
        id: testUserId,
        email: 'cuiconfig@test.com',
        name: 'Test User',
        github_id: 12345,
        github_login: 'testuser',
        github_access_token: 'test-token',
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test GitHub installation
    testInstallationId = 'inst-claude-config-test';
    await db
      .insertInto('github_app_installations')
      .values({
        id: testInstallationId,
        installation_id: 99999,
        account_type: 'Organization',
        account_login: 'test-org',
        account_id: 67890,
        permissions: '{}',
        repository_selection: 'all',
        suspended_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test project linked to installation
    testProjectId = 'proj-claude-config-test';
    await db
      .insertInto('projects')
      .values({
        id: testProjectId,
        name: 'Test Project',
        github_repo: 'test-org/test-repo',
        default_branch: 'main',
        branch_prefix: 'mg/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: testInstallationId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create auth token
    authToken = await createTestJwt({ sub: testUserId, email: 'cuiconfig@test.com', name: 'Test User' });
    authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // Mock GitHub API calls for auth middleware
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url instanceof Request ? url.url : url.toString();

      if (urlStr.includes('api.github.com/repos/')) {
        return new Response(JSON.stringify({
          permissions: { admin: true, push: true, pull: true }
        }), { status: 200 });
      }

      if (urlStr.includes('api.github.com/user/installations')) {
        return new Response(JSON.stringify({
          installations: [{ id: 99999 }]
        }), { status: 200 });
      }

      return originalFetch(url);
    };
  });

  afterEach(async () => {
    // Restore fetch
    globalThis.fetch = originalFetch;

    // Clean up test data
    await db.deleteFrom('project_cui_config').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('github_app_installations').execute();
    await db.deleteFrom('users').execute();
  });

  describe('GET /projects/:projectId/claude-config', () => {
    test('should return 404 for non-existent project', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request('/projects/non-existent/claude-config');
      expect(res.status).toBe(404);
    });

    test('should return default config when none exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`);
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
      await claudeConfigRepo.create({
        project_id: testProjectId,
        mcp_servers: JSON.stringify({ filesystem: { command: 'npx', args: [] } }),
        claude_md: '# Project Guide',
        auto_approve_file_patterns: JSON.stringify(['*.ts']),
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`);
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

  describe('PUT /projects/:projectId/claude-config', () => {
    test('should create config when none exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`, {
        method: 'PUT',
        headers: authHeaders,
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
      await claudeConfigRepo.create({
        project_id: testProjectId,
        claude_md: '# Old Guide',
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          claudeMd: '# Updated Guide',
        }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as { claudeMd: string };
      expect(body.claudeMd).toBe('# Updated Guide');
    });

    test('should return 400 for invalid data', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          mcpServers: 'invalid', // Should be object
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /projects/:projectId/claude-config', () => {
    test('should delete existing config', async () => {
      // Create config first
      await claudeConfigRepo.create({
        project_id: testProjectId,
        claude_md: '# To Delete',
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const config = await claudeConfigRepo.findByProjectId(testProjectId);
      expect(config).toBeUndefined();
    });

    test('should return 200 even when no config exists', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /projects/:projectId/claude-config/preview', () => {
    test('should return preview of rendered config', async () => {
      // Create config
      await claudeConfigRepo.create({
        project_id: testProjectId,
        mcp_servers: JSON.stringify({ filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } }),
        claude_md: '# Project: {{projectName}}',
        auto_approve_file_patterns: JSON.stringify(['*.ts', '*.tsx']),
      });

      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request(`/projects/${testProjectId}/claude-config/preview`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        settingsJson: Record<string, unknown>;
        claudeMd: string;
      };
      expect(body.settingsJson).toBeDefined();
      expect(body.claudeMd).toBeDefined();
    });

    test('should return 404 for non-existent project in preview', async () => {
      const { cuiConfigRoutes } = await import('../../../src/routes/claude-config.ts');
      const app = new Hono();
      app.use('*', async (c, next) => {
        c.set('db', db);
        await next();
      });
      app.route('/projects', cuiConfigRoutes(db));

      const res = await app.request('/projects/non-existent/claude-config/preview');
      expect(res.status).toBe(404);
    });
  });
});
