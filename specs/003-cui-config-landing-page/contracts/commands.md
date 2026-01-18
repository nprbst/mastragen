# API Contract: Project Commands & Skills

**Feature**: 003-cui-config-landing-page
**Base Path**: `/projects/:projectId/commands` and `/projects/:projectId/skills`
**Date**: 2026-01-18

## Overview

Endpoints for managing custom slash commands and skills for cui within a project.

## Authentication

All endpoints require authentication via JWT token.

## Authorization

- **Read**: Project member or admin
- **Write**: Project admin only

---

## Commands

### GET /projects/:projectId/commands

Lists all custom commands for a project.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Response** (200):
```json
{
  "commands": [
    {
      "id": "cmd_abc123",
      "name": "deploy",
      "description": "Deploy to staging environment",
      "createdAt": "2026-01-18T10:00:00Z",
      "updatedAt": "2026-01-18T10:00:00Z"
    },
    {
      "id": "cmd_def456",
      "name": "test-coverage",
      "description": "Run tests with coverage report",
      "createdAt": "2026-01-18T11:00:00Z",
      "updatedAt": "2026-01-18T11:00:00Z"
    }
  ]
}
```

---

### POST /projects/:projectId/commands

Creates a new custom command.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Request Body**:
```json
{
  "name": "deploy",
  "description": "Deploy to staging environment",
  "content": "# /deploy\n\nDeploy the current branch to staging.\n\n## Steps\n1. Run tests\n2. Build application\n3. Deploy to staging\n\n## Implementation\n```bash\nnpm run build && npm run deploy:staging\n```"
}
```

**Request Schema**:
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | Yes | 1-50 chars, alphanumeric + hyphens |
| description | string | No | Max 200 chars |
| content | string | Yes | Non-empty markdown |

**Response** (201):
```json
{
  "id": "cmd_abc123",
  "name": "deploy",
  "description": "Deploy to staging environment",
  "content": "# /deploy\n...",
  "createdAt": "2026-01-18T10:00:00Z",
  "updatedAt": "2026-01-18T10:00:00Z"
}
```

**Error Response** (409):
```json
{
  "error": "Command already exists",
  "message": "A command named 'deploy' already exists for this project"
}
```

---

### GET /projects/:projectId/commands/:commandId

Gets a specific command with full content.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |
| commandId | string | Command UUID |

**Response** (200):
```json
{
  "id": "cmd_abc123",
  "name": "deploy",
  "description": "Deploy to staging environment",
  "content": "# /deploy\n\nDeploy the current branch to staging...",
  "createdAt": "2026-01-18T10:00:00Z",
  "updatedAt": "2026-01-18T10:00:00Z"
}
```

---

### PUT /projects/:projectId/commands/:commandId

Updates an existing command.

**Request Body**:
```json
{
  "description": "Deploy to staging (updated)",
  "content": "# /deploy\n\nUpdated deployment instructions..."
}
```

**Response** (200): Updated command object

---

### DELETE /projects/:projectId/commands/:commandId

Deletes a command.

**Response** (200):
```json
{
  "message": "Command deleted successfully"
}
```

---

## Skills

### GET /projects/:projectId/skills

Lists all custom skills for a project.

**Response** (200):
```json
{
  "skills": [
    {
      "id": "skill_abc123",
      "name": "api-patterns",
      "description": "REST API design patterns for this project",
      "createdAt": "2026-01-18T10:00:00Z",
      "updatedAt": "2026-01-18T10:00:00Z"
    }
  ]
}
```

---

### POST /projects/:projectId/skills

Creates a new skill.

**Request Body**:
```json
{
  "name": "api-patterns",
  "description": "REST API design patterns for this project",
  "content": "# API Patterns\n\nThis project follows these REST API patterns:\n\n## Naming\n- Use plural nouns for resources\n- Use kebab-case for URLs\n\n## Response Format\n..."
}
```

**Request Schema**:
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | Yes | 1-100 chars, alphanumeric + hyphens + underscores |
| description | string | No | Max 500 chars |
| content | string | Yes | Non-empty markdown |

**Response** (201): Created skill object

---

### GET /projects/:projectId/skills/:skillId

Gets a specific skill with full content.

**Response** (200): Full skill object with content

---

### PUT /projects/:projectId/skills/:skillId

Updates an existing skill.

**Response** (200): Updated skill object

---

### DELETE /projects/:projectId/skills/:skillId

Deletes a skill.

**Response** (200):
```json
{
  "message": "Skill deleted successfully"
}
```

---

## Built-in Commands

The following commands are automatically included for all projects:

| Command | Description | API Endpoint |
|---------|-------------|--------------|
| /suspend | Commit, push, and terminate session | POST /sessions/:id/suspend |
| /pr | Create pull request from session | POST /sessions/:id/pr |
| /share | Grant user access to session | POST /sessions/:id/share |
| /extract | Extract code as Mastra artifact | (cui-only, no API) |
| /env | Display session environment info | GET /sessions/:id |

## Built-in Skills

The following skills are automatically included for all projects:

| Skill | Description |
|-------|-------------|
| mastra-development | Guidance on writing Mastra tools, agents, and workflows |
| artifact-extraction | Patterns for capturing code as reusable artifacts |
| session-management | Workflow guidance for checkpoints, PRs, collaboration |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| COMMAND_NOT_FOUND | 404 | Command does not exist |
| COMMAND_EXISTS | 409 | Command name already taken |
| COMMAND_INVALID_NAME | 400 | Invalid command name format |
| SKILL_NOT_FOUND | 404 | Skill does not exist |
| SKILL_EXISTS | 409 | Skill name already taken |
