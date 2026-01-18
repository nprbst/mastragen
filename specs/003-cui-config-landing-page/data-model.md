# Data Model: cui Configuration & Landing Page (Phase 3)

**Feature**: 003-cui-config-landing-page
**Date**: 2026-01-18
**Extends**: [001-core-platform-foundation data model](../../specs/001-core-platform-foundation/data-model.md), [002-git-multi-project data model](../../specs/002-git-multi-project/data-model.md)

## Overview

Phase 3 extends the existing data model with:
1. **Users** table for GitHub-authenticated users
2. **GitHub App Installations** table for installation-derived access control
3. **Project cui Configuration** tables for MCP servers, commands, skills
4. **Session Shares** table for collaborative access

## Entity Relationship Diagram

```
┌─────────────────────────┐
│ github_app_installations │
└───────────┬─────────────┘
            │
            │ 1:N
            ▼
┌─────────────────────────┐     ┌─────────────┐
│       projects          │     │    users    │
└───────────┬─────────────┘     └──────┬──────┘
            │                          │
            │                          │
 ┌──────────┴──────────┐               │
 │                     │               │
 ▼                     ▼               ▼
┌──────────────────┐ ┌─────────────────┐ ┌─────────────┐
│project_cui_config│ │project_environments│ │  sessions   │
└──────────────────┘ └─────────────────┘ └──────┬──────┘
          │                                     │
 ┌────────┴────────┐                           │
 │                 │                           │
 ▼                 ▼                           ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐
│ project_commands │ │  project_skills  │ │session_shares│
└─────────────────┘ └─────────────────┘ └──────────────┘
```

**Access Control**: Users can access projects where:
1. The project's linked GitHub App installation includes the repository
2. The user has access to that repository (verified via GitHub API)

No manual membership management required - access is derived from GitHub.

## New Tables

### github_app_installations

Stores GitHub App installation records, synced via webhooks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID, unique installation record ID |
| installation_id | INTEGER | NOT NULL, UNIQUE | GitHub's installation ID (not our internal UUID `id`) |
| account_type | TEXT | NOT NULL | 'User' or 'Organization' |
| account_login | TEXT | NOT NULL | GitHub login/org name |
| account_id | INTEGER | NOT NULL | GitHub account ID |
| permissions | TEXT | NOT NULL, DEFAULT '{}' | JSON: granted permissions |
| repository_selection | TEXT | NOT NULL | 'all' or 'selected' |
| suspended_at | TEXT | | NULL if active, ISO 8601 if suspended |
| created_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |

**Indexes**:
- `github_app_installations_installation_id_idx` on (installation_id)
- `github_app_installations_account_idx` on (account_login)

### users

Stores authenticated user information from GitHub OAuth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID, unique user identifier |
| email | TEXT | NOT NULL, UNIQUE | User's email address |
| name | TEXT | | Display name |
| avatar_url | TEXT | | Profile picture URL |
| github_id | INTEGER | NOT NULL, UNIQUE | GitHub user ID |
| github_login | TEXT | NOT NULL | GitHub username |
| github_access_token | TEXT | | Encrypted OAuth access token |
| created_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |

**Indexes**:
- `users_email_idx` on (email)
- `users_github_id_idx` on (github_id)
- `users_github_login_idx` on (github_login)

### project_cui_config

Stores cui configuration for each project (MCP servers, CLAUDE.md, auto-approve patterns).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| project_id | TEXT | FK projects(id), NOT NULL, UNIQUE | One config per project |
| mcp_servers | TEXT | NOT NULL, DEFAULT '{}' | JSON: MCP server configurations |
| claude_md | TEXT | | CLAUDE.md content to inject |
| auto_approve_file_patterns | TEXT | NOT NULL, DEFAULT '[]' | JSON array of file patterns |
| auto_approve_mcp_tools | TEXT | NOT NULL, DEFAULT '[]' | JSON array of MCP tool names |
| auto_approve_bash_commands | TEXT | NOT NULL, DEFAULT '[]' | JSON array of bash commands |
| created_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |

**MCP Servers JSON Schema**:
```json
{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-name"],
    "env": { "API_KEY": "..." }
  }
}
```

### project_commands

Stores custom slash commands for each project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| project_id | TEXT | FK projects(id), NOT NULL | Project reference |
| name | TEXT | NOT NULL | Command name (without /) |
| description | TEXT | | Short description for help |
| content | TEXT | NOT NULL | Markdown content of command |
| created_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |

**Constraints**:
- UNIQUE (project_id, name)

**Indexes**:
- `project_commands_project_idx` on (project_id)

### project_skills

Stores custom skills (knowledge/instructions) for each project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| project_id | TEXT | FK projects(id), NOT NULL | Project reference |
| name | TEXT | NOT NULL | Skill name |
| description | TEXT | | Short description |
| content | TEXT | NOT NULL | Markdown content of skill |
| created_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT NOW | ISO 8601 timestamp |

**Constraints**:
- UNIQUE (project_id, name)

**Indexes**:
- `project_skills_project_idx` on (project_id)

### session_shares

Records session sharing for collaborative access.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| session_id | TEXT | FK sessions(id), NOT NULL | Session being shared |
| shared_by_user_id | TEXT | FK users(id), NOT NULL | User who shared |
| shared_with_user_id | TEXT | FK users(id), NOT NULL | User receiving access |
| granted_at | TEXT | NOT NULL, DEFAULT NOW | When share was granted |
| revoked_at | TEXT | | When share was revoked (NULL if active) |

**Constraints**:
- UNIQUE (session_id, shared_with_user_id) WHERE revoked_at IS NULL

**Indexes**:
- `session_shares_session_idx` on (session_id)
- `session_shares_shared_with_idx` on (shared_with_user_id)

## Extended Tables

### projects (extended from Phase 2)

Add column for GitHub App installation reference:

| New Column | Type | Constraints | Description |
|------------|------|-------------|-------------|
| installation_id | TEXT | FK github_app_installations(id) | GitHub App installation for this project |

**Access Control**: To access a project, a user must:
1. Have the project's installation in their accessible installations (`GET /user/installations`)
2. Have access to the project's github_repo in that installation

### sessions (extended from Phase 2)

Add columns for activity tracking:

| New Column | Type | Constraints | Description |
|------------|------|-------------|-------------|
| last_activity_at | TEXT | NOT NULL, DEFAULT NOW | Last session activity timestamp |

**Indexes** (new):
- `sessions_user_state_idx` on (user_id, state, updated_at)
- `sessions_activity_idx` on (state, last_activity_at)

## State Transitions

### Session States

```
                    ┌─────────────┐
                    │   active    │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────┐  ┌──────────────┐
    │  suspended   │ │ pr_open  │  │   closed     │
    └──────┬───────┘ └────┬─────┘  └──────────────┘
           │              │
           │              ▼
           │        ┌──────────┐
           └───────>│  merged  │
                    └────┬─────┘
                         │
                         ▼
                   ┌──────────┐
                   │ archived │
                   └──────────┘
```

**New States** (extending Phase 2):
- `merged`: PR was merged to main branch
- `archived`: Session cleaned up, branch may be deleted

**Transitions**:
- `active` → `suspended`: /suspend command
- `active` → `pr_open`: /pr command
- `suspended` → `active`: Resume action
- `pr_open` → `active`: Resume for additional work (branch still exists)
- `pr_open` → `merged`: PR merge detected (webhook or poll)
- `merged` → `archived`: Cleanup after retention period
- `suspended` → `archived`: Auto-cleanup after 90 days

## Validation Rules

### Users
- `email`: Must be valid email format
- `github_id`: Must be positive integer
- `github_login`: Must be valid GitHub username format

### Project Commands
- `name`: Alphanumeric + hyphens, 1-50 chars, cannot start with number
- `content`: Non-empty markdown

### Project Skills
- `name`: Alphanumeric + hyphens + underscores, 1-100 chars
- `content`: Non-empty markdown

### Session Shares
- Cannot share with self (shared_by != shared_with)
- Session must be in 'active' state to share

## Migration: 003_cui_config

```sql
-- GitHub App Installations table
CREATE TABLE IF NOT EXISTS github_app_installations (
  id TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL UNIQUE,
  account_type TEXT NOT NULL,
  account_login TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',
  repository_selection TEXT NOT NULL,
  suspended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS github_app_installations_installation_id_idx
  ON github_app_installations(installation_id);
CREATE INDEX IF NOT EXISTS github_app_installations_account_idx
  ON github_app_installations(account_login);

-- Users table (GitHub-only)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  github_access_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_github_id_idx ON users(github_id);
CREATE INDEX IF NOT EXISTS users_github_login_idx ON users(github_login);

-- Project cui config
CREATE TABLE IF NOT EXISTS project_cui_config (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  mcp_servers TEXT NOT NULL DEFAULT '{}',
  claude_md TEXT,
  auto_approve_file_patterns TEXT NOT NULL DEFAULT '[]',
  auto_approve_mcp_tools TEXT NOT NULL DEFAULT '[]',
  auto_approve_bash_commands TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Project commands
CREATE TABLE IF NOT EXISTS project_commands (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS project_commands_project_idx ON project_commands(project_id);

-- Project skills
CREATE TABLE IF NOT EXISTS project_skills (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS project_skills_project_idx ON project_skills(project_id);

-- Session shares
CREATE TABLE IF NOT EXISTS session_shares (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  shared_by_user_id TEXT NOT NULL REFERENCES users(id),
  shared_with_user_id TEXT NOT NULL REFERENCES users(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS session_shares_session_idx ON session_shares(session_id);
CREATE INDEX IF NOT EXISTS session_shares_shared_with_idx ON session_shares(shared_with_user_id);

-- Extend projects table with installation reference
ALTER TABLE projects ADD COLUMN installation_id TEXT REFERENCES github_app_installations(id);

-- Extend sessions table
ALTER TABLE sessions ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT (datetime('now'));

CREATE INDEX IF NOT EXISTS sessions_user_state_idx ON sessions(user_id, state, updated_at);
CREATE INDEX IF NOT EXISTS sessions_activity_idx ON sessions(state, last_activity_at);
```
