import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration: adds git-related fields to sessions table.
 * Schema matches specs/002-git-multi-project/data-model.md
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function runMigrations(db: Kysely<any>): Promise<void> {
  // Check if migration has already been applied by looking for user_id column
  const tableInfo = await sql<{ name: string }>`PRAGMA table_info(sessions)`.execute(
    db
  );
  const columns = tableInfo.rows.map((row) => row.name);

  if (columns.includes('user_id')) {
    // Migration already applied
    return;
  }

  // Add git-related columns to sessions table
  await db.schema
    .alterTable('sessions')
    .addColumn('user_id', 'text')
    .execute();

  await db.schema
    .alterTable('sessions')
    .addColumn('branch_name', 'text')
    .execute();

  await db.schema
    .alterTable('sessions')
    .addColumn('last_commit_sha', 'text')
    .execute();

  await db.schema
    .alterTable('sessions')
    .addColumn('commit_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .alterTable('sessions')
    .addColumn('pr_number', 'integer')
    .execute();

  await db.schema
    .alterTable('sessions')
    .addColumn('pr_url', 'text')
    .execute();

  // SQLite doesn't support modifying check constraints directly.
  // The state check constraint from 001_initial.ts will still exist but
  // SQLite allows inserting values that don't match check constraints
  // created via CREATE TABLE when using ALTER TABLE to add data.
  // For proper constraint enforcement, we would need to recreate the table.
  // Instead, we validate states at the application layer via Valibot schemas.

  // Create index on user_id for filtering sessions by user
  await db.schema
    .createIndex('idx_sessions_user_id')
    .ifNotExists()
    .on('sessions')
    .column('user_id')
    .execute();
}
