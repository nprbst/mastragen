import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 008: Create idle_config table (Phase 4)
 *
 * Creates table for per-project idle timeout configuration.
 * Includes a global default row (project_id = null) with:
 * - 30 minute idle timeout
 * - 5 minute warning before suspension
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Create idle_config table
  await db.schema
    .createTable('idle_config')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.unique().references('projects.id').onDelete('cascade')
    )
    .addColumn('idle_timeout_minutes', 'integer', (col) => col.notNull().defaultTo(30))
    .addColumn('warning_minutes', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create unique index on project_id (allows null for global default)
  await db.schema
    .createIndex('idx_idle_config_project_id')
    .on('idle_config')
    .column('project_id')
    .unique()
    .execute();

  // Seed global default config (project_id = null)
  const now = new Date().toISOString();
  await db
    .insertInto('idle_config')
    .values({
      id: 'idle-config-global',
      project_id: null,
      idle_timeout_minutes: 30,
      warning_minutes: 5,
      enabled: 1,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

/**
 * Rollback migration 008
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(db: Kysely<any>): Promise<void> {
  // Drop index
  await db.schema.dropIndex('idx_idle_config_project_id').ifExists().execute();

  // Drop table
  await db.schema.dropTable('idle_config').ifExists().execute();
}
