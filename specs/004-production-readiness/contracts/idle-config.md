# API Contract: Idle Configuration

## Get Global Idle Config

**Endpoint**: `GET /api/config/idle`
**Authentication**: Required (admin only)

### Response (200 OK)

```json
{
  "global": {
    "idleTimeoutMinutes": 30,
    "warningMinutes": 5,
    "enabled": true
  },
  "projects": [
    {
      "projectId": "project-1",
      "projectName": "mastragen-core",
      "idleTimeoutMinutes": 60,
      "warningMinutes": 10,
      "enabled": true
    }
  ]
}
```

---

## Update Global Idle Config

**Endpoint**: `PATCH /api/config/idle`
**Authentication**: Required (admin only)

### Request

```json
{
  "idleTimeoutMinutes": 45,
  "warningMinutes": 5,
  "enabled": true
}
```

### Response (200 OK)

```json
{
  "idleTimeoutMinutes": 45,
  "warningMinutes": 5,
  "enabled": true,
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

### Response (400 Bad Request)

```json
{
  "error": "Warning minutes must be less than idle timeout",
  "code": "INVALID_IDLE_CONFIG"
}
```

---

## Get Project Idle Config

**Endpoint**: `GET /api/projects/:projectId/idle-config`
**Authentication**: Required

### Response (200 OK)

Returns project-specific config if set, otherwise indicates global applies.

```json
{
  "projectId": "project-1",
  "hasCustomConfig": true,
  "config": {
    "idleTimeoutMinutes": 60,
    "warningMinutes": 10,
    "enabled": true
  },
  "effectiveConfig": {
    "idleTimeoutMinutes": 60,
    "warningMinutes": 10,
    "enabled": true,
    "source": "project"
  }
}
```

When no custom config:

```json
{
  "projectId": "project-2",
  "hasCustomConfig": false,
  "config": null,
  "effectiveConfig": {
    "idleTimeoutMinutes": 30,
    "warningMinutes": 5,
    "enabled": true,
    "source": "global"
  }
}
```

---

## Set Project Idle Config

**Endpoint**: `PUT /api/projects/:projectId/idle-config`
**Authentication**: Required (admin only)

### Request

```json
{
  "idleTimeoutMinutes": 120,
  "warningMinutes": 15,
  "enabled": true
}
```

### Response (200 OK)

```json
{
  "projectId": "project-1",
  "idleTimeoutMinutes": 120,
  "warningMinutes": 15,
  "enabled": true,
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

---

## Delete Project Idle Config

**Endpoint**: `DELETE /api/projects/:projectId/idle-config`
**Authentication**: Required (admin only)

Removes project-specific config, reverting to global defaults.

### Response (204 No Content)

No body.

---

## Validation Schemas (Valibot)

```typescript
import * as v from 'valibot';

const IdleConfigSchema = v.pipe(
  v.object({
    idleTimeoutMinutes: v.pipe(
      v.number(),
      v.minValue(5),
      v.maxValue(480)
    ),
    warningMinutes: v.pipe(
      v.number(),
      v.minValue(1)
    ),
    enabled: v.boolean(),
  }),
  v.transform((data) => {
    if (data.warningMinutes >= data.idleTimeoutMinutes) {
      throw new Error('Warning minutes must be less than idle timeout');
    }
    return data;
  })
);
```

---

## Notes

- Global config applies to all projects without custom configuration
- Project-specific configs completely override global (not merged)
- Changes take effect on next idle check cycle (within 5 minutes)
- Existing sessions use the config active at their last activity time
