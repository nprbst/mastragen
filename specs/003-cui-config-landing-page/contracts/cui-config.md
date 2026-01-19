# API Contract: cui Configuration

**Feature**: 003-cui-config-landing-page
**Base Path**: `/projects/:projectId/cui-config`
**Date**: 2026-01-18

## Overview

Endpoints for managing per-project cui configuration including MCP servers, CLAUDE.md context, and auto-approve patterns.

## Authentication

All endpoints require authentication via JWT token.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

## Authorization

- **Read**: Project member or admin
- **Write**: Project admin only

## Endpoints

### GET /projects/:projectId/cui-config

Returns the cui configuration for a project.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Response** (200):
```json
{
  "id": "config_abc123",
  "projectId": "project_xyz",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  "claudeMd": "# Project Context\n\nThis project uses...",
  "autoApprove": {
    "filePatterns": ["*.md", "*.json", "src/**/*.ts"],
    "mcpTools": ["read_file", "list_directory"],
    "bashCommands": ["npm test", "npm run build"]
  },
  "createdAt": "2026-01-18T10:00:00Z",
  "updatedAt": "2026-01-18T10:00:00Z"
}
```

**Error Response** (404):
```json
{
  "error": "Config not found",
  "message": "No cui config exists for project project_xyz"
}
```

---

### PUT /projects/:projectId/cui-config

Creates or updates the cui configuration for a project.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Request Body**:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  },
  "claudeMd": "# Project Context\n\n...",
  "autoApprove": {
    "filePatterns": ["*.md"],
    "mcpTools": ["read_file"],
    "bashCommands": ["npm test"]
  }
}
```

**Request Schema**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mcpServers | object | No | MCP server configurations |
| claudeMd | string | No | CLAUDE.md content |
| autoApprove | object | No | Auto-approve patterns |
| autoApprove.filePatterns | string[] | No | File glob patterns |
| autoApprove.mcpTools | string[] | No | MCP tool names |
| autoApprove.bashCommands | string[] | No | Bash command patterns |

**Response** (200):
```json
{
  "id": "config_abc123",
  "projectId": "project_xyz",
  "mcpServers": { ... },
  "claudeMd": "...",
  "autoApprove": { ... },
  "createdAt": "2026-01-18T10:00:00Z",
  "updatedAt": "2026-01-18T12:00:00Z"
}
```

**Error Response** (403):
```json
{
  "error": "Forbidden",
  "message": "Only project admins can modify cui config"
}
```

---

### DELETE /projects/:projectId/cui-config

Deletes the cui configuration for a project (resets to defaults).

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Response** (200):
```json
{
  "message": "cui config deleted successfully"
}
```

---

### GET /projects/:projectId/cui-config/preview

Returns a preview of the configuration files that will be injected.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | string | Project UUID |

**Response** (200):
```json
{
  "files": {
    "~/.claude/settings.json": {
      "mcpServers": { ... },
      "permissions": { ... }
    },
    "/workspace/CLAUDE.md": "# Project Context\n...",
    "~/.claude/commands/": ["suspend.md", "pr.md", "share.md", "env.md", "extract.md"]
  }
}
```

## MCP Server Configuration Schema

```json
{
  "serverName": {
    "command": "string (required)",
    "args": ["string array"],
    "env": {
      "KEY": "value or ${ENV_VAR}"
    }
  }
}
```

**Environment Variable Interpolation**:
- `${VAR_NAME}` in env values will be replaced with actual environment variable values at injection time
- Supports: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, and project-specific env vars

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| CONFIG_NOT_FOUND | 404 | No config exists for project |
| CONFIG_INVALID_MCP | 400 | Invalid MCP server configuration |
| CONFIG_INVALID_PATTERN | 400 | Invalid auto-approve pattern |
