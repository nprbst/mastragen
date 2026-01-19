import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  ProjectCuiConfig,
  ProjectCuiConfigUpdate,
} from '../db/types.ts';

/**
 * Input for creating a new project cui config.
 */
export interface CreateCuiConfigInput {
  project_id: string;
  mcp_servers?: string;
  claude_md?: string | null;
  auto_approve_file_patterns?: string;
  auto_approve_mcp_tools?: string;
  auto_approve_bash_commands?: string;
}

/**
 * Input for updating a project cui config.
 */
export interface UpdateCuiConfigInput {
  mcp_servers?: string;
  claude_md?: string | null;
  auto_approve_file_patterns?: string;
  auto_approve_mcp_tools?: string;
  auto_approve_bash_commands?: string;
}

/**
 * Repository for managing project cui configuration.
 * Each project has at most one cui config record.
 */
export class ProjectCuiConfigRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new cui config for a project.
   */
  async create(data: CreateCuiConfigInput): Promise<ProjectCuiConfig> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('project_cui_config')
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
      throw new Error('Failed to create cui config');
    }
    return config;
  }

  /**
   * Find a cui config by ID.
   */
  async findById(id: string): Promise<ProjectCuiConfig | undefined> {
    return this.db
      .selectFrom('project_cui_config')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a cui config by project ID.
   * Each project has at most one cui config.
   */
  async findByProjectId(projectId: string): Promise<ProjectCuiConfig | undefined> {
    return this.db
      .selectFrom('project_cui_config')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  /**
   * Find or create a cui config for a project.
   * Creates with default values if not exists.
   */
  async findOrCreate(projectId: string): Promise<ProjectCuiConfig> {
    const existing = await this.findByProjectId(projectId);
    if (existing) {
      return existing;
    }

    return this.create({ project_id: projectId });
  }

  /**
   * Update a cui config by project ID.
   * Creates the config if it doesn't exist (upsert behavior).
   */
  async upsert(projectId: string, data: UpdateCuiConfigInput): Promise<ProjectCuiConfig> {
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
   * Update a cui config by ID.
   */
  async update(
    id: string,
    data: Omit<ProjectCuiConfigUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectCuiConfig | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_cui_config')
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
   * Update a cui config by project ID.
   */
  async updateByProjectId(
    projectId: string,
    data: Omit<ProjectCuiConfigUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectCuiConfig | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_cui_config')
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
   * Delete a cui config by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_cui_config')
      .where('id', '=', id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Delete a cui config by project ID.
   */
  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_cui_config')
      .where('project_id', '=', projectId)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * List all cui configs (with pagination).
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<ProjectCuiConfig[]> {
    let query = this.db
      .selectFrom('project_cui_config')
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
