import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Initial migration: creates projects, project_environments, and sessions tables.
 * Schema matches specs/001-core-platform-foundation/data-model.md
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Create projects table
  await db.schema
    .createTable('projects')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(substr(hex(randomblob(3)), 1, 6))`)
    )
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('github_repo', 'text', (col) => col.notNull())
    .addColumn('default_branch', 'text', (col) => col.notNull().defaultTo('main'))
    .addColumn('branch_prefix', 'text', (col) => col.notNull().defaultTo('mg/'))
    .addColumn('mastra_path', 'text', (col) => col.notNull().defaultTo('.'))
    .addColumn('ui_sandbox_path', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create project_environments table
  await db.schema
    .createTable('project_environments')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(substr(hex(randomblob(3)), 1, 6))`)
    )
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('env_vars', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('unique_project_env', ['project_id', 'name'])
    .execute();

  // Create sessions table
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(substr(hex(randomblob(3)), 1, 6))`)
    )
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('artifact_name', 'text', (col) => col.notNull())
    .addColumn('environment', 'text', (col) => col.notNull())
    .addColumn('state', 'text', (col) =>
      col
        .notNull()
        .defaultTo('active')
        .check(sql`state IN ('active', 'suspended', 'pr_open', 'closed')`)
    )
    .addColumn('container_id', 'text')
    .addColumn('workspace_volume', 'text')
    .addColumn('cui_auth_token', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('unique_project_artifact', ['project_id', 'artifact_name'])
    .execute();

  // Create indexes for sessions
  await db.schema
    .createIndex('idx_sessions_project_id')
    .on('sessions')
    .column('project_id')
    .execute();

  await db.schema.createIndex('idx_sessions_state').on('sessions').column('state').execute();
}

/**
 * Rollback: drops all tables created in this migration.
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sessions').ifExists().execute();
  await db.schema.dropTable('project_environments').ifExists().execute();
  await db.schema.dropTable('projects').ifExists().execute();
}
