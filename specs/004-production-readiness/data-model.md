# Data Model: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Created**: 2026-01-21
**Status**: Complete

## Overview

Data model changes for Phase 4: idle auto-suspend tracking, alerting system, and monitoring metadata.

---

## Existing Entities (Modified)

### sessions

**Existing fields used**:
- `last_activity_at` (timestamp) - Already exists for idle detection
- `state` (enum) - Already supports: active, suspended, pr_open, merged, archived, closed

**New field**:

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `suspension_reason` | TEXT | Yes | null | Reason for suspension: 'manual', 'auto', 'share_revoke' |

**Migration**: Add nullable column, no default needed (existing suspended sessions = 'manual')

### session_shares

**Existing entity** - No changes required. Already has:
- `id`, `session_id`, `shared_by_user_id`, `shared_with_user_id`
- `granted_at`, `revoked_at`

---

## New Entities

### alert_rules

Configuration for alert conditions.

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | (generated) | Primary key (CUID2) |
| `name` | TEXT | No | - | Human-readable rule name |
| `condition_type` | TEXT | No | - | Alert type: 'pod_creation_failed', 'tailscale_timeout', 'database_failed', 'orphaned_pod' |
| `threshold` | INTEGER | Yes | null | Numeric threshold (e.g., 60 for timeout seconds) |
| `severity` | TEXT | No | 'warning' | 'warning', 'error', 'critical' |
| `enabled` | INTEGER | No | 1 | Boolean: 1=enabled, 0=disabled |
| `destinations` | TEXT | No | '[]' | JSON array of destination configs |
| `created_at` | TEXT | No | (now) | ISO 8601 timestamp |
| `updated_at` | TEXT | No | (now) | ISO 8601 timestamp |

**Indexes**:
- `idx_alert_rules_condition_type` on `condition_type`
- `idx_alert_rules_enabled` on `enabled`

**Destination config schema** (stored in `destinations` JSON):
```typescript
type AlertDestination = {
  type: 'webhook' | 'email';
  url?: string;      // For webhook
  email?: string;    // For email
  headers?: Record<string, string>;  // Optional webhook headers
};
```

### alert_events

Triggered alert instances.

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | (generated) | Primary key (CUID2) |
| `rule_id` | TEXT | No | - | FK to alert_rules.id |
| `triggered_at` | TEXT | No | (now) | ISO 8601 timestamp |
| `context` | TEXT | No | '{}' | JSON context: session_id, project, error, etc. |
| `status` | TEXT | No | 'pending' | 'pending', 'delivered', 'failed', 'acknowledged' |
| `delivery_attempts` | INTEGER | No | 0 | Number of delivery attempts |
| `last_delivery_at` | TEXT | Yes | null | Last delivery attempt timestamp |
| `delivered_at` | TEXT | Yes | null | Successful delivery timestamp |
| `acknowledged_at` | TEXT | Yes | null | When acknowledged by operator |
| `acknowledged_by` | TEXT | Yes | null | User ID who acknowledged |

**Indexes**:
- `idx_alert_events_rule_id` on `rule_id`
- `idx_alert_events_status` on `status`
- `idx_alert_events_triggered_at` on `triggered_at`

**Context schema examples**:
```typescript
// Pod creation failure
{
  session_id: string;
  project_id: string;
  error: string;
  container_id?: string;
}

// Tailscale timeout
{
  session_id: string;
  pod_name: string;
  registration_status: string;
  elapsed_seconds: number;
}

// Orphaned pod
{
  pod_name: string;
  container_id: string;
  orphaned_since: string;  // ISO timestamp
  recommendation: 'cleanup' | 'investigate';
}
```

### idle_config

Per-project idle timeout configuration.

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | (generated) | Primary key (CUID2) |
| `project_id` | TEXT | Yes | null | FK to projects.id (null = global default) |
| `idle_timeout_minutes` | INTEGER | No | 30 | Minutes of inactivity before suspend |
| `warning_minutes` | INTEGER | No | 5 | Minutes before timeout to send warning |
| `enabled` | INTEGER | No | 1 | Boolean: 1=enabled, 0=disabled |
| `created_at` | TEXT | No | (now) | ISO 8601 timestamp |
| `updated_at` | TEXT | No | (now) | ISO 8601 timestamp |

**Indexes**:
- `idx_idle_config_project_id` UNIQUE on `project_id` (allows null for global)

**Constraint**: At most one row with `project_id = null` (global default)

**Global Default**: The row with `project_id = null` represents the system-wide default configuration. This row is created by migration 008 and should not be deleted. When querying idle config for a project, first check for project-specific config, then fall back to global.

---

## Entity Relationships

```
┌─────────────┐       ┌──────────────┐
│   projects  │──1:?──│  idle_config │
└─────────────┘       └──────────────┘
      │
      │ 1:n
      ▼
┌─────────────┐       ┌────────────────┐
│   sessions  │──1:n──│ session_shares │
└─────────────┘       └────────────────┘

┌─────────────┐       ┌──────────────┐
│ alert_rules │──1:n──│ alert_events │
└─────────────┘       └──────────────┘
```

---

## State Machines

### Session Suspension States

```
active ─────────────────────────────┐
   │                                │
   │ manual suspend                 │ auto suspend (idle timeout)
   │ (suspension_reason='manual')   │ (suspension_reason='auto')
   ▼                                ▼
suspended ◄─────────────────────────┘
```

### Alert Event Lifecycle

```
                    ┌─────────────────┐
                    │     pending     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              │
        ┌──────────┐   ┌──────────┐        │
        │ delivered │   │  failed  │────────┘ (retry up to 3x)
        └────┬─────┘   └──────────┘
             │
             ▼
      ┌──────────────┐
      │ acknowledged │
      └──────────────┘
```

---

## Migration Strategy

### Migration 006: Add suspension_reason

```sql
ALTER TABLE sessions ADD COLUMN suspension_reason TEXT;
```

### Migration 007: Create alert tables

```sql
CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  threshold INTEGER,
  severity TEXT NOT NULL DEFAULT 'warning',
  enabled INTEGER NOT NULL DEFAULT 1,
  destinations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_alert_rules_condition_type ON alert_rules(condition_type);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);

CREATE TABLE alert_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES alert_rules(id),
  triggered_at TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TEXT,
  delivered_at TEXT,
  acknowledged_at TEXT,
  acknowledged_by TEXT
);

CREATE INDEX idx_alert_events_rule_id ON alert_events(rule_id);
CREATE INDEX idx_alert_events_status ON alert_events(status);
CREATE INDEX idx_alert_events_triggered_at ON alert_events(triggered_at);
```

### Migration 008: Create idle_config table

```sql
CREATE TABLE idle_config (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE REFERENCES projects(id),
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  warning_minutes INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_idle_config_project_id ON idle_config(project_id);

-- Insert global default
INSERT INTO idle_config (id, project_id, idle_timeout_minutes, warning_minutes, enabled, created_at, updated_at)
VALUES ('global-default', NULL, 30, 5, 1, datetime('now'), datetime('now'));
```

---

## Validation Rules

### alert_rules

- `name`: Required, 1-100 characters
- `condition_type`: Must be one of: 'pod_creation_failed', 'tailscale_timeout', 'database_failed', 'orphaned_pod'
- `severity`: Must be one of: 'warning', 'error', 'critical'
- `destinations`: Valid JSON array, each element must have `type` field

### alert_events

- `rule_id`: Must reference existing alert_rules.id
- `status`: Must be one of: 'pending', 'delivered', 'failed', 'acknowledged'
- `context`: Valid JSON object

### idle_config

- `idle_timeout_minutes`: Minimum 5, maximum 480 (8 hours)
- `warning_minutes`: Minimum 1, maximum idle_timeout_minutes
- `project_id`: Must reference existing projects.id or be null

---

## Seed Data

### Default Alert Rules

```typescript
const defaultAlertRules = [
  {
    name: 'Pod Creation Failure',
    condition_type: 'pod_creation_failed',
    severity: 'error',
    enabled: true,
    destinations: [],
  },
  {
    name: 'Tailscale Registration Timeout',
    condition_type: 'tailscale_timeout',
    threshold: 60,  // seconds
    severity: 'warning',
    enabled: true,
    destinations: [],
  },
  {
    name: 'Database Connection Failure',
    condition_type: 'database_failed',
    severity: 'critical',
    enabled: true,
    destinations: [],
  },
  {
    name: 'Orphaned Pod Detection',
    condition_type: 'orphaned_pod',
    threshold: 600,  // 10 minutes in seconds
    severity: 'warning',
    enabled: true,
    destinations: [],
  },
];
```
