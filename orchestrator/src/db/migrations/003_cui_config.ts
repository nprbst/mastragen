import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 003: CUI Configuration & Landing Page (Phase 3)
 *
 * Creates tables for:
 * - github_app_installations (GitHub App installation records)
 * - users (authenticated users from GitHub OAuth)
 * - project_cui_config (CUI configuration per project)
 * - project_commands (custom slash commands per project)
 * - project_skills (custom skills per project)
 * - session_shares (session sharing records)
 *
 * Also extends:
 * - projects table with installation_id FK
 * - sessions table with last_activity_at column
 *
 * Access control is derived from GitHub App installations - no manual membership table.
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Create github_app_installations table (must be created before projects references it)
  await db.schema
    .createTable('github_app_installations')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('installation_id', 'integer', (col) => col.notNull().unique())
    .addColumn('account_type', 'text', (col) => col.notNull())
    .addColumn('account_login', 'text', (col) => col.notNull())
    .addColumn('account_id', 'integer', (col) => col.notNull())
    .addColumn('permissions', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('repository_selection', 'text', (col) => col.notNull())
    .addColumn('suspended_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create indexes for github_app_installations
  await db.schema
    .createIndex('github_app_installations_installation_id_idx')
    .on('github_app_installations')
    .column('installation_id')
    .execute();

  await db.schema
    .createIndex('github_app_installations_account_idx')
    .on('github_app_installations')
    .column('account_login')
    .execute();

  // Create users table (GitHub-specific fields)
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('github_id', 'integer', (col) => col.notNull().unique())
    .addColumn('github_login', 'text', (col) => col.notNull())
    .addColumn('github_access_token', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create indexes for users
  await db.schema.createIndex('users_email_idx').on('users').column('email').execute();

  await db.schema.createIndex('users_github_id_idx').on('users').column('github_id').execute();

  await db.schema
    .createIndex('users_github_login_idx')
    .on('users')
    .column('github_login')
    .execute();

  // Extend projects table with installation_id FK
  await sql`ALTER TABLE projects ADD COLUMN installation_id TEXT REFERENCES github_app_installations(id)`.execute(
    db
  );

  // Create project_cui_config table
  await db.schema
    .createTable('project_cui_config')
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
    .on('project_commands')
    .column('project_id')
    .execute();

  // Create project_skills table
  await db.schema
    .createTable('project_skills')
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
    .on('project_skills')
    .column('project_id')
    .execute();

  // Create session_shares table
  await db.schema
    .createTable('session_shares')
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
    .on('session_shares')
    .column('session_id')
    .execute();

  await db.schema
    .createIndex('session_shares_shared_with_idx')
    .on('session_shares')
    .column('shared_with_user_id')
    .execute();

  // Extend sessions table with last_activity_at column
  // SQLite ALTER TABLE ADD COLUMN doesn't support non-constant defaults like datetime('now')
  // Add as nullable, backfill existing rows, then handle defaults in application layer
  await sql`ALTER TABLE sessions ADD COLUMN last_activity_at TEXT`.execute(db);

  // Backfill existing sessions with current timestamp
  await sql`UPDATE sessions SET last_activity_at = datetime('now') WHERE last_activity_at IS NULL`.execute(
    db
  );

  // Create indexes for sessions (for dashboard queries)
  await db.schema
    .createIndex('sessions_user_state_idx')
    .on('sessions')
    .columns(['user_id', 'state', 'updated_at'])
    .execute();

  await db.schema
    .createIndex('sessions_activity_idx')
    .on('sessions')
    .columns(['state', 'last_activity_at'])
    .execute();
}

/**
 * Rollback migration 003
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('sessions_activity_idx').ifExists().execute();
  await db.schema.dropIndex('sessions_user_state_idx').ifExists().execute();
  await db.schema.dropIndex('session_shares_shared_with_idx').ifExists().execute();
  await db.schema.dropIndex('session_shares_session_idx').ifExists().execute();
  await db.schema.dropIndex('project_skills_project_idx').ifExists().execute();
  await db.schema.dropIndex('project_commands_project_idx').ifExists().execute();
  await db.schema.dropIndex('users_github_login_idx').ifExists().execute();
  await db.schema.dropIndex('users_github_id_idx').ifExists().execute();
  await db.schema.dropIndex('users_email_idx').ifExists().execute();
  await db.schema.dropIndex('github_app_installations_account_idx').ifExists().execute();
  await db.schema.dropIndex('github_app_installations_installation_id_idx').ifExists().execute();

  // Drop tables (in reverse dependency order)
  await db.schema.dropTable('session_shares').ifExists().execute();
  await db.schema.dropTable('project_skills').ifExists().execute();
  await db.schema.dropTable('project_commands').ifExists().execute();
  await db.schema.dropTable('project_cui_config').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
  await db.schema.dropTable('github_app_installations').ifExists().execute();

  // Note: Cannot easily remove columns from SQLite, would need to recreate table
  // last_activity_at column on sessions and installation_id on projects will remain
}
