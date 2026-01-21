import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Database schema definition for Kysely.
 * Matches the data model from specs/001-core-platform-foundation/data-model.md
 * Extended with Phase 3 tables from specs/003-cui-config-landing-page/data-model.md
 * Extended with Phase 4 tables from specs/004-production-readiness/data-model.md
 */
export interface Database {
  projects: ProjectsTable;
  project_environments: ProjectEnvironmentsTable;
  sessions: SessionsTable;
  // Phase 3 tables
  github_app_installations: GithubAppInstallationsTable;
  users: UsersTable;
  project_claude_config: ProjectClaudeConfigTable;
  project_commands: ProjectCommandsTable;
  project_skills: ProjectSkillsTable;
  session_shares: SessionSharesTable;
  // Phase 4 tables
  alert_rules: AlertRulesTable;
  alert_events: AlertEventsTable;
  idle_config: IdleConfigTable;
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
  installation_id: string | null;
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
 * Suspension reason type for session suspension tracking.
 * Added in Phase 4 for idle auto-suspend feature.
 */
export type SuspensionReasonType = 'manual' | 'auto' | 'share_revoke';

/**
 * Sessions table - active or suspended development session.
 * Extended with git-related fields per specs/002-git-multi-project/data-model.md
 * Extended with last_activity_at per specs/003-cui-config-landing-page/data-model.md
 * Extended with suspension_reason per specs/004-production-readiness/data-model.md
 */
export interface SessionsTable {
  id: Generated<string>;
  project_id: string;
  artifact_name: string;
  environment: string;
  state: Generated<SessionStateType>;
  container_id: string | null;
  workspace_volume: string | null;
  user_id: string | null;
  branch_name: string | null;
  last_commit_sha: string | null;
  commit_count: Generated<number>;
  pr_number: number | null;
  pr_url: string | null;
  last_activity_at: string | null;
  suspension_reason: SuspensionReasonType | null;
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
 * GitHub App installation account type.
 */
export type GitHubAccountType = 'User' | 'Organization';

/**
 * GitHub App installations table - stores GitHub App installation records.
 * Access control is derived from these installations - no manual membership table.
 */
export interface GithubAppInstallationsTable {
  id: Generated<string>;
  installation_id: number;
  account_type: GitHubAccountType;
  account_login: string;
  account_id: number;
  permissions: Generated<string>;
  repository_selection: string;
  suspended_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Users table - authenticated users from GitHub OAuth.
 */
export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  avatar_url: string | null;
  github_id: number;
  github_login: string;
  github_access_token: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Claude configuration for a project (MCP servers, CLAUDE.md, auto-approve patterns).
 */
export interface ProjectClaudeConfigTable {
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

// Convenience types for GithubAppInstallations
export type GithubAppInstallation = Selectable<GithubAppInstallationsTable>;
export type NewGithubAppInstallation = Insertable<GithubAppInstallationsTable>;
export type GithubAppInstallationUpdate = Updateable<GithubAppInstallationsTable>;

// Convenience types for Users
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

// Convenience types for ProjectClaudeConfig
export type ProjectClaudeConfig = Selectable<ProjectClaudeConfigTable>;
export type NewProjectClaudeConfig = Insertable<ProjectClaudeConfigTable>;
export type ProjectClaudeConfigUpdate = Updateable<ProjectClaudeConfigTable>;

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

// ============================================================================
// Phase 4 tables - Production Readiness
// ============================================================================

/**
 * Alert condition types for monitoring.
 */
export type AlertConditionType =
  | 'pod_creation_failed'
  | 'tailscale_timeout'
  | 'database_failed'
  | 'orphaned_pod';

/**
 * Alert severity levels.
 */
export type AlertSeverityType = 'warning' | 'error' | 'critical';

/**
 * Alert event status types.
 */
export type AlertEventStatusType = 'pending' | 'delivered' | 'failed' | 'acknowledged';

/**
 * Alert rules table - configuration for alert conditions.
 */
export interface AlertRulesTable {
  id: Generated<string>;
  name: string;
  condition_type: AlertConditionType;
  threshold: number | null;
  severity: Generated<AlertSeverityType>;
  enabled: Generated<number>; // SQLite boolean: 1 = true, 0 = false
  destinations: Generated<string>; // JSON array of AlertDestination
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Alert events table - triggered alert instances.
 */
export interface AlertEventsTable {
  id: Generated<string>;
  rule_id: string;
  triggered_at: Generated<string>;
  context: Generated<string>; // JSON object with alert context
  status: Generated<AlertEventStatusType>;
  delivery_attempts: Generated<number>;
  last_delivery_at: string | null;
  delivered_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

/**
 * Idle config table - per-project idle timeout configuration.
 * Row with project_id = null is the global default.
 */
export interface IdleConfigTable {
  id: Generated<string>;
  project_id: string | null;
  idle_timeout_minutes: Generated<number>;
  warning_minutes: Generated<number>;
  enabled: Generated<number>; // SQLite boolean: 1 = true, 0 = false
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// Convenience types for AlertRules
export type AlertRule = Selectable<AlertRulesTable>;
export type NewAlertRule = Insertable<AlertRulesTable>;
export type AlertRuleUpdate = Updateable<AlertRulesTable>;

// Convenience types for AlertEvents
export type AlertEvent = Selectable<AlertEventsTable>;
export type NewAlertEvent = Insertable<AlertEventsTable>;
export type AlertEventUpdate = Updateable<AlertEventsTable>;

// Convenience types for IdleConfig
export type IdleConfig = Selectable<IdleConfigTable>;
export type NewIdleConfig = Insertable<IdleConfigTable>;
export type IdleConfigUpdate = Updateable<IdleConfigTable>;
