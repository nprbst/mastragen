# API Reference

This document describes the Mastragen REST API endpoints.

## Base URL

```
https://mastragen-{env}.{tailnet}.ts.net/api
```

## Authentication

All API endpoints require authentication via Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://mastragen.example.ts.net/api/sessions
```

Obtain tokens via:
- **OAuth flow** - `/api/auth/login`
- **API tokens** - Create in dashboard settings

## Endpoints

### Health Check

#### GET /health

Check service health.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "tailscale": "connected"
}
```

---

### Projects

#### GET /api/projects

List all projects accessible to the user.

**Response:**
```json
{
  "projects": [
    {
      "id": "proj_abc123",
      "name": "My Project",
      "repo_url": "https://github.com/org/repo",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### GET /api/projects/:id

Get a specific project.

**Response:**
```json
{
  "id": "proj_abc123",
  "name": "My Project",
  "repo_url": "https://github.com/org/repo",
  "branch_prefix": "mg/",
  "environments": [
    {
      "name": "default",
      "env_vars": {"NODE_ENV": "development"}
    }
  ],
  "created_at": "2024-01-15T10:00:00Z"
}
```

#### POST /api/projects

Create a new project.

**Request:**
```json
{
  "name": "New Project",
  "repo_url": "https://github.com/org/repo",
  "branch_prefix": "mg/"
}
```

**Response:** `201 Created` with project object.

---

### Sessions

#### GET /api/sessions

List sessions for the current user.

**Query Parameters:**
- `state` - Filter by state: `active`, `suspended`, `all`
- `project_id` - Filter by project

**Response:**
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "project_id": "proj_xyz",
      "artifact_name": "feature-login",
      "state": "active",
      "created_at": "2024-01-15T10:00:00Z",
      "last_activity_at": "2024-01-15T12:30:00Z"
    }
  ]
}
```

#### GET /api/sessions/:id

Get a specific session.

**Response:**
```json
{
  "id": "sess_abc123",
  "project_id": "proj_xyz",
  "artifact_name": "feature-login",
  "state": "active",
  "branch_name": "mg/user/feature-login-abc123",
  "urls": {
    "vscode": "https://abc123-mastragen.example.ts.net/",
    "mastra": "https://abc123-mastragen.example.ts.net/mastra",
    "astro": "https://abc123-mastragen.example.ts.net/astro"
  },
  "shares": [
    {"user_id": "user_xyz", "username": "alice", "shared_at": "2024-01-15T11:00:00Z"}
  ],
  "created_at": "2024-01-15T10:00:00Z",
  "last_activity_at": "2024-01-15T12:30:00Z"
}
```

#### POST /api/sessions

Create a new session.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "artifact_name": "feature-login",
  "environment": "default"
}
```

**Response:** `201 Created` with session object.

#### POST /api/sessions/:id/suspend

Suspend an active session.

**Response:**
```json
{
  "id": "sess_abc123",
  "state": "suspended",
  "suspension_reason": "manual"
}
```

#### POST /api/sessions/:id/resume

Resume a suspended session.

**Response:**
```json
{
  "id": "sess_abc123",
  "state": "active",
  "urls": {...}
}
```

#### DELETE /api/sessions/:id

Delete a session.

**Response:** `204 No Content`

---

### Session Sharing

#### POST /api/sessions/:id/share

Share session with a user.

**Request:**
```json
{
  "username": "alice"
}
```

**Response:**
```json
{
  "share_id": "share_xyz",
  "user_id": "user_abc",
  "username": "alice",
  "shared_at": "2024-01-15T11:00:00Z"
}
```

#### DELETE /api/sessions/:id/share/:username

Revoke share from a user.

**Response:** `204 No Content`

---

### Session Activity

#### POST /api/sessions/:id/activity

Record user activity (for idle detection).

**Request:**
```json
{
  "type": "keystroke"
}
```

**Response:** `204 No Content`

#### GET /api/sessions/:id/idle-status

Get idle status for a session.

**Response:**
```json
{
  "idle": false,
  "last_activity_at": "2024-01-15T12:30:00Z",
  "timeout_at": "2024-01-15T13:00:00Z",
  "warning_issued": false
}
```

---

### Configuration

#### GET /api/config/idle

Get global idle configuration.

**Response:**
```json
{
  "timeout_minutes": 30,
  "warning_minutes": 5,
  "enabled": true
}
```

#### PATCH /api/config/idle

Update global idle configuration (admin only).

**Request:**
```json
{
  "timeout_minutes": 45
}
```

---

### Alerts

#### GET /api/alerts/rules

List alert rules.

**Response:**
```json
{
  "rules": [
    {
      "id": "rule_abc",
      "name": "Pod Creation Failed",
      "condition_type": "pod_creation_failed",
      "severity": "critical",
      "enabled": true
    }
  ]
}
```

#### POST /api/alerts/rules

Create an alert rule.

**Request:**
```json
{
  "name": "High Memory Usage",
  "condition_type": "high_memory",
  "severity": "warning",
  "threshold": 80,
  "notify_channels": ["webhook"],
  "webhook_url": "https://hooks.example.com/alert"
}
```

#### GET /api/alerts/events

List alert events.

**Query Parameters:**
- `severity` - Filter by severity
- `acknowledged` - Filter by acknowledgment status
- `since` - Events since timestamp

**Response:**
```json
{
  "events": [
    {
      "id": "event_xyz",
      "rule_id": "rule_abc",
      "severity": "critical",
      "message": "Pod creation failed for session sess_123",
      "acknowledged": false,
      "fired_at": "2024-01-15T12:00:00Z"
    }
  ]
}
```

#### POST /api/alerts/events/:id/acknowledge

Acknowledge an alert event.

**Response:**
```json
{
  "id": "event_xyz",
  "acknowledged": true,
  "acknowledged_at": "2024-01-15T12:05:00Z",
  "acknowledged_by": "user_abc"
}
```

---

### Metrics

#### GET /metrics

Prometheus metrics endpoint (no authentication required).

**Response:** Prometheus text format
```
# HELP mastragen_sessions_total Current number of sessions by state
# TYPE mastragen_sessions_total gauge
mastragen_sessions_total{project="proj_abc",state="active"} 5
mastragen_sessions_total{project="proj_abc",state="suspended"} 12
...
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Session not found",
    "details": {}
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

- API requests: 100 requests/minute per user
- Metrics endpoint: 10 requests/minute per IP

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705320000
```

---

## Webhooks

Configure webhooks to receive notifications:

### Session Events

```json
{
  "event": "session.created",
  "session": {
    "id": "sess_abc123",
    "project_id": "proj_xyz",
    "state": "active"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### Alert Events

```json
{
  "event": "alert.fired",
  "alert": {
    "id": "event_xyz",
    "rule_id": "rule_abc",
    "severity": "critical",
    "message": "Pod creation failed"
  },
  "timestamp": "2024-01-15T12:00:00Z"
}
```
