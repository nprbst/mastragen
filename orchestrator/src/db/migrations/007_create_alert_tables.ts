import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 007: Create alert tables (Phase 4)
 *
 * Creates tables for:
 * - alert_rules: Configuration for alert conditions
 * - alert_events: Triggered alert instances
 *
 * Also seeds default alert rules for common conditions.
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function up(db: Kysely<any>): Promise<void> {
  // Create alert_rules table
  await db.schema
    .createTable('alert_rules')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('condition_type', 'text', (col) => col.notNull())
    .addColumn('threshold', 'integer')
    .addColumn('severity', 'text', (col) => col.notNull().defaultTo('warning'))
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('destinations', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // Create indexes for alert_rules
  await db.schema
    .createIndex('idx_alert_rules_condition_type')
    .on('alert_rules')
    .column('condition_type')
    .execute();

  await db.schema
    .createIndex('idx_alert_rules_enabled')
    .on('alert_rules')
    .column('enabled')
    .execute();

  // Create alert_events table
  await db.schema
    .createTable('alert_events')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('rule_id', 'text', (col) => col.notNull().references('alert_rules.id'))
    .addColumn('triggered_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('context', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('delivery_attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_delivery_at', 'text')
    .addColumn('delivered_at', 'text')
    .addColumn('acknowledged_at', 'text')
    .addColumn('acknowledged_by', 'text')
    .execute();

  // Create indexes for alert_events
  await db.schema
    .createIndex('idx_alert_events_rule_id')
    .on('alert_events')
    .column('rule_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_events_status')
    .on('alert_events')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_alert_events_triggered_at')
    .on('alert_events')
    .column('triggered_at')
    .execute();

  // Seed default alert rules
  const now = new Date().toISOString();
  const defaultRules = [
    {
      id: 'alert-pod-creation-failed',
      name: 'Pod Creation Failure',
      condition_type: 'pod_creation_failed',
      threshold: null,
      severity: 'error',
      enabled: 1,
      destinations: '[]',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'alert-tailscale-timeout',
      name: 'Tailscale Registration Timeout',
      condition_type: 'tailscale_timeout',
      threshold: 60,
      severity: 'warning',
      enabled: 1,
      destinations: '[]',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'alert-database-failed',
      name: 'Database Connection Failure',
      condition_type: 'database_failed',
      threshold: null,
      severity: 'critical',
      enabled: 1,
      destinations: '[]',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'alert-orphaned-pod',
      name: 'Orphaned Pod Detection',
      condition_type: 'orphaned_pod',
      threshold: 600,
      severity: 'warning',
      enabled: 1,
      destinations: '[]',
      created_at: now,
      updated_at: now,
    },
  ];

  for (const rule of defaultRules) {
    await db
      .insertInto('alert_rules')
      .values(rule)
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}

/**
 * Rollback migration 007
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema operations don't require typed database
export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_alert_events_triggered_at').ifExists().execute();
  await db.schema.dropIndex('idx_alert_events_status').ifExists().execute();
  await db.schema.dropIndex('idx_alert_events_rule_id').ifExists().execute();
  await db.schema.dropIndex('idx_alert_rules_enabled').ifExists().execute();
  await db.schema.dropIndex('idx_alert_rules_condition_type').ifExists().execute();

  // Drop tables (in reverse dependency order)
  await db.schema.dropTable('alert_events').ifExists().execute();
  await db.schema.dropTable('alert_rules').ifExists().execute();
}
