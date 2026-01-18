import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../types.ts';

/**
 * Migration 003: cui Configuration & Landing Page (Phase 3)
 *
 * Creates tables for:
 * - users (authenticated users from OIDC)
 * - user_project_members (user-project membership for access control)
 * - project_cui_config (cui configuration per project)
 * - project_commands (custom slash commands per project)
 * - project_skills (custom skills per project)
 * - session_shares (session sharing records)
 *
 * Also extends the sessions table with last_activity_at column.
 */
export async function runMigrations(db: Kysely<Database>): Promise<void> {
  // Create users table
  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create indexes for users
  await db.schema
    .createIndex('users_email_idx')
    .ifNotExists()
    .on('users')
    .column('email')
    .execute();

  await db.schema
    .createIndex('users_provider_idx')
    .ifNotExists()
    .on('users')
    .columns(['provider', 'provider_id'])
    .execute();

  // Create user_project_members table
  await db.schema
    .createTable('user_project_members')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('member'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('user_project_members_unique', ['user_id', 'project_id'])
    .execute();

  // Create indexes for user_project_members
  await db.schema
    .createIndex('user_project_members_user_idx')
    .ifNotExists()
    .on('user_project_members')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('user_project_members_project_idx')
    .ifNotExists()
    .on('user_project_members')
    .column('project_id')
    .execute();

  // Create project_cui_config table
  await db.schema
    .createTable('project_cui_config')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().unique().references('projects.id').onDelete('cascade')
    )
    .addColumn('mcp_servers', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('claude_md', 'text')
    .addColumn('auto_approve_file_patterns', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('auto_approve_mcp_tools', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('auto_approve_bash_commands', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create project_commands table
  await db.schema
    .createTable('project_commands')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('project_commands_unique', ['project_id', 'name'])
    .execute();

  // Create index for project_commands
  await db.schema
    .createIndex('project_commands_project_idx')
    .ifNotExists()
    .on('project_commands')
    .column('project_id')
    .execute();

  // Create project_skills table
  await db.schema
    .createTable('project_skills')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('project_skills_unique', ['project_id', 'name'])
    .execute();

  // Create index for project_skills
  await db.schema
    .createIndex('project_skills_project_idx')
    .ifNotExists()
    .on('project_skills')
    .column('project_id')
    .execute();

  // Create session_shares table
  await db.schema
    .createTable('session_shares')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('sessions.id').onDelete('cascade')
    )
    .addColumn('shared_by_user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('shared_with_user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('granted_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('revoked_at', 'text')
    .execute();

  // Create indexes for session_shares
  await db.schema
    .createIndex('session_shares_session_idx')
    .ifNotExists()
    .on('session_shares')
    .column('session_id')
    .execute();

  await db.schema
    .createIndex('session_shares_shared_with_idx')
    .ifNotExists()
    .on('session_shares')
    .column('shared_with_user_id')
    .execute();

  // Extend sessions table with last_activity_at column
  // Using raw SQL since ALTER TABLE ADD COLUMN doesn't support all Kysely methods
  await sql`ALTER TABLE sessions ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))`.execute(
    db
  );

  // Create indexes for sessions (for dashboard queries)
  await db.schema
    .createIndex('sessions_user_state_idx')
    .ifNotExists()
    .on('sessions')
    .columns(['user_id', 'state', 'updated_at'])
    .execute();

  await db.schema
    .createIndex('sessions_activity_idx')
    .ifNotExists()
    .on('sessions')
    .columns(['state', 'last_activity_at'])
    .execute();
}

/**
 * Rollback migration 003
 */
export async function rollbackMigrations(db: Kysely<Database>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('sessions_activity_idx').ifExists().execute();
  await db.schema.dropIndex('sessions_user_state_idx').ifExists().execute();
  await db.schema.dropIndex('session_shares_shared_with_idx').ifExists().execute();
  await db.schema.dropIndex('session_shares_session_idx').ifExists().execute();
  await db.schema.dropIndex('project_skills_project_idx').ifExists().execute();
  await db.schema.dropIndex('project_commands_project_idx').ifExists().execute();
  await db.schema.dropIndex('user_project_members_project_idx').ifExists().execute();
  await db.schema.dropIndex('user_project_members_user_idx').ifExists().execute();
  await db.schema.dropIndex('users_provider_idx').ifExists().execute();
  await db.schema.dropIndex('users_email_idx').ifExists().execute();

  // Drop tables (in reverse dependency order)
  await db.schema.dropTable('session_shares').ifExists().execute();
  await db.schema.dropTable('project_skills').ifExists().execute();
  await db.schema.dropTable('project_commands').ifExists().execute();
  await db.schema.dropTable('project_cui_config').ifExists().execute();
  await db.schema.dropTable('user_project_members').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();

  // Note: Cannot easily remove column from SQLite, would need to recreate table
  // last_activity_at column on sessions will remain
}
