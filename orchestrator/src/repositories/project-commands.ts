import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  ProjectCommand,
  ProjectCommandUpdate,
} from '../db/types.ts';

/**
 * Input for creating a new project command.
 */
export interface CreateCommandInput {
  project_id: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Input for updating a project command.
 */
export interface UpdateCommandInput {
  name?: string;
  description?: string;
  content?: string;
}

/**
 * Repository for managing project commands.
 * Commands are custom slash commands available in Claude sessions.
 */
export class ProjectCommandsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new command for a project.
   */
  async create(data: CreateCommandInput): Promise<ProjectCommand> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('project_commands')
      .values({
        id,
        project_id: data.project_id,
        name: data.name,
        description: data.description,
        content: data.content,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const command = await this.findById(id);
    if (!command) {
      throw new Error('Failed to create command');
    }
    return command;
  }

  /**
   * Find a command by ID.
   */
  async findById(id: string): Promise<ProjectCommand | undefined> {
    return this.db
      .selectFrom('project_commands')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a command by project ID and name.
   */
  async findByName(projectId: string, name: string): Promise<ProjectCommand | undefined> {
    return this.db
      .selectFrom('project_commands')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', name)
      .executeTakeFirst();
  }

  /**
   * Find all commands for a project.
   */
  async findByProjectId(projectId: string): Promise<ProjectCommand[]> {
    return this.db
      .selectFrom('project_commands')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('name', 'asc')
      .execute();
  }

  /**
   * Update a command by ID.
   */
  async update(
    id: string,
    data: Omit<ProjectCommandUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectCommand | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_commands')
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
   * Delete a command by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_commands')
      .where('id', '=', id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Delete all commands for a project.
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('project_commands')
      .where('project_id', '=', projectId)
      .execute();

    return Number(result[0]?.numDeletedRows ?? 0n);
  }
}
