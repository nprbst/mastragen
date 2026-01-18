import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  SessionShare,
  NewSessionShare,
} from '../db/types.ts';

/**
 * Repository for managing session shares.
 */
export class SessionSharesRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a session share.
   */
  async create(data: {
    sessionId: string;
    sharedByUserId: string;
    sharedWithUserId: string;
  }): Promise<SessionShare> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('session_shares')
      .values({
        id,
        session_id: data.sessionId,
        shared_by_user_id: data.sharedByUserId,
        shared_with_user_id: data.sharedWithUserId,
        granted_at: now,
        revoked_at: null,
      })
      .execute();

    const share = await this.findById(id);
    if (!share) {
      throw new Error('Failed to create session share');
    }
    return share;
  }

  /**
   * Find a share by ID.
   */
  async findById(id: string): Promise<SessionShare | undefined> {
    return this.db
      .selectFrom('session_shares')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find an active share for a user on a session.
   */
  async findActiveShare(sessionId: string, sharedWithUserId: string): Promise<SessionShare | undefined> {
    return this.db
      .selectFrom('session_shares')
      .selectAll()
      .where('session_id', '=', sessionId)
      .where('shared_with_user_id', '=', sharedWithUserId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
  }

  /**
   * Check if a user has active access to a session via sharing.
   */
  async hasAccess(sessionId: string, userId: string): Promise<boolean> {
    const share = await this.findActiveShare(sessionId, userId);
    return share !== undefined;
  }

  /**
   * Get all active shares for a session.
   */
  async getSessionShares(sessionId: string): Promise<
    Array<SessionShare & { shared_with_email: string; shared_with_name: string | null }>
  > {
    return this.db
      .selectFrom('session_shares')
      .innerJoin('users', 'users.id', 'session_shares.shared_with_user_id')
      .select([
        'session_shares.id',
        'session_shares.session_id',
        'session_shares.shared_by_user_id',
        'session_shares.shared_with_user_id',
        'session_shares.granted_at',
        'session_shares.revoked_at',
        'users.email as shared_with_email',
        'users.name as shared_with_name',
      ])
      .where('session_shares.session_id', '=', sessionId)
      .where('session_shares.revoked_at', 'is', null)
      .orderBy('session_shares.granted_at', 'asc')
      .execute();
  }

  /**
   * Get all sessions shared with a user.
   */
  async getSharedWithUser(userId: string): Promise<
    Array<SessionShare & { session_artifact_name: string; shared_by_email: string }>
  > {
    return this.db
      .selectFrom('session_shares')
      .innerJoin('sessions', 'sessions.id', 'session_shares.session_id')
      .innerJoin('users', 'users.id', 'session_shares.shared_by_user_id')
      .select([
        'session_shares.id',
        'session_shares.session_id',
        'session_shares.shared_by_user_id',
        'session_shares.shared_with_user_id',
        'session_shares.granted_at',
        'session_shares.revoked_at',
        'sessions.artifact_name as session_artifact_name',
        'users.email as shared_by_email',
      ])
      .where('session_shares.shared_with_user_id', '=', userId)
      .where('session_shares.revoked_at', 'is', null)
      .orderBy('session_shares.granted_at', 'desc')
      .execute();
  }

  /**
   * Revoke a session share.
   */
  async revoke(id: string): Promise<SessionShare | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('session_shares')
      .set({ revoked_at: now })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .execute();

    if (result[0]?.numUpdatedRows === 0n) {
      return undefined;
    }

    return this.findById(id);
  }

  /**
   * Revoke all shares for a session.
   */
  async revokeAllForSession(sessionId: string): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('session_shares')
      .set({ revoked_at: now })
      .where('session_id', '=', sessionId)
      .where('revoked_at', 'is', null)
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  /**
   * Count active shares for a session.
   */
  async countActiveShares(sessionId: string): Promise<number> {
    const result = await this.db
      .selectFrom('session_shares')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('session_id', '=', sessionId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Get share history for a session (including revoked).
   */
  async getShareHistory(sessionId: string): Promise<SessionShare[]> {
    return this.db
      .selectFrom('session_shares')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('granted_at', 'desc')
      .execute();
  }
}
