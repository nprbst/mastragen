import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Database schema definition for Kysely.
 * Matches the data model from specs/001-core-platform-foundation/data-model.md
 * Extended with Phase 3 tables from specs/003-cui-config-landing-page/data-model.md
 */
export interface Database {
  projects: ProjectsTable;
  project_environments: ProjectEnvironmentsTable;
  sessions: SessionsTable;
  // Phase 3 tables
  users: UsersTable;
  user_project_members: UserProjectMembersTable;
  project_cui_config: ProjectCuiConfigTable;
  project_commands: ProjectCommandsTable;
  project_skills: ProjectSkillsTable;
  session_shares: SessionSharesTable;
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
 * Session state type for lifecycle management.
 * Extended in Phase 3 with 'merged' and 'archived' states.
 */
export type SessionStateType = 'active' | 'suspended' | 'pr_open' | 'merged' | 'archived' | 'closed';

/**
 * Sessions table - active or suspended development session.
 * Extended with git-related fields per specs/002-git-multi-project/data-model.md
 * Extended with last_activity_at per specs/003-cui-config-landing-page/data-model.md
 */
export interface SessionsTable {
  id: Generated<string>;
  project_id: string;
  artifact_name: string;
  environment: string;
  state: Generated<SessionStateType>;
  container_id: string | null;
  workspace_volume: string | null;
  cui_auth_token: string | null;
  user_id: string | null;
  branch_name: string | null;
  last_commit_sha: string | null;
  commit_count: Generated<number>;
  pr_number: number | null;
  pr_url: string | null;
  last_activity_at: Generated<string>;
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

// ============================================================================
// Phase 3 tables - cui Configuration & Landing Page
// ============================================================================

/**
 * User role in a project.
 */
export type ProjectRole = 'admin' | 'member';

/**
 * OIDC provider type.
 */
export type AuthProvider = 'google' | 'github' | 'azure' | 'custom';

/**
 * Users table - authenticated users from OIDC provider.
 */
export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider: AuthProvider;
  provider_id: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * User-project membership for access control.
 */
export interface UserProjectMembersTable {
  id: Generated<string>;
  user_id: string;
  project_id: string;
  role: Generated<ProjectRole>;
  created_at: Generated<string>;
}

/**
 * cui configuration for a project (MCP servers, CLAUDE.md, auto-approve patterns).
 */
export interface ProjectCuiConfigTable {
  id: Generated<string>;
  project_id: string;
  mcp_servers: Generated<string>; // JSON object
  claude_md: string | null;
  auto_approve_file_patterns: Generated<string>; // JSON array
  auto_approve_mcp_tools: Generated<string>; // JSON array
  auto_approve_bash_commands: Generated<string>; // JSON array
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Custom slash commands for a project.
 */
export interface ProjectCommandsTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  description: string | null;
  content: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Custom skills (knowledge/instructions) for a project.
 */
export interface ProjectSkillsTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  description: string | null;
  content: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Session sharing records.
 */
export interface SessionSharesTable {
  id: Generated<string>;
  session_id: string;
  shared_by_user_id: string;
  shared_with_user_id: string;
  granted_at: Generated<string>;
  revoked_at: string | null;
}

// Convenience types for Users
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

// Convenience types for UserProjectMembers
export type UserProjectMember = Selectable<UserProjectMembersTable>;
export type NewUserProjectMember = Insertable<UserProjectMembersTable>;

// Convenience types for ProjectCuiConfig
export type ProjectCuiConfig = Selectable<ProjectCuiConfigTable>;
export type NewProjectCuiConfig = Insertable<ProjectCuiConfigTable>;
export type ProjectCuiConfigUpdate = Updateable<ProjectCuiConfigTable>;

// Convenience types for ProjectCommands
export type ProjectCommand = Selectable<ProjectCommandsTable>;
export type NewProjectCommand = Insertable<ProjectCommandsTable>;
export type ProjectCommandUpdate = Updateable<ProjectCommandsTable>;

// Convenience types for ProjectSkills
export type ProjectSkill = Selectable<ProjectSkillsTable>;
export type NewProjectSkill = Insertable<ProjectSkillsTable>;
export type ProjectSkillUpdate = Updateable<ProjectSkillsTable>;

// Convenience types for SessionShares
export type SessionShare = Selectable<SessionSharesTable>;
export type NewSessionShare = Insertable<SessionSharesTable>;
export type SessionShareUpdate = Updateable<SessionSharesTable>;
