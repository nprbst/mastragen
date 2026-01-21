import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 006: Add suspension_reason to sessions (Phase 4)
 *
 * Adds a column to track why a session was suspended:
 * - 'manual': User explicitly suspended the session
 * - 'auto': Session was auto-suspended due to idle timeout
 * - 'share_revoke': Session was suspended when share access was revoked
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Add suspension_reason column to sessions table
  // Nullable since existing sessions don't have this value
  await sql`ALTER TABLE sessions ADD COLUMN suspension_reason TEXT`.execute(db);

  // Backfill existing suspended sessions with 'manual' reason
  await sql`UPDATE sessions SET suspension_reason = 'manual' WHERE state = 'suspended' AND suspension_reason IS NULL`.execute(
    db
  );
}

/**
 * Rollback migration 006
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(_db: Kysely<any>): Promise<void> {
  // Note: SQLite doesn't support DROP COLUMN easily
  // The column will remain but be unused after rollback
}
