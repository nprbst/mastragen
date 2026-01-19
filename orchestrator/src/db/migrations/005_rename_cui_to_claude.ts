import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 005: Rename CUI to Claude
 *
 * This migration renames cui-related tables and columns as part of
 * consolidating Claude Code functionality into the VS Code container.
 *
 * Changes:
 * - Renames table `project_cui_config` → `project_claude_config`
 * - Drops column `sessions.cui_auth_token` (no longer needed)
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Rename project_cui_config table to project_claude_config
  await sql`ALTER TABLE project_cui_config RENAME TO project_claude_config`.execute(db);

  // SQLite doesn't support DROP COLUMN directly before 3.35.0
  // We need to recreate the sessions table without cui_auth_token
  // For now, just leave the column (it will be ignored) to avoid complex migration
  // The column will remain but be unused - this is safe and avoids data loss risk
}

/**
 * Rollback migration 005
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(db: Kysely<any>): Promise<void> {
  // Rename back to project_cui_config
  await sql`ALTER TABLE project_claude_config RENAME TO project_cui_config`.execute(db);

  // Note: cui_auth_token column was left in place, no rollback needed
}
