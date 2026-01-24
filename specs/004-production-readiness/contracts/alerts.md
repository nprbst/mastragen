# API Contract: Alerts

## Alert Rules

### List Alert Rules

**Endpoint**: `GET /api/alerts/rules`
**Authentication**: Required (admin only)

#### Response (200 OK)

```json
{
  "rules": [
    {
      "id": "cuid123",
      "name": "Pod Creation Failure",
      "conditionType": "pod_creation_failed",
      "threshold": null,
      "severity": "error",
      "enabled": true,
      "destinations": [
        {
          "type": "webhook",
          "url": "https://hooks.slack.com/services/xxx"
        }
      ],
      "createdAt": "2026-01-21T10:00:00Z",
      "updatedAt": "2026-01-21T10:00:00Z"
    }
  ]
}
```

---

### Get Alert Rule

**Endpoint**: `GET /api/alerts/rules/:id`
**Authentication**: Required (admin only)

#### Response (200 OK)

```json
{
  "id": "cuid123",
  "name": "Pod Creation Failure",
  "conditionType": "pod_creation_failed",
  "threshold": null,
  "severity": "error",
  "enabled": true,
  "destinations": [
    {
      "type": "webhook",
      "url": "https://hooks.slack.com/services/xxx"
    }
  ],
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

#### Response (404 Not Found)

```json
{
  "error": "Alert rule not found",
  "code": "ALERT_RULE_NOT_FOUND"
}
```

---

### Create Alert Rule

**Endpoint**: `POST /api/alerts/rules`
**Authentication**: Required (admin only)

#### Request

```json
{
  "name": "Custom Alert",
  "conditionType": "pod_creation_failed",
  "threshold": null,
  "severity": "error",
  "enabled": true,
  "destinations": [
    {
      "type": "webhook",
      "url": "https://hooks.slack.com/services/xxx",
      "headers": {
        "X-Custom-Header": "value"
      }
    },
    {
      "type": "email",
      "email": "ops@example.com"
    }
  ]
}
```

#### Response (201 Created)

```json
{
  "id": "cuid456",
  "name": "Custom Alert",
  "conditionType": "pod_creation_failed",
  "threshold": null,
  "severity": "error",
  "enabled": true,
  "destinations": [...],
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

#### Response (400 Bad Request)

```json
{
  "error": "Invalid condition type",
  "code": "INVALID_CONDITION_TYPE",
  "validTypes": ["pod_creation_failed", "tailscale_timeout", "database_failed", "orphaned_pod"]
}
```

---

### Update Alert Rule

**Endpoint**: `PATCH /api/alerts/rules/:id`
**Authentication**: Required (admin only)

#### Request

```json
{
  "enabled": false,
  "destinations": [
    {
      "type": "email",
      "email": "new-ops@example.com"
    }
  ]
}
```

#### Response (200 OK)

Returns updated rule (same schema as GET).

---

### Delete Alert Rule

**Endpoint**: `DELETE /api/alerts/rules/:id`
**Authentication**: Required (admin only)

#### Response (204 No Content)

No body.

---

## Alert Events

### List Alert Events

**Endpoint**: `GET /api/alerts/events`
**Authentication**: Required (admin only)

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status: pending, delivered, failed, acknowledged |
| `ruleId` | string | - | Filter by rule ID |
| `since` | ISO date | - | Events triggered after this time |
| `limit` | number | 50 | Max results (max 100) |

#### Response (200 OK)

```json
{
  "events": [
    {
      "id": "cuid789",
      "ruleId": "cuid123",
      "ruleName": "Pod Creation Failure",
      "triggeredAt": "2026-01-21T15:30:00Z",
      "context": {
        "sessionId": "session-abc",
        "projectId": "project-1",
        "error": "Docker API timeout"
      },
      "status": "delivered",
      "deliveryAttempts": 1,
      "deliveredAt": "2026-01-21T15:30:05Z",
      "acknowledgedAt": null,
      "acknowledgedBy": null
    }
  ],
  "total": 42
}
```

---

### Get Alert Event

**Endpoint**: `GET /api/alerts/events/:id`
**Authentication**: Required (admin only)

#### Response (200 OK)

Same schema as list item.

---

### Acknowledge Alert Event

**Endpoint**: `POST /api/alerts/events/:id/acknowledge`
**Authentication**: Required (admin only)

#### Request

```json
{
  "note": "Investigating root cause"
}
```

#### Response (200 OK)

```json
{
  "id": "cuid789",
  "status": "acknowledged",
  "acknowledgedAt": "2026-01-21T16:00:00Z",
  "acknowledgedBy": "user-123"
}
```

---

## Webhook Payload

When an alert is delivered via webhook, the payload format is:

```json
{
  "alertId": "cuid789",
  "ruleName": "Pod Creation Failure",
  "severity": "error",
  "triggeredAt": "2026-01-21T15:30:00Z",
  "context": {
    "sessionId": "session-abc",
    "projectId": "project-1",
    "error": "Docker API timeout"
  },
  "dashboardUrl": "https://mastragen.example.com/admin/alerts/cuid789"
}
```

## Validation Schemas (Valibot)

```typescript
import * as v from 'valibot';

const AlertDestination = v.union([
  v.object({
    type: v.literal('webhook'),
    url: v.pipe(v.string(), v.url()),
    headers: v.optional(v.record(v.string(), v.string())),
  }),
  v.object({
    type: v.literal('email'),
    email: v.pipe(v.string(), v.email()),
  }),
]);

const CreateAlertRuleSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  conditionType: v.picklist([
    'pod_creation_failed',
    'tailscale_timeout',
    'database_failed',
    'orphaned_pod',
  ]),
  threshold: v.optional(v.nullable(v.number())),
  severity: v.picklist(['warning', 'error', 'critical']),
  enabled: v.optional(v.boolean(), true),
  destinations: v.array(AlertDestination),
});

const UpdateAlertRuleSchema = v.partial(CreateAlertRuleSchema);
```
