import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 009: Add chrome_mode and user_tailscale_hostname to sessions
 *
 * Adds columns to support Chrome DevTools MCP integration:
 * - chrome_mode: 'sidecar' (container Chrome) or 'local' (user's Chrome via Tailscale)
 * - user_tailscale_hostname: The user's Tailscale hostname for local mode
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Add chrome_mode column (nullable, defaults handled at application level)
  await sql`ALTER TABLE sessions ADD COLUMN chrome_mode TEXT`.execute(db);

  // Add user_tailscale_hostname column for local mode
  await sql`ALTER TABLE sessions ADD COLUMN user_tailscale_hostname TEXT`.execute(db);
}

/**
 * Rollback migration 009
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(_db: Kysely<any>): Promise<void> {
  // Note: SQLite doesn't support DROP COLUMN easily
  // The columns will remain but be unused after rollback
}
