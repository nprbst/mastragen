/**
 * Claude config routes - CRUD for project Claude configuration.
 * T080: Modification routes require admin access.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database } from '../db/types.ts';
import { requireAuth, requireProjectAdmin } from '../middleware/auth.ts';
import {
  ProjectClaudeConfigRepository,
  ProjectCommandsRepository,
  ProjectSkillsRepository,
  ProjectsRepository,
} from '../repositories/index.ts';

/**
 * Schema for updating Claude config.
 */
const UpdateClaudeConfigSchema = v.object({
  claudeMd: v.optional(v.nullable(v.string())),
  mcpServers: v.optional(v.record(v.string(), v.unknown())),
  autoApproveFilePatterns: v.optional(v.array(v.string())),
  autoApproveMcpTools: v.optional(v.array(v.string())),
  autoApproveBashCommands: v.optional(v.array(v.string())),
});

/**
 * API response format for Claude config.
 */
interface ClaudeConfigResponse {
  id: string;
  projectId: string;
  claudeMd: string | null;
  mcpServers: Record<string, unknown>;
  autoApproveFilePatterns: string[];
  autoApproveMcpTools: string[];
  autoApproveBashCommands: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates claude-config routes.
 */
export function claudeConfigRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const projectsRepo = new ProjectsRepository(db);
  const claudeConfigRepo = new ProjectClaudeConfigRepository(db);
  const commandsRepo = new ProjectCommandsRepository(db);
  const skillsRepo = new ProjectSkillsRepository(db);

  /**
   * Helper to transform DB config to API response.
   */
  function toResponse(
    config: Awaited<ReturnType<typeof claudeConfigRepo.findByProjectId>>
  ): ClaudeConfigResponse | null {
    if (!config) return null;

    return {
      id: config.id,
      projectId: config.project_id,
      claudeMd: config.claude_md,
      mcpServers: JSON.parse(config.mcp_servers || '{}'),
      autoApproveFilePatterns: JSON.parse(config.auto_approve_file_patterns || '[]'),
      autoApproveMcpTools: JSON.parse(config.auto_approve_mcp_tools || '[]'),
      autoApproveBashCommands: JSON.parse(config.auto_approve_bash_commands || '[]'),
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    };
  }

  /**
   * GET /:projectId/claude-config - Get project Claude config
   */
  app.get('/:projectId/claude-config', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Find or create config with defaults
    const config = await claudeConfigRepo.findOrCreate(projectId);
    return c.json(toResponse(config), 200);
  });

  /**
   * PUT /:projectId/claude-config - Update/create project Claude config
   * T080: Requires admin access to modify config
   */
  app.put('/:projectId/claude-config', requireAuth(), requireProjectAdmin(), async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const result = v.safeParse(UpdateClaudeConfigSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Build update data
    const updateData: Parameters<typeof claudeConfigRepo.upsert>[1] = {};

    if (input.claudeMd !== undefined) {
      updateData.claude_md = input.claudeMd;
    }
    if (input.mcpServers !== undefined) {
      updateData.mcp_servers = JSON.stringify(input.mcpServers);
    }
    if (input.autoApproveFilePatterns !== undefined) {
      updateData.auto_approve_file_patterns = JSON.stringify(input.autoApproveFilePatterns);
    }
    if (input.autoApproveMcpTools !== undefined) {
      updateData.auto_approve_mcp_tools = JSON.stringify(input.autoApproveMcpTools);
    }
    if (input.autoApproveBashCommands !== undefined) {
      updateData.auto_approve_bash_commands = JSON.stringify(input.autoApproveBashCommands);
    }

    // Upsert config
    const config = await claudeConfigRepo.upsert(projectId, updateData);
    return c.json(toResponse(config), 200);
  });

  /**
   * DELETE /:projectId/claude-config - Delete project Claude config
   * T080: Requires admin access to delete config
   */
  app.delete('/:projectId/claude-config', requireAuth(), requireProjectAdmin(), async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Delete config (ok if doesn't exist)
    await claudeConfigRepo.deleteByProjectId(projectId);
    return c.json({ success: true }, 200);
  });

  /**
   * GET /:projectId/claude-config/preview - Preview rendered config
   *
   * Returns the config as it would be rendered for a session,
   * including template variable substitution.
   */
  app.get('/:projectId/claude-config/preview', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Get config (or defaults)
    const config = await claudeConfigRepo.findOrCreate(projectId);
    const response = toResponse(config);

    if (!response) {
      return c.json({ error: 'Failed to load config' }, 500);
    }

    // Build settings.json preview
    const settingsJson: Record<string, unknown> = {
      mcpServers: response.mcpServers,
      permissions: {
        allow: [] as string[],
        deny: [],
      },
    };

    // Add auto-approve patterns to permissions
    const permissions = settingsJson.permissions as { allow: string[]; deny: string[] };
    if (response.autoApproveFilePatterns.length > 0) {
      permissions.allow.push(...response.autoApproveFilePatterns.map((p: string) => `Edit(${p})`));
    }
    if (response.autoApproveMcpTools.length > 0) {
      permissions.allow.push(...response.autoApproveMcpTools.map((t: string) => `mcp__${t}`));
    }
    if (response.autoApproveBashCommands.length > 0) {
      permissions.allow.push(
        ...response.autoApproveBashCommands.map((cmd: string) => `Bash(${cmd})`)
      );
    }

    // Render CLAUDE.md with template variables
    let claudeMd = response.claudeMd || '';
    claudeMd = claudeMd.replace(/\{\{projectName\}\}/g, project.name);
    claudeMd = claudeMd.replace(/\{\{projectId\}\}/g, projectId);
    if (project.github_repo) {
      claudeMd = claudeMd.replace(/\{\{githubRepo\}\}/g, project.github_repo);
    }

    // Fetch commands and skills
    const commands = await commandsRepo.findByProjectId(projectId);
    const skills = await skillsRepo.findByProjectId(projectId);

    return c.json(
      {
        settingsJson,
        claudeMd,
        commands: commands.map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          content: cmd.content,
        })),
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          content: skill.content,
        })),
        project: {
          id: project.id,
          name: project.name,
          githubRepo: project.github_repo,
        },
      },
      200
    );
  });

  return app;
}
