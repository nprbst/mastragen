/**
 * Cui config routes - CRUD for project cui configuration.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database } from '../db/types.ts';
import { ProjectsRepository, ProjectCuiConfigRepository } from '../repositories/index.ts';

/**
 * Schema for updating cui config.
 */
const UpdateCuiConfigSchema = v.object({
  claudeMd: v.optional(v.nullable(v.string())),
  mcpServers: v.optional(v.record(v.string(), v.unknown())),
  autoApproveFilePatterns: v.optional(v.array(v.string())),
  autoApproveMcpTools: v.optional(v.array(v.string())),
  autoApproveBashCommands: v.optional(v.array(v.string())),
});

type UpdateCuiConfigInput = v.InferOutput<typeof UpdateCuiConfigSchema>;

/**
 * API response format for cui config.
 */
interface CuiConfigResponse {
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
 * Creates cui-config routes.
 */
export function cuiConfigRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const projectsRepo = new ProjectsRepository(db);
  const cuiConfigRepo = new ProjectCuiConfigRepository(db);

  /**
   * Helper to transform DB config to API response.
   */
  function toResponse(config: Awaited<ReturnType<typeof cuiConfigRepo.findByProjectId>>): CuiConfigResponse | null {
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
   * GET /:projectId/cui-config - Get project cui config
   */
  app.get('/:projectId/cui-config', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Find or create config with defaults
    const config = await cuiConfigRepo.findOrCreate(projectId);
    return c.json(toResponse(config), 200);
  });

  /**
   * PUT /:projectId/cui-config - Update/create project cui config
   */
  app.put('/:projectId/cui-config', async (c) => {
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

    const result = v.safeParse(UpdateCuiConfigSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Build update data
    const updateData: Parameters<typeof cuiConfigRepo.upsert>[1] = {};

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
    const config = await cuiConfigRepo.upsert(projectId, updateData);
    return c.json(toResponse(config), 200);
  });

  /**
   * DELETE /:projectId/cui-config - Delete project cui config
   */
  app.delete('/:projectId/cui-config', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Delete config (ok if doesn't exist)
    await cuiConfigRepo.deleteByProjectId(projectId);
    return c.json({ success: true }, 200);
  });

  /**
   * GET /:projectId/cui-config/preview - Preview rendered config
   *
   * Returns the config as it would be rendered for a session,
   * including template variable substitution.
   */
  app.get('/:projectId/cui-config/preview', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Get config (or defaults)
    const config = await cuiConfigRepo.findOrCreate(projectId);
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
      permissions.allow.push(
        ...response.autoApproveFilePatterns.map((p: string) => `Edit(${p})`)
      );
    }
    if (response.autoApproveMcpTools.length > 0) {
      permissions.allow.push(
        ...response.autoApproveMcpTools.map((t: string) => `mcp__${t}`)
      );
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

    return c.json({
      settingsJson,
      claudeMd,
      project: {
        id: project.id,
        name: project.name,
        githubRepo: project.github_repo,
      },
    }, 200);
  });

  return app;
}
