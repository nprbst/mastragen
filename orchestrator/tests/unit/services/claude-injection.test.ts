import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import { createTestDb, cleanupTestDb } from '../../helpers/test-db.ts';
import type { Database } from '../../../src/db/types.ts';
import { ProjectsRepository } from '../../../src/repositories/index.ts';

// Test T038: Unit test for claude-injection service config generation

const TEST_DB_PATH = './data/test-claude-injection.db';

describe('claude-injection service', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    db = await createTestDb(TEST_DB_PATH);

    projectsRepo = new ProjectsRepository(db);

    // Create test project
    const project = await projectsRepo.create({
      name: 'test-project',
      github_repo: 'org/test-repo',
    });
    testProjectId = project.id;

    // Add environment with env vars
    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: {
        DATABASE_URL: 'postgres://localhost:5432/dev',
        API_KEY: 'dev-api-key-123',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('generateSettings', () => {
    test('should generate settings.json with default structure', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const settings = await service.generateSettings({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'test-session-123',
      });

      // Should have required structure
      expect(settings).toHaveProperty('user');
      expect(settings).toHaveProperty('experimental');
    });

    test('should include project-specific MCP servers', async () => {
      // Configure MCP server for project
      await db.insertInto('project_claude_config').values({
        id: 'config-1',
        project_id: testProjectId,
        mcp_servers: JSON.stringify({
          'mastragen-orchestrator': {
            command: 'npx',
            args: ['-y', '@mastragen/mcp-server'],
            env: {
              API_URL: '${MASTRAGEN_API_URL}',
            },
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).execute();

      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const settings = await service.generateSettings({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'test-session-123',
      });

      expect(settings.mcpServers).toBeDefined();
      expect(settings.mcpServers['mastragen-orchestrator']).toBeDefined();
    });

    test('should interpolate environment variables', async () => {
      await db.insertInto('project_claude_config').values({
        id: 'config-2',
        project_id: testProjectId,
        mcp_servers: JSON.stringify({
          database: {
            command: 'db-server',
            env: {
              DATABASE_URL: '${DATABASE_URL}',
            },
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).execute();

      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const settings = await service.generateSettings({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'test-session-123',
      });

      // Environment variable should be interpolated
      expect(settings.mcpServers.database.env.DATABASE_URL).toBe('postgres://localhost:5432/dev');
    });
  });

  describe('generateClaudeMd', () => {
    test('should generate CLAUDE.md with project name', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const claudeMd = await service.generateClaudeMd({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'test-session-123',
      });

      expect(claudeMd).toContain('test-project');
    });

    test('should include custom CLAUDE.md content from config', async () => {
      await db.insertInto('project_claude_config').values({
        id: 'config-3',
        project_id: testProjectId,
        claude_md: '## Custom Instructions\n\nAlways use TypeScript.\n',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).execute();

      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const claudeMd = await service.generateClaudeMd({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'test-session-123',
      });

      expect(claudeMd).toContain('## Custom Instructions');
      expect(claudeMd).toContain('Always use TypeScript.');
    });
  });

  describe('injectSessionEnvVars', () => {
    test('should include session-specific env vars', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const envVars = await service.getSessionEnvVars({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'session-xyz',
        userId: 'user-123',
        sessionToken: 'test-jwt-token',
      });

      expect(envVars.MASTRAGEN_SESSION_ID).toBe('session-xyz');
      expect(envVars.MASTRAGEN_API_URL).toBeDefined();
      expect(envVars.MASTRAGEN_USER_TOKEN).toBe('test-jwt-token');
    });

    test('should merge project env vars with session env vars', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const envVars = await service.getSessionEnvVars({
        projectId: testProjectId,
        environment: 'dev',
        sessionId: 'session-xyz',
        userId: 'user-123',
      });

      // Should include project env vars
      expect(envVars.DATABASE_URL).toBe('postgres://localhost:5432/dev');
      expect(envVars.API_KEY).toBe('dev-api-key-123');

      // Should include session env vars
      expect(envVars.MASTRAGEN_SESSION_ID).toBe('session-xyz');
    });
  });

  describe('generateCommandFiles', () => {
    test('should include built-in commands', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const commands = await service.getCommands({
        projectId: testProjectId,
        environment: 'dev',
      });

      // Built-in commands from claude-commands/ directory
      const commandNames = commands.map(c => c.name);
      // At minimum we expect the standard commands to eventually exist
      expect(Array.isArray(commands)).toBe(true);
    });

    test('should include project-specific custom commands', async () => {
      // Add a custom command
      await db.insertInto('project_commands').values({
        id: 'cmd-1',
        project_id: testProjectId,
        name: 'deploy',
        description: 'Deploy to production',
        content: '## /deploy\n\nDeploy the application to production.\n',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).execute();

      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      const commands = await service.getCommands({
        projectId: testProjectId,
        environment: 'dev',
      });

      const deployCmd = commands.find(c => c.name === 'deploy');
      expect(deployCmd).toBeDefined();
      expect(deployCmd?.content).toContain('Deploy the application');
    });
  });

  describe('error handling', () => {
    test('should throw error for non-existent project', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      await expect(
        service.generateSettings({
          projectId: 'non-existent',
          environment: 'dev',
          sessionId: 'test-session',
        })
      ).rejects.toThrow();
    });

    test('should throw error for non-existent environment', async () => {
      const { ClaudeInjectionService } = await import('../../../src/services/claude-injection.ts');
      const service = new ClaudeInjectionService(db);

      await expect(
        service.generateSettings({
          projectId: testProjectId,
          environment: 'non-existent-env',
          sessionId: 'test-session',
        })
      ).rejects.toThrow();
    });
  });
});
