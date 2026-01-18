# Data Model: Phase 1 Core Platform Foundation

**Created**: 2026-01-17
**Database**: SQLite (via Kysely)

## Entity Relationship Diagram

```
┌─────────────────────┐
│      projects       │
├─────────────────────┤
│ id (PK)             │
│ name (UNIQUE)       │
│ github_repo         │
│ default_branch      │
│ branch_prefix       │
│ mastra_path         │
│ ui_sandbox_path     │
│ created_at          │
│ updated_at          │
└─────────┬───────────┘
          │
          │ 1:N
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│project_environments │      │      sessions       │
├─────────────────────┤      ├─────────────────────┤
│ id (PK)             │      │ id (PK)             │
│ project_id (FK)     │◄────►│ project_id (FK)     │
│ name                │      │ artifact_name       │
│ env_vars (JSON)     │      │ environment         │
│ created_at          │      │ state               │
└─────────────────────┘      │ container_id        │
          ▲                  │ workspace_volume    │
          │                  │ created_at          │
          │ references       │ updated_at          │
          └──────────────────┴─────────────────────┘
```

## Tables

### projects

Represents a Mastra codebase configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY, DEFAULT nanoid(6) | Unique identifier |
| name | TEXT | NOT NULL, UNIQUE | Human-readable project name |
| github_repo | TEXT | NOT NULL | Repository in "org/repo" format |
| default_branch | TEXT | NOT NULL, DEFAULT 'main' | Base branch for new sessions |
| branch_prefix | TEXT | NOT NULL, DEFAULT 'mg/' | Prefix for session branches |
| mastra_path | TEXT | NOT NULL, DEFAULT '.' | Path to Mastra code within repo |
| ui_sandbox_path | TEXT | NULLABLE | Path to UI sandbox (null disables Astro) |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last update timestamp |

### project_environments

Environment-specific configuration for a project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY, DEFAULT nanoid(6) | Unique identifier |
| project_id | TEXT | NOT NULL, FK -> projects.id | Parent project |
| name | TEXT | NOT NULL | Environment name (e.g., "dev", "staging") |
| env_vars | TEXT | NOT NULL, DEFAULT '{}' | JSON object of environment variables |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |

**Constraints**: UNIQUE(project_id, name)

### sessions

Active or suspended development session.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY, DEFAULT nanoid(6) | Unique identifier |
| project_id | TEXT | NOT NULL, FK -> projects.id | Parent project |
| artifact_name | TEXT | NOT NULL | User-provided session name |
| environment | TEXT | NOT NULL | References project_environments.name |
| state | TEXT | NOT NULL, DEFAULT 'active' | Session state |
| container_id | TEXT | NULLABLE | Docker container ID when active |
| workspace_volume | TEXT | NULLABLE | Docker volume name |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last update timestamp |

**Constraints**:
- UNIQUE(project_id, artifact_name)
- CHECK(state IN ('active', 'suspended'))

**Indexes**:
- idx_sessions_project_id ON sessions(project_id)
- idx_sessions_state ON sessions(state)

## Kysely Types

```typescript
import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  projects: ProjectsTable;
  project_environments: ProjectEnvironmentsTable;
  sessions: SessionsTable;
}

export interface ProjectsTable {
  id: Generated<string>;
  name: string;
  github_repo: string;
  default_branch: string;
  branch_prefix: string;
  mastra_path: string;
  ui_sandbox_path: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ProjectEnvironmentsTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  env_vars: string;
  created_at: Generated<string>;
}

export interface SessionsTable {
  id: Generated<string>;
  project_id: string;
  artifact_name: string;
  environment: string;
  state: 'active' | 'suspended';
  container_id: string | null;
  workspace_volume: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// Convenience types
export type Project = Selectable<ProjectsTable>;
export type NewProject = Insertable<ProjectsTable>;
export type ProjectUpdate = Updateable<ProjectsTable>;

export type ProjectEnvironment = Selectable<ProjectEnvironmentsTable>;
export type NewProjectEnvironment = Insertable<ProjectEnvironmentsTable>;

export type Session = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;
```

## State Transitions

### Session States

```
┌──────────┐     suspend     ┌───────────┐
│  active  │ ─────────────► │ suspended │
└──────────┘                 └───────────┘
     ▲                             │
     │           resume            │
     └─────────────────────────────┘
```

**State Invariants**:
- `active`: container_id and workspace_volume are set
- `suspended`: container_id is null, workspace_volume is preserved

## Validation Rules

### Projects
- `name`: 1-50 characters, alphanumeric with hyphens
- `github_repo`: Must match pattern "owner/repo"
- `branch_prefix`: Must end with "/" if not empty
- `mastra_path`: Valid relative path (no leading slash)

### Sessions
- `artifact_name`: 1-50 characters, alphanumeric with hyphens
- `environment`: Must exist in project's environments
- Unique constraint: One session per (project_id, artifact_name)
