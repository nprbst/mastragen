import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database as DatabaseSchema } from '../../src/db/types.ts';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../src/db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from '../../src/db/migrations/003_cui_config.ts';
import { cuiConfigRoutes } from '../../src/routes/cui-config.ts';
import { commandsRoutes } from '../../src/routes/commands.ts';
import { skillsRoutes } from '../../src/routes/skills.ts';

const TEST_DB_PATH = './data/test-project-admin-integration.db';

/**
 * Helper to create a test JWT token.
 */
function createTestJwt(payload: {
  sub: string;
  email: string;
  name?: string | null;
}, expiresIn: number = 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const base64urlEncode = (str: string): string => {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerBase64 = base64urlEncode(JSON.stringify(header));
  const payloadBase64 = base64urlEncode(JSON.stringify(fullPayload));
  const signature = base64urlEncode(`${headerBase64}.${payloadBase64}.test-secret`);

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * T066: Integration test for full project admin workflow
 *
 * Tests the complete project administration flow:
 * 1. Create project
 * 2. Configure cui config (MCP servers, CLAUDE.md, auto-approve patterns)
 * 3. Add/edit/delete commands
 * 4. Add/edit/delete skills
 * 5. Verify preview generation
 */
describe('Project admin workflow', () => {
  let db: Kysely<DatabaseSchema>;
  let app: Hono;
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
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Clean tables
    await db.deleteFrom('project_skills').execute();
    await db.deleteFrom('project_commands').execute();
    await db.deleteFrom('project_cui_config').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('github_app_installations').execute();
    await db.deleteFrom('users').execute();

    const now = new Date().toISOString();

    // Create test user
    testUserId = 'user-admin-test';
    await db
      .insertInto('users')
      .values({
        id: testUserId,
        email: 'admin@test.com',
        name: 'Test Admin',
        github_id: 12345,
        github_login: 'testadmin',
        github_access_token: 'test-token',
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Create test GitHub installation
    testInstallationId = 'inst-admin-test';
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
    testProjectId = 'proj-admin-test';
    await db
      .insertInto('projects')
      .values({
        id: testProjectId,
        name: 'Admin Test Project',
        github_repo: 'test-org/admin-repo',
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
    authToken = createTestJwt({ sub: testUserId, email: 'admin@test.com', name: 'Test Admin' });
    authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // Create app with all admin routes and db in context
    app = new Hono();
    // Add middleware to set db in context for auth middleware
    app.use('*', async (c, next) => {
      c.set('db', db);
      await next();
    });
    app.route('/projects', cuiConfigRoutes(db));
    app.route('/projects', commandsRoutes(db));
    app.route('/projects', skillsRoutes(db));

    // Mock GitHub API calls for auth middleware
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url instanceof Request ? url.url : url.toString();

      // Mock /repos/{owner}/{repo} for admin check
      if (urlStr.includes('api.github.com/repos/')) {
        return new Response(JSON.stringify({
          permissions: { admin: true, push: true, pull: true }
        }), { status: 200 });
      }

      // Mock /user/installations for access check
      if (urlStr.includes('api.github.com/user/installations')) {
        return new Response(JSON.stringify({
          installations: [{ id: 99999 }]  // Match testInstallationId
        }), { status: 200 });
      }

      return originalFetch(url);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Complete admin workflow', () => {
    test('should configure cui config, add commands, and add skills', async () => {
      // Step 1: Get initial cui config (should create default)
      let res = await app.request(`/projects/${testProjectId}/cui-config`);
      expect(res.status).toBe(200);
      const initialConfig = (await res.json()) as {
        projectId: string;
        mcpServers: Record<string, unknown>;
        claudeMd: string | null;
      };
      expect(initialConfig.projectId).toBe(testProjectId);

      // Step 2: Update cui config
      res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem'],
            },
          },
          claudeMd: '# Admin Test Project\n\nThis is a test project.',
          autoApproveFilePatterns: ['*.ts', '*.tsx'],
          autoApproveMcpTools: ['filesystem__read_file'],
          autoApproveBashCommands: ['npm install', 'npm test'],
        }),
      });
      expect(res.status).toBe(200);
      const updatedConfig = (await res.json()) as {
        claudeMd: string;
        mcpServers: Record<string, unknown>;
        autoApproveFilePatterns: string[];
      };
      expect(updatedConfig.claudeMd).toBe('# Admin Test Project\n\nThis is a test project.');
      expect(updatedConfig.mcpServers).toHaveProperty('filesystem');
      expect(updatedConfig.autoApproveFilePatterns).toContain('*.ts');

      // Step 3: Create a command
      res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'deploy',
          description: 'Deploy the application',
          content: '# Deploy\n\nRun deployment scripts...',
        }),
      });
      expect(res.status).toBe(201);
      const command = (await res.json()) as { id: string; name: string };
      expect(command.name).toBe('deploy');

      // Step 4: List commands
      res = await app.request(`/projects/${testProjectId}/commands`);
      expect(res.status).toBe(200);
      const commands = (await res.json()) as { name: string }[];
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('deploy');

      // Step 5: Create a skill
      res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'mastra-development',
          description: 'Mastra framework development patterns',
          content: '# Mastra Development\n\nUse these patterns...',
        }),
      });
      expect(res.status).toBe(201);
      const skill = (await res.json()) as { id: string; name: string };
      expect(skill.name).toBe('mastra-development');

      // Step 6: List skills
      res = await app.request(`/projects/${testProjectId}/skills`);
      expect(res.status).toBe(200);
      const skills = (await res.json()) as { name: string }[];
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('mastra-development');

      // Step 7: Get preview
      res = await app.request(`/projects/${testProjectId}/cui-config/preview`);
      expect(res.status).toBe(200);
      const preview = (await res.json()) as {
        settingsJson: { mcpServers: Record<string, unknown> };
        claudeMd: string;
        commands: { name: string; content: string }[];
        skills: { name: string; content: string }[];
      };
      expect(preview.settingsJson.mcpServers).toHaveProperty('filesystem');
      expect(preview.claudeMd).toContain('Admin Test Project');
      expect(preview.commands).toHaveLength(1);
      expect(preview.skills).toHaveLength(1);

      // Step 8: Update command
      res = await app.request(`/projects/${testProjectId}/commands/${command.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          description: 'Deploy the application to production',
        }),
      });
      expect(res.status).toBe(200);
      const updatedCommand = (await res.json()) as { description: string };
      expect(updatedCommand.description).toBe('Deploy the application to production');

      // Step 9: Delete command
      res = await app.request(`/projects/${testProjectId}/commands/${command.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      // Verify deletion
      res = await app.request(`/projects/${testProjectId}/commands`);
      const remainingCommands = (await res.json()) as unknown[];
      expect(remainingCommands).toHaveLength(0);

      // Step 10: Update skill
      res = await app.request(`/projects/${testProjectId}/skills/${skill.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          content: '# Mastra Development\n\nUpdated patterns...',
        }),
      });
      expect(res.status).toBe(200);
      const updatedSkill = (await res.json()) as { content: string };
      expect(updatedSkill.content).toContain('Updated patterns');

      // Step 11: Delete skill
      res = await app.request(`/projects/${testProjectId}/skills/${skill.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      // Verify deletion
      res = await app.request(`/projects/${testProjectId}/skills`);
      const remainingSkills = (await res.json()) as unknown[];
      expect(remainingSkills).toHaveLength(0);

      // Step 12: Delete cui config
      res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);

      // Verify config returns default
      res = await app.request(`/projects/${testProjectId}/cui-config`);
      expect(res.status).toBe(200);
      const finalConfig = (await res.json()) as { claudeMd: string | null };
      expect(finalConfig.claudeMd).toBeNull();
    });
  });

  describe('Duplicate handling', () => {
    test('should prevent duplicate command names', async () => {
      // Create first command
      await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'unique-command',
          description: 'First command',
          content: '# First',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'unique-command',
          description: 'Duplicate command',
          content: '# Duplicate',
        }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('already exists');
    });

    test('should prevent duplicate skill names', async () => {
      // Create first skill
      await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'unique-skill',
          description: 'First skill',
          content: '# First',
        }),
      });

      // Try to create duplicate
      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'unique-skill',
          description: 'Duplicate skill',
          content: '# Duplicate',
        }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('already exists');
    });
  });

  describe('Validation', () => {
    test('should validate command fields', async () => {
      const res = await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: '', // Empty name
          description: 'Valid description',
          content: 'Valid content',
        }),
      });

      expect(res.status).toBe(400);
    });

    test('should validate skill fields', async () => {
      const res = await app.request(`/projects/${testProjectId}/skills`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'valid-name',
          // Missing description
          content: 'Valid content',
        }),
      });

      expect(res.status).toBe(400);
    });

    test('should validate cui config mcpServers JSON', async () => {
      const res = await app.request(`/projects/${testProjectId}/cui-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          mcpServers: 'invalid-not-json-object',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Cross-project isolation', () => {
    test('should isolate commands between projects', async () => {
      // Create another project linked to the same installation for auth
      const otherProjectId = 'proj-other-test';
      await db
        .insertInto('projects')
        .values({
          id: otherProjectId,
          name: 'Other Project',
          github_repo: 'test-org/other-repo',
          default_branch: 'main',
          branch_prefix: 'mg/',
          mastra_path: '.',
          ui_sandbox_path: null,
          installation_id: testInstallationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Create command in first project
      await app.request(`/projects/${testProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'project1-command',
          description: 'Project 1 command',
          content: '# Project 1',
        }),
      });

      // Create command in second project
      await app.request(`/projects/${otherProjectId}/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'project2-command',
          description: 'Project 2 command',
          content: '# Project 2',
        }),
      });

      // Verify isolation
      let res = await app.request(`/projects/${testProjectId}/commands`);
      let commands = (await res.json()) as { name: string }[];
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('project1-command');

      res = await app.request(`/projects/${otherProjectId}/commands`);
      commands = (await res.json()) as { name: string }[];
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('project2-command');
    });
  });
});
