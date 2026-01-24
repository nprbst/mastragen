# API Contract: Session Activity

## Record Activity

**Endpoint**: `POST /api/sessions/:id/activity`
**Authentication**: Required (session token or user token)

Records session activity to reset the idle timer.

### Request

```json
{
  "activityType": "claude_interaction",
  "metadata": {
    "messageCount": 5
  }
}
```

### Activity Types

| Type | Description | Triggered By |
|------|-------------|--------------|
| `file_change` | File modified in workspace | Git service detection |
| `claude_interaction` | Claude message sent/received | CUI service |
| `service_access` | Service endpoint accessed | Any sandbox service |
| `terminal_activity` | Terminal command executed | VS Code service |
| `manual_ping` | Explicit keepalive from client | Web UI |

### Response (200 OK)

```json
{
  "sessionId": "session-abc",
  "lastActivityAt": "2026-01-21T15:30:00Z",
  "idleTimeoutAt": "2026-01-21T16:00:00Z",
  "warningAt": "2026-01-21T15:55:00Z"
}
```

### Response (404 Not Found)

```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

### Response (409 Conflict)

```json
{
  "error": "Session is not active",
  "code": "SESSION_NOT_ACTIVE",
  "sessionState": "suspended"
}
```

---

## Get Session Idle Status

**Endpoint**: `GET /api/sessions/:id/idle-status`
**Authentication**: Required

Returns current idle status for a session.

### Response (200 OK)

```json
{
  "sessionId": "session-abc",
  "state": "active",
  "lastActivityAt": "2026-01-21T15:30:00Z",
  "idleTimeoutMinutes": 30,
  "warningMinutes": 5,
  "idleTimeoutAt": "2026-01-21T16:00:00Z",
  "warningAt": "2026-01-21T15:55:00Z",
  "minutesUntilWarning": 12,
  "minutesUntilSuspend": 17,
  "warningIssued": false
}
```

When warning has been issued:

```json
{
  "sessionId": "session-abc",
  "state": "active",
  "lastActivityAt": "2026-01-21T15:30:00Z",
  "idleTimeoutMinutes": 30,
  "warningMinutes": 5,
  "idleTimeoutAt": "2026-01-21T16:00:00Z",
  "warningAt": "2026-01-21T15:55:00Z",
  "minutesUntilWarning": -3,
  "minutesUntilSuspend": 2,
  "warningIssued": true,
  "warningIssuedAt": "2026-01-21T15:55:00Z"
}
```

---

## Validation Schemas (Valibot)

```typescript
import * as v from 'valibot';

const RecordActivitySchema = v.object({
  activityType: v.picklist([
    'file_change',
    'claude_interaction',
    'service_access',
    'terminal_activity',
    'manual_ping',
  ]),
  metadata: v.optional(v.record(v.string(), v.unknown())),
});
```

---

## Notes

- Activity recording is idempotent; multiple calls within a short window are deduplicated
- Sandbox services should call this endpoint periodically (recommended: every 5 minutes when user is active)
- The idle timer resets to `now + idleTimeoutMinutes` on each activity
- Warning notifications are sent via the session's notification channel (WebSocket or polling)
