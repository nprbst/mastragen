import type { Kysely } from 'kysely';
import type { Database, NewSession, Session, SessionUpdate } from '../db/types.ts';
import type { SessionState } from '../schemas/common.ts';

export interface CreateSessionInput {
  id?: string;
  project_id: string;
  artifact_name: string;
  environment: string;
  container_id?: string | null;
  workspace_volume?: string | null;
  user_id?: string | null;
  branch_name?: string | null;
}

export interface UpdateGitStateInput {
  lastCommitSha?: string | null;
  commitCount?: number;
}

export interface UpdatePRStateInput {
  prNumber: number;
  prUrl: string;
}

export interface SessionFilters {
  projectId?: string;
  state?: SessionState;
  userId?: string;
  limit?: number;
  offset?: number;
}

export class SessionsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Creates a new session.
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const now = new Date().toISOString();
    const values: NewSession = {
      project_id: input.project_id,
      artifact_name: input.artifact_name,
      environment: input.environment,
      container_id: input.container_id ?? null,
      workspace_volume: input.workspace_volume ?? null,
      user_id: input.user_id ?? null,
      branch_name: input.branch_name ?? null,
      last_activity_at: now,
    };

    // If ID is provided, use it (needed for createWithGit to generate branch name)
    if (input.id) {
      (values as any).id = input.id;
    }

    return this.db.insertInto('sessions').values(values).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Finds a session by its ID.
   */
  async findById(id: string): Promise<Session | undefined> {
    return this.db.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
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
   * Supports pagination via limit and offset.
   */
  async findAll(filters?: SessionFilters): Promise<Session[]> {
    let query = this.db.selectFrom('sessions').selectAll().orderBy('updated_at', 'desc');

    if (filters?.projectId) {
      query = query.where('project_id', '=', filters.projectId);
    }

    if (filters?.state) {
      query = query.where('state', '=', filters.state);
    }

    if (filters?.userId) {
      query = query.where('user_id', '=', filters.userId);
    }

    if (filters?.limit !== undefined) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset !== undefined) {
      query = query.offset(filters.offset);
    }

    return query.execute();
  }

  /**
   * Updates a session's state and optionally other fields.
   */
  async updateState(
    id: string,
    state: SessionState,
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
   * Updates a session's git state (lastCommitSha, commitCount).
   */
  async updateGitState(id: string, input: UpdateGitStateInput): Promise<Session | undefined> {
    const updates: SessionUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (input.lastCommitSha !== undefined) {
      updates.last_commit_sha = input.lastCommitSha;
    }

    if (input.commitCount !== undefined) {
      updates.commit_count = input.commitCount;
    }

    return this.db
      .updateTable('sessions')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Updates a session's PR state (T056).
   * Sets state to 'pr_open' and stores PR number and URL.
   */
  async updatePRState(id: string, input: UpdatePRStateInput): Promise<Session | undefined> {
    return this.db
      .updateTable('sessions')
      .set({
        state: 'pr_open',
        pr_number: input.prNumber,
        pr_url: input.prUrl,
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
    const result = await this.db.deleteFrom('sessions').where('id', '=', id).executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }
}
