import type { Kysely } from 'kysely';
import type {
  Database,
  Project,
  NewProject,
  ProjectUpdate,
  ProjectEnvironment,
} from '../db/types.ts';

export interface CreateProjectInput {
  name: string;
  github_repo: string;
  default_branch?: string;
  branch_prefix?: string;
  mastra_path?: string;
  ui_sandbox_path?: string | null;
}

export interface AddEnvironmentInput {
  name: string;
  env_vars: Record<string, string>;
}

export class ProjectsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Creates a new project.
   */
  async create(input: CreateProjectInput): Promise<Project> {
    const values: NewProject = {
      name: input.name,
      github_repo: input.github_repo,
      default_branch: input.default_branch,
      branch_prefix: input.branch_prefix,
      mastra_path: input.mastra_path,
      ui_sandbox_path: input.ui_sandbox_path ?? null,
    };

    return this.db
      .insertInto('projects')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Finds a project by its ID.
   */
  async findById(id: string): Promise<Project | undefined> {
    return this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Finds a project by its name.
   */
  async findByName(name: string): Promise<Project | undefined> {
    return this.db
      .selectFrom('projects')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
  }

  /**
   * Returns all projects.
   */
  async findAll(): Promise<Project[]> {
    return this.db.selectFrom('projects').selectAll().execute();
  }

  /**
   * Updates a project by its ID.
   */
  async update(id: string, updates: ProjectUpdate): Promise<Project | undefined> {
    const result = await this.db
      .updateTable('projects')
      .set({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return result;
  }

  /**
   * Deletes a project by its ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('projects')
      .where('id', '=', id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Adds an environment to a project.
   */
  async addEnvironment(projectId: string, input: AddEnvironmentInput): Promise<ProjectEnvironment> {
    return this.db
      .insertInto('project_environments')
      .values({
        project_id: projectId,
        name: input.name,
        env_vars: JSON.stringify(input.env_vars),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Returns all environments for a project.
   */
  async findEnvironments(projectId: string): Promise<ProjectEnvironment[]> {
    return this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
  }

  /**
   * Finds an environment by project ID and name.
   */
  async findEnvironmentByName(
    projectId: string,
    name: string
  ): Promise<ProjectEnvironment | undefined> {
    return this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', name)
      .executeTakeFirst();
  }
}
