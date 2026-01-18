import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Database schema definition for Kysely.
 * Matches the data model from specs/001-core-platform-foundation/data-model.md
 */
export interface Database {
  projects: ProjectsTable;
  project_environments: ProjectEnvironmentsTable;
  sessions: SessionsTable;
}

/**
 * Projects table - represents a Mastra codebase configuration.
 */
export interface ProjectsTable {
  id: Generated<string>;
  name: string;
  github_repo: string;
  default_branch: Generated<string>;
  branch_prefix: Generated<string>;
  mastra_path: Generated<string>;
  ui_sandbox_path: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Project environments table - environment-specific configuration.
 */
export interface ProjectEnvironmentsTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  env_vars: Generated<string>;
  created_at: Generated<string>;
}

/**
 * Sessions table - active or suspended development session.
 */
export interface SessionsTable {
  id: Generated<string>;
  project_id: string;
  artifact_name: string;
  environment: string;
  state: Generated<'active' | 'suspended'>;
  container_id: string | null;
  workspace_volume: string | null;
  cui_auth_token: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// Convenience types for Projects
export type Project = Selectable<ProjectsTable>;
export type NewProject = Insertable<ProjectsTable>;
export type ProjectUpdate = Updateable<ProjectsTable>;

// Convenience types for ProjectEnvironments
export type ProjectEnvironment = Selectable<ProjectEnvironmentsTable>;
export type NewProjectEnvironment = Insertable<ProjectEnvironmentsTable>;

// Convenience types for Sessions
export type Session = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;
