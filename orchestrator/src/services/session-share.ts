/**
 * T098: Session share service
 *
 * Handles sharing sessions with other users:
 * - Create share record in database
 * - Update Tailscale ACLs
 * - Return share URL/info
 */
import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type { Database } from '../db/types.ts';

interface TailscaleService {
  grantAccess(args: { email: string; hostname: string }): Promise<void>;
  revokeAccess(args: { email: string; hostname: string }): Promise<void>;
}

interface ShareInput {
  sessionId: string;
  sharedWithEmail: string;
  sharedByUserId: string;
  sandboxHostname: string;
}

interface ShareResult {
  shareId: string;
  sharedWithEmail: string;
  accessUrl: string;
  createdAt: string;
}

interface ShareInfo {
  id: string;
  sessionId: string;
  sharedWithEmail: string;
  sharedByUserId: string;
  createdAt: string;
}

export class SessionShareService {
  constructor(
    private db: Kysely<Database>,
    private tailscale: TailscaleService
  ) {}

  /**
   * Share a session with another user.
   */
  async share(input: ShareInput): Promise<ShareResult> {
    const shareId = nanoid(12);
    const now = new Date().toISOString();

    // Create share record
    await this.db
      .insertInto('session_shares')
      .values({
        id: shareId,
        session_id: input.sessionId,
        shared_with_email: input.sharedWithEmail,
        shared_by_user_id: input.sharedByUserId,
        created_at: now,
      })
      .execute();

    // Grant Tailscale access
    await this.tailscale.grantAccess({
      email: input.sharedWithEmail,
      hostname: input.sandboxHostname,
    });

    return {
      shareId,
      sharedWithEmail: input.sharedWithEmail,
      accessUrl: `https://${input.sandboxHostname}`,
      createdAt: now,
    };
  }

  /**
   * Revoke a share.
   */
  async revoke(shareId: string, sandboxHostname: string): Promise<void> {
    // Get share info
    const share = await this.db
      .selectFrom('session_shares')
      .selectAll()
      .where('id', '=', shareId)
      .executeTakeFirst();

    if (!share) {
      throw new Error(`Share not found: ${shareId}`);
    }

    // Revoke Tailscale access
    await this.tailscale.revokeAccess({
      email: share.shared_with_email,
      hostname: sandboxHostname,
    });

    // Delete share record
    await this.db.deleteFrom('session_shares').where('id', '=', shareId).execute();
  }

  /**
   * List all shares for a session.
   */
  async listShares(sessionId: string): Promise<ShareInfo[]> {
    const shares = await this.db
      .selectFrom('session_shares')
      .selectAll()
      .where('session_id', '=', sessionId)
      .execute();

    return shares.map((share) => ({
      id: share.id,
      sessionId: share.session_id,
      sharedWithEmail: share.shared_with_email,
      sharedByUserId: share.shared_by_user_id,
      createdAt: share.created_at,
    }));
  }
}
