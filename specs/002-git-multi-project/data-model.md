# Data Model: Git & Multi-Project Support

**Feature Branch**: `002-git-multi-project`
**Created**: 2026-01-17
**Source**: [spec.md](./spec.md)

## Entity Overview

This feature extends the existing Session entity with git persistence fields and defines the state machine for session lifecycle including PR states.

## Entities

### Session (Extended)

The Session entity is extended to track git branch state and PR association.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | string | PK, 6-char hex | Unique session identifier |
| `project_id` | string | FK → projects.id | Associated project |
| `user_id` | string | required | User identifier for branch naming |
| `artifact_name` | string | required, 1-50 chars | User-defined session name |
| `environment` | string | required | Environment name (dev, staging, prod) |
| `state` | enum | required | Session state (see State Machine) |
| `container_id` | string | nullable | Docker container ID when active |
| `workspace_volume` | string | required | Docker volume name |
| `cui_auth_token` | string | nullable | Authentication token for cui |
| `branch_name` | string | required | Git branch name `{prefix}{userId}/{artifactName}-{sessionId}` |
| `last_commit_sha` | string | nullable | Most recent commit SHA (40-char hex) |
| `commit_count` | integer | default: 0 | Total commits on session branch |
| `pr_number` | integer | nullable | GitHub PR number |
| `pr_url` | string | nullable | GitHub PR URL |
| `created_at` | datetime | auto | Session creation timestamp |
| `updated_at` | datetime | auto | Last modification timestamp |

**Indexes**:
- `sessions(project_id)` - Filter sessions by project
- `sessions(state)` - Filter sessions by state
- `sessions(user_id)` - Filter sessions by user

**Unique Constraints**:
- `(project_id, artifact_name)` - One session per artifact name per project

### Session State Machine

```text
                    ┌─────────┐
             ┌──────│  active │◄────────────┐
             │      └────┬────┘             │
             │           │                  │
        createPR()  suspend()          resume()
             │           │                  │
             │           ▼                  │
             │      ┌─────────┐             │
             │      │suspended│─────────────┤
             │      └────┬────┘             │
             │           │                  │
             │     createPR()          resume()
             │           │                  │
             ▼           ▼                  │
            ┌─────────────┐                 │
            │   pr_open   │─────────────────┘
            └──────┬──────┘
                   │
             merge() or
              close()
                   │
                   ▼
              ┌────────┐
              │ closed │
              └────────┘
```

**States**:

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `active` | Session running with container | → `suspended`, → `pr_open` |
| `suspended` | Session saved, no container | → `active`, → `pr_open` |
| `pr_open` | PR created for session | → `active`, → `closed` |
| `closed` | PR merged or session archived | terminal |

**Transition Rules**:
- `active` → `suspended`: Suspend commits changes, pushes branch, stops container
- `active` → `pr_open`: CreatePR commits changes, pushes branch, creates GitHub PR, stops container
- `suspended` → `active`: Resume clones branch, starts container
- `suspended` → `pr_open`: CreatePR creates GitHub PR, updates session
- `pr_open` → `active`: Resume allows continued work on PR branch
- `pr_open` → `closed`: PR merged via GitHub webhook (out of scope for Phase 2)

### Project (Reference)

Projects are configured in Phase 1 and referenced by sessions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique project identifier |
| `name` | string | Human-readable project name |
| `github_repo` | string | GitHub repository (`owner/repo` format) |
| `default_branch` | string | Target branch for PRs (default: `main`) |
| `branch_prefix` | string | Session branch prefix (default: `mg/`) |
| `mastra_path` | string | Path to Mastra service (default: `.`) |
| `ui_sandbox_path` | string | Path to Astro sandbox (nullable) |
| `ui_sandbox_template` | string | Template for empty UI sandbox (nullable) |

**Branch Naming Convention**:
```
{project.branch_prefix}{session.user_id}/{session.artifact_name}-{session.id}
```

Example: `mg/user123/billing-feature-a1b2c3`

## Validation Rules

### Branch Name
- Format: `^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+-[a-f0-9]{6}$`
- Max length: 250 characters (Git limit)
- Must be unique within repository

### Commit SHA
- Format: `^[a-f0-9]{40}$`
- 40-character lowercase hex string

### User ID
- Format: alphanumeric with underscores and hyphens
- Max length: 50 characters

## Database Migration

New columns added to `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL;
ALTER TABLE sessions ADD COLUMN branch_name TEXT NOT NULL;
ALTER TABLE sessions ADD COLUMN last_commit_sha TEXT;
ALTER TABLE sessions ADD COLUMN commit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN pr_number INTEGER;
ALTER TABLE sessions ADD COLUMN pr_url TEXT;

-- Extend state constraint
-- Check constraint updated to include: 'active', 'suspended', 'pr_open', 'closed'
```

## Relationships

```text
┌──────────────┐       ┌──────────────┐
│   Project    │───────│   Session    │
│              │ 1   * │              │
│ githubRepo   │       │ branchName   │
│ defaultBranch│       │ lastCommitSha│
│ branchPrefix │       │ prNumber     │
└──────────────┘       └──────────────┘
```

## Data Lifecycle

1. **Session Created**: Branch name generated, branch created on GitHub
2. **Work In Progress**: Container running, files modified in workspace
3. **Session Suspended**: Changes committed to branch, pushed to remote
4. **Session Resumed**: Branch cloned/checked out, container restarted
5. **PR Created**: GitHub PR opened, session state updated
6. **Work Post-PR**: Session resumed, additional commits pushed
7. **PR Merged**: Session marked closed (via webhook, Phase 4)
