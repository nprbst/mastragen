import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  ProjectClaudeConfig,
  ProjectClaudeConfigUpdate,
} from '../db/types.ts';

/**
 * Input for creating a new project Claude config.
 */
export interface CreateClaudeConfigInput {
  project_id: string;
  mcp_servers?: string;
  claude_md?: string | null;
  auto_approve_file_patterns?: string;
  auto_approve_mcp_tools?: string;
  auto_approve_bash_commands?: string;
}

/**
 * Input for updating a project Claude config.
 */
export interface UpdateClaudeConfigInput {
  mcp_servers?: string;
  claude_md?: string | null;
  auto_approve_file_patterns?: string;
  auto_approve_mcp_tools?: string;
  auto_approve_bash_commands?: string;
}

/**
 * Repository for managing project Claude configuration.
 * Each project has at most one Claude config record.
 */
export class ProjectClaudeConfigRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new Claude config for a project.
   */
  async create(data: CreateClaudeConfigInput): Promise<ProjectClaudeConfig> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('project_claude_config')
      .values({
        id,
        project_id: data.project_id,
        mcp_servers: data.mcp_servers ?? '{}',
        claude_md: data.claude_md ?? null,
        auto_approve_file_patterns: data.auto_approve_file_patterns ?? '[]',
        auto_approve_mcp_tools: data.auto_approve_mcp_tools ?? '[]',
        auto_approve_bash_commands: data.auto_approve_bash_commands ?? '[]',
        created_at: now,
        updated_at: now,
      })
      .execute();

    const config = await this.findById(id);
    if (!config) {
      throw new Error('Failed to create Claude config');
    }
    return config;
  }

  /**
   * Find a Claude config by ID.
   */
  async findById(id: string): Promise<ProjectClaudeConfig | undefined> {
    return this.db
      .selectFrom('project_claude_config')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a Claude config by project ID.
   * Each project has at most one Claude config.
   */
  async findByProjectId(projectId: string): Promise<ProjectClaudeConfig | undefined> {
    return this.db
      .selectFrom('project_claude_config')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  /**
   * Find or create a Claude config for a project.
   * Creates with default values if not exists.
   */
  async findOrCreate(projectId: string): Promise<ProjectClaudeConfig> {
    const existing = await this.findByProjectId(projectId);
    if (existing) {
      return existing;
    }

    return this.create({ project_id: projectId });
  }

  /**
   * Update a Claude config by project ID.
   * Creates the config if it doesn't exist (upsert behavior).
   */
  async upsert(projectId: string, data: UpdateClaudeConfigInput): Promise<ProjectClaudeConfig> {
    const existing = await this.findByProjectId(projectId);

    if (existing) {
      return (await this.update(existing.id, data))!;
    }

    return this.create({
      project_id: projectId,
      ...data,
    });
  }

  /**
   * Update a Claude config by ID.
   */
  async update(
    id: string,
    data: Omit<ProjectClaudeConfigUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectClaudeConfig | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_claude_config')
      .set({
        ...data,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();

    if (result[0]?.numUpdatedRows === 0n) {
      return undefined;
    }

    return this.findById(id);
  }

  /**
   * Update a Claude config by project ID.
   */
  async updateByProjectId(
    projectId: string,
    data: Omit<ProjectClaudeConfigUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectClaudeConfig | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_claude_config')
      .set({
        ...data,
        updated_at: now,
      })
      .where('project_id', '=', projectId)
      .execute();

    if (result[0]?.numUpdatedRows === 0n) {
      return undefined;
    }

    return this.findByProjectId(projectId);
  }

  /**
   * Delete a Claude config by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_claude_config')
      .where('id', '=', id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Delete a Claude config by project ID.
   */
  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_claude_config')
      .where('project_id', '=', projectId)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * List all Claude configs (with pagination).
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<ProjectClaudeConfig[]> {
    let query = this.db
      .selectFrom('project_claude_config')
      .selectAll()
      .orderBy('created_at', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }
}
