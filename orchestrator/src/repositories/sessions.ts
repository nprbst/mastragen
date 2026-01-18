import type { Kysely } from 'kysely';
import type { Database, Session, NewSession, SessionUpdate } from '../db/types.ts';

export interface CreateSessionInput {
  project_id: string;
  artifact_name: string;
  environment: string;
  container_id?: string | null;
  workspace_volume?: string | null;
  cui_auth_token?: string | null;
}

export interface SessionFilters {
  projectId?: string;
  state?: 'active' | 'suspended';
}

export class SessionsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Creates a new session.
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const values: NewSession = {
      project_id: input.project_id,
      artifact_name: input.artifact_name,
      environment: input.environment,
      container_id: input.container_id ?? null,
      workspace_volume: input.workspace_volume ?? null,
      cui_auth_token: input.cui_auth_token ?? null,
    };

    return this.db
      .insertInto('sessions')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Finds a session by its ID.
   */
  async findById(id: string): Promise<Session | undefined> {
    return this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Finds a session by project ID and artifact name.
   */
  async findByProjectAndName(
    projectId: string,
    artifactName: string
  ): Promise<Session | undefined> {
    return this.db
      .selectFrom('sessions')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('artifact_name', '=', artifactName)
      .executeTakeFirst();
  }

  /**
   * Returns all sessions, optionally filtered.
   */
  async findAll(filters?: SessionFilters): Promise<Session[]> {
    let query = this.db.selectFrom('sessions').selectAll();

    if (filters?.projectId) {
      query = query.where('project_id', '=', filters.projectId);
    }

    if (filters?.state) {
      query = query.where('state', '=', filters.state);
    }

    return query.execute();
  }

  /**
   * Updates a session's state and optionally other fields.
   */
  async updateState(
    id: string,
    state: 'active' | 'suspended',
    additionalUpdates?: Partial<Pick<Session, 'container_id' | 'workspace_volume'>>
  ): Promise<Session | undefined> {
    const updates: SessionUpdate = {
      state,
      updated_at: new Date().toISOString(),
      ...additionalUpdates,
    };

    return this.db
      .updateTable('sessions')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Updates a session by its ID.
   */
  async update(id: string, updates: SessionUpdate): Promise<Session | undefined> {
    return this.db
      .updateTable('sessions')
      .set({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Deletes a session by its ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('sessions')
      .where('id', '=', id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }
}
