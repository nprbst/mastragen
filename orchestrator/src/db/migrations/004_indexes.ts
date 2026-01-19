/**
 * T113: Add database indexes for performance
 *
 * Indexes per data-model.md specifications:
 * - sessions: state, project_id, user_id, updated_at
 * - project_skills: project_id
 * - project_commands: project_id
 * - session_shares: session_id
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../types.ts';

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  console.log('[Migration 004] Adding performance indexes...');

  // Sessions indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_state
    ON sessions(state);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_project_id
    ON sessions(project_id);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions(updated_at);
  `.execute(db);

  // Compound index for common query pattern
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_project_state
    ON sessions(project_id, state);
  `.execute(db);

  // Project skills index
  await sql`
    CREATE INDEX IF NOT EXISTS idx_project_skills_project_id
    ON project_skills(project_id);
  `.execute(db);

  // Project commands index
  await sql`
    CREATE INDEX IF NOT EXISTS idx_project_commands_project_id
    ON project_commands(project_id);
  `.execute(db);

  // Session shares indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_session_shares_session_id
    ON session_shares(session_id);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_session_shares_shared_with
    ON session_shares(shared_with_email);
  `.execute(db);

  // GitHub installations index
  await sql`
    CREATE INDEX IF NOT EXISTS idx_github_installations_account
    ON github_app_installations(account_login);
  `.execute(db);

  // Projects installation link
  await sql`
    CREATE INDEX IF NOT EXISTS idx_projects_installation
    ON projects(installation_id);
  `.execute(db);

  console.log('[Migration 004] Indexes created successfully');
}
