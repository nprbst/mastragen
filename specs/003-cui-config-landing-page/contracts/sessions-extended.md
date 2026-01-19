# API Contract: Sessions (Extended for Phase 3)

**Feature**: 003-cui-config-landing-page
**Base Path**: `/sessions`
**Date**: 2026-01-18

## Overview

Extended session endpoints for Phase 3 functionality including sharing, PR creation, and dashboard queries.

## Authentication

All endpoints require authentication via JWT token.

---

## Dashboard Queries

### GET /sessions

Extended to support dashboard filtering and pagination.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| state | string | - | Filter by state (active, suspended, pr_open, merged, archived) |
| projectId | string | - | Filter by project |
| userId | string | - | Filter by owner user ID |
| sharedWithMe | boolean | false | Include sessions shared with current user |
| limit | number | 20 | Max results per page |
| offset | number | 0 | Pagination offset |
| sortBy | string | updatedAt | Sort field (updatedAt, createdAt, lastActivityAt) |
| sortOrder | string | desc | Sort order (asc, desc) |

**Response** (200):
```json
{
  "sessions": [
    {
      "id": "session_abc123",
      "projectId": "project_xyz",
      "projectName": "my-mastra-app",
      "artifactName": "new-feature",
      "environment": "staging",
      "state": "active",
      "userId": "user_123",
      "userName": "John Doe",
      "branchName": "mg/john/new-feature-abc123",
      "lastCommitSha": "a1b2c3d4",
      "commitCount": 5,
      "prNumber": null,
      "prUrl": null,
      "urls": {
        "cui": "http://session-abc123.tailnet:3001",
        "mastra": "http://session-abc123.tailnet:4111",
        "astro": "http://session-abc123.tailnet:4321",
        "vscode": "http://session-abc123.tailnet:8080"
      },
      "lastActivityAt": "2026-01-18T14:30:00Z",
      "createdAt": "2026-01-18T10:00:00Z",
      "updatedAt": "2026-01-18T14:30:00Z"
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

**Shared Sessions Response** (when sharedWithMe=true):
Includes additional field:
```json
{
  "sharedBy": {
    "id": "user_456",
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "sharedAt": "2026-01-18T12:00:00Z"
}
```

---

## Session Sharing

### POST /sessions/:sessionId/share

Grants another user access to the session.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | Session UUID |

**Request Body**:
```json
{
  "userEmail": "colleague@example.com"
}
```

**Request Schema**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userEmail | string | Yes | Email of user to share with |

**Response** (200):
```json
{
  "share": {
    "id": "share_abc123",
    "sessionId": "session_xyz",
    "sharedWithUser": {
      "id": "user_456",
      "name": "Jane Smith",
      "email": "jane@example.com"
    },
    "grantedAt": "2026-01-18T12:00:00Z"
  },
  "message": "Session shared successfully. Jane Smith can now access the sandbox."
}
```

**Error Response** (400):
```json
{
  "error": "Cannot share with self",
  "message": "You cannot share a session with yourself"
}
```

**Error Response** (404):
```json
{
  "error": "User not found",
  "message": "No user found with email colleague@example.com"
}
```

---

### DELETE /sessions/:sessionId/share/:shareId

Revokes a user's access to the session.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | Session UUID |
| shareId | string | Share record UUID |

**Response** (200):
```json
{
  "message": "Share revoked successfully"
}
```

---

### GET /sessions/:sessionId/shares

Lists all shares for a session.

**Response** (200):
```json
{
  "shares": [
    {
      "id": "share_abc123",
      "sharedWithUser": {
        "id": "user_456",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "grantedAt": "2026-01-18T12:00:00Z",
      "revokedAt": null
    }
  ]
}
```

---

## Pull Request Creation

### POST /sessions/:sessionId/pr

Creates a pull request from the session branch.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | Session UUID |

**Request Body**:
```json
{
  "title": "Add new authentication feature",
  "description": "## Summary\n\nThis PR adds OAuth2 authentication...\n\n## Changes\n- Added auth middleware\n- Created login page"
}
```

**Request Schema**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | No | PR title (default: "[{artifactName}] Session work") |
| description | string | No | PR body/description |

**Response** (201):
```json
{
  "session": {
    "id": "session_abc123",
    "state": "pr_open",
    "prNumber": 42,
    "prUrl": "https://github.com/org/repo/pull/42"
  },
  "pr": {
    "number": 42,
    "url": "https://github.com/org/repo/pull/42",
    "title": "Add new authentication feature",
    "state": "open"
  }
}
```

**Error Response** (409):
```json
{
  "error": "PR already exists",
  "message": "Session already has PR #42",
  "prNumber": 42,
  "prUrl": "https://github.com/org/repo/pull/42"
}
```

**Error Response** (400):
```json
{
  "error": "No commits",
  "message": "Session has no commits to create PR from"
}
```

---

## Session State Extensions

### GET /sessions/:sessionId

Extended response with full details.

**Response** (200):
```json
{
  "id": "session_abc123",
  "projectId": "project_xyz",
  "project": {
    "id": "project_xyz",
    "name": "my-mastra-app",
    "githubRepo": "org/my-mastra-app"
  },
  "artifactName": "new-feature",
  "environment": "staging",
  "state": "active",
  "userId": "user_123",
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "branchName": "mg/john/new-feature-abc123",
  "lastCommitSha": "a1b2c3d4",
  "commitCount": 5,
  "prNumber": null,
  "prUrl": null,
  "urls": {
    "cui": "http://session-abc123.tailnet:3001#token=...",
    "mastra": "http://session-abc123.tailnet:4111",
    "astro": "http://session-abc123.tailnet:4321",
    "vscode": "http://session-abc123.tailnet:8080"
  },
  "shares": [
    {
      "id": "share_abc123",
      "sharedWithUser": {
        "id": "user_456",
        "name": "Jane Smith"
      },
      "grantedAt": "2026-01-18T12:00:00Z"
    }
  ],
  "lastActivityAt": "2026-01-18T14:30:00Z",
  "createdAt": "2026-01-18T10:00:00Z",
  "updatedAt": "2026-01-18T14:30:00Z"
}
```

---

## Session Activity

### POST /sessions/:sessionId/activity

Records session activity (called by commands to update lastActivityAt).

**Request Body**:
```json
{
  "action": "command_executed",
  "details": {
    "command": "env"
  }
}
```

**Response** (200):
```json
{
  "lastActivityAt": "2026-01-18T14:30:00Z"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| SESSION_NOT_FOUND | 404 | Session does not exist |
| SESSION_NOT_ACTIVE | 400 | Session is not in active state |
| SESSION_NO_COMMITS | 400 | Session has no commits for PR |
| PR_ALREADY_EXISTS | 409 | Session already has a PR |
| SHARE_NOT_FOUND | 404 | Share record not found |
| SHARE_SELF_DENIED | 400 | Cannot share with self |
| USER_NOT_FOUND | 404 | User email not found |
