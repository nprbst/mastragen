import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  ProjectSkill,
  ProjectSkillUpdate,
} from '../db/types.ts';

/**
 * Input for creating a new project skill.
 */
export interface CreateSkillInput {
  project_id: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Input for updating a project skill.
 */
export interface UpdateSkillInput {
  name?: string;
  description?: string;
  content?: string;
}

/**
 * Repository for managing project skills.
 * Skills are domain knowledge files available in Claude sessions.
 */
export class ProjectSkillsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new skill for a project.
   */
  async create(data: CreateSkillInput): Promise<ProjectSkill> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('project_skills')
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

    const skill = await this.findById(id);
    if (!skill) {
      throw new Error('Failed to create skill');
    }
    return skill;
  }

  /**
   * Find a skill by ID.
   */
  async findById(id: string): Promise<ProjectSkill | undefined> {
    return this.db
      .selectFrom('project_skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a skill by project ID and name.
   */
  async findByName(projectId: string, name: string): Promise<ProjectSkill | undefined> {
    return this.db
      .selectFrom('project_skills')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', name)
      .executeTakeFirst();
  }

  /**
   * Find all skills for a project.
   */
  async findByProjectId(projectId: string): Promise<ProjectSkill[]> {
    return this.db
      .selectFrom('project_skills')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('name', 'asc')
      .execute();
  }

  /**
   * Update a skill by ID.
   */
  async update(
    id: string,
    data: Omit<ProjectSkillUpdate, 'id' | 'project_id' | 'created_at'>
  ): Promise<ProjectSkill | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('project_skills')
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
   * Delete a skill by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('project_skills')
      .where('id', '=', id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Delete all skills for a project.
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('project_skills')
      .where('project_id', '=', projectId)
      .execute();

    return Number(result[0]?.numDeletedRows ?? 0n);
  }
}
