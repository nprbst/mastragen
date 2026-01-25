import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../../src/db/index.ts';
import { runMigrations } from '../../../src/db/migrator.ts';
import type { Database } from '../../../src/db/types.ts';
import type { AlertDestination } from '../../../src/schemas/alerts.ts';
import { AlertService } from '../../../src/services/alert-service.ts';
import { MetricsService } from '../../../src/services/metrics-service.ts';

/**
 * T073: Unit tests for AlertService
 *
 * Tests:
 * - Rule CRUD operations (T050)
 * - Condition checking (T051-T054)
 * - Alert firing (T055)
 * - Webhook delivery (T056)
 * - Email delivery (T057)
 * - Retry logic (T058)
 * - Event acknowledgment
 */
describe('AlertService', () => {
  let db: Kysely<Database>;
  let metricsService: MetricsService;
  let alertService: AlertService;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    await runMigrations(db);
    metricsService = new MetricsService(db);
    alertService = new AlertService(db, metricsService);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('Rule management (T050)', () => {
    test('should list seeded rules', async () => {
      const rules = await alertService.listRules();

      expect(rules.length).toBe(4);
      const names = rules.map((r) => r.name);
      expect(names).toContain('Pod Creation Failure');
      expect(names).toContain('Tailscale Registration Timeout');
      expect(names).toContain('Database Connection Failure');
      expect(names).toContain('Orphaned Pod Detection');
    });

    test('should get rule by id', async () => {
      const rule = await alertService.getRule('alert-pod-creation-failed');

      expect(rule).not.toBeNull();
      expect(rule?.name).toBe('Pod Creation Failure');
      expect(rule?.conditionType).toBe('pod_creation_failed');
      expect(rule?.severity).toBe('error');
      expect(rule?.enabled).toBe(true);
    });

    test('should return null for non-existent rule', async () => {
      const rule = await alertService.getRule('non-existent');

      expect(rule).toBeNull();
    });

    test('should create new rule', async () => {
      const destinations: AlertDestination[] = [
        { type: 'webhook', url: 'https://example.com/webhook' },
      ];

      const rule = await alertService.createRule({
        name: 'Test Rule',
        conditionType: 'pod_creation_failed',
        severity: 'warning',
        enabled: true,
        destinations,
      });

      expect(rule).not.toBeNull();
      expect(rule?.id).toBeDefined();
      expect(rule?.name).toBe('Test Rule');
      expect(rule?.conditionType).toBe('pod_creation_failed');
      expect(rule?.severity).toBe('warning');
      expect(rule?.enabled).toBe(true);
      expect(rule?.destinations).toEqual(destinations);
    });

    test('should update existing rule', async () => {
      const updated = await alertService.updateRule('alert-pod-creation-failed', {
        name: 'Updated Name',
        enabled: false,
        severity: 'critical',
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.enabled).toBe(false);
      expect(updated?.severity).toBe('critical');
    });

    test('should delete rule', async () => {
      await alertService.deleteRule('alert-pod-creation-failed');

      const rule = await alertService.getRule('alert-pod-creation-failed');
      expect(rule).toBeNull();
    });
  });

  describe('Alert firing (T055)', () => {
    test('should create alert event when fired', async () => {
      const context = { sessionId: 'test-session', error: 'Pod creation failed' };

      const event = await alertService.fireAlert('alert-pod-creation-failed', context);

      expect(event).not.toBeNull();
      expect(event?.id).toBeDefined();
      expect(event?.ruleId).toBe('alert-pod-creation-failed');
      expect(event?.context).toEqual(context);
      expect(event?.status).toBe('pending');
      expect(event?.deliveryAttempts).toBe(0);
    });

    test('should increment metrics counter on fire', async () => {
      await alertService.fireAlert('alert-pod-creation-failed', {});

      const counters = metricsService.getAlertFiredCounters();
      expect(counters.get('pod_creation_failed')).toBe(1);
    });

    test('should return null for non-existent rule', async () => {
      const event = await alertService.fireAlert('non-existent', {});

      expect(event).toBeNull();
    });
  });

  describe('Event management', () => {
    test('should list events', async () => {
      await alertService.fireAlert('alert-pod-creation-failed', { error: 'test1' });
      await alertService.fireAlert('alert-database-failed', { error: 'test2' });

      const events = await alertService.listEvents();

      expect(events.events.length).toBe(2);
      expect(events.total).toBe(2);
    });

    test('should filter events by status', async () => {
      await alertService.fireAlert('alert-pod-creation-failed', { error: 'test1' });

      const pending = await alertService.listEvents({ status: 'pending' });
      const delivered = await alertService.listEvents({ status: 'delivered' });

      expect(pending.events.length).toBe(1);
      expect(delivered.events.length).toBe(0);
    });

    test('should filter events by ruleId', async () => {
      await alertService.fireAlert('alert-pod-creation-failed', { error: 'test1' });
      await alertService.fireAlert('alert-database-failed', { error: 'test2' });

      const filtered = await alertService.listEvents({ ruleId: 'alert-pod-creation-failed' });

      expect(filtered.events.length).toBe(1);
      expect(filtered.events[0]?.ruleId).toBe('alert-pod-creation-failed');
    });

    test('should get event by id', async () => {
      const fired = await alertService.fireAlert('alert-pod-creation-failed', { test: true });
      expect(fired).not.toBeNull();

      const event = await alertService.getEvent(fired!.id);

      expect(event).not.toBeNull();
      expect(event?.id).toBe(fired!.id);
    });

    test('should acknowledge event', async () => {
      const fired = await alertService.fireAlert('alert-pod-creation-failed', {});
      expect(fired).not.toBeNull();

      const acked = await alertService.acknowledgeEvent(fired!.id, 'user-123', 'Fixed manually');

      expect(acked).not.toBeNull();
      expect(acked?.status).toBe('acknowledged');
      expect(acked?.acknowledgedBy).toBe('user-123');
      expect(acked?.acknowledgedAt).toBeDefined();
    });
  });

  describe('Condition checking (T051-T054)', () => {
    test('T051: pod_creation_failed returns true when recent failures exist', async () => {
      // Insert a recent failed session
      await db
        .insertInto('projects')
        .values({
          id: 'test-project',
          name: 'Test Project',
          github_repo: 'org/repo',
          default_branch: 'main',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // For pod_creation_failed, we check for session failures
      // Since we don't have a separate failures table, this checks error context
      const result = await alertService.checkCondition('pod_creation_failed', {
        sessionId: 'test-session',
        error: 'Pod failed to start',
      });

      // With context provided, it indicates a failure occurred
      expect(result).toBe(true);
    });

    test('T051: pod_creation_failed returns false when no context error', async () => {
      const result = await alertService.checkCondition('pod_creation_failed', {});

      expect(result).toBe(false);
    });

    test('T052: tailscale_timeout returns true when context indicates timeout', async () => {
      const result = await alertService.checkCondition('tailscale_timeout', {
        sessionId: 'test-session',
        elapsedSeconds: 90,
        threshold: 60,
      });

      expect(result).toBe(true);
    });

    test('T052: tailscale_timeout returns false when within threshold', async () => {
      const result = await alertService.checkCondition('tailscale_timeout', {
        sessionId: 'test-session',
        elapsedSeconds: 30,
        threshold: 60,
      });

      expect(result).toBe(false);
    });

    test('T053: database_failed returns true on failure context', async () => {
      const result = await alertService.checkCondition('database_failed', {
        error: 'Connection refused',
      });

      expect(result).toBe(true);
    });

    test('T053: database_failed returns false when healthy', async () => {
      const result = await alertService.checkCondition('database_failed', {
        healthy: true,
      });

      expect(result).toBe(false);
    });

    test('T054: orphaned_pod returns true when orphaned context', async () => {
      const result = await alertService.checkCondition('orphaned_pod', {
        podName: 'sandbox-orphan-123',
        orphanedSeconds: 700,
        threshold: 600,
      });

      expect(result).toBe(true);
    });

    test('T054: orphaned_pod returns false when within threshold', async () => {
      const result = await alertService.checkCondition('orphaned_pod', {
        podName: 'sandbox-123',
        orphanedSeconds: 300,
        threshold: 600,
      });

      expect(result).toBe(false);
    });
  });

  describe('Webhook delivery (T056)', () => {
    test('should format webhook payload correctly', async () => {
      const destinations: AlertDestination[] = [
        { type: 'webhook', url: 'https://example.com/webhook' },
      ];

      await alertService.updateRule('alert-pod-creation-failed', { destinations });

      const event = await alertService.fireAlert('alert-pod-creation-failed', {
        sessionId: 'test-123',
      });
      expect(event).not.toBeNull();

      // Verify payload structure (delivery tested in integration)
      const payload = alertService.formatWebhookPayload(event!);

      expect(payload.alertId).toBe(event!.id);
      expect(payload.ruleName).toBe('Pod Creation Failure');
      expect(payload.severity).toBe('error');
      expect(payload.context.sessionId).toBe('test-123');
    });
  });

  describe('Retry logic (T058)', () => {
    test('should calculate exponential backoff correctly', () => {
      // Initial delay: 1 minute
      // Backoff: 2^attempt * base
      expect(alertService.calculateBackoffMs(0)).toBe(60 * 1000); // 1 min
      expect(alertService.calculateBackoffMs(1)).toBe(2 * 60 * 1000); // 2 min
      expect(alertService.calculateBackoffMs(2)).toBe(4 * 60 * 1000); // 4 min
      expect(alertService.calculateBackoffMs(3)).toBe(8 * 60 * 1000); // 8 min
    });

    test('should cap backoff at max value', () => {
      // Max backoff: 1 hour
      expect(alertService.calculateBackoffMs(10)).toBe(60 * 60 * 1000);
    });

    test('should track delivery attempts', async () => {
      const event = await alertService.fireAlert('alert-pod-creation-failed', {});
      expect(event).not.toBeNull();

      expect(event!.deliveryAttempts).toBe(0);

      await alertService.incrementDeliveryAttempt(event!.id);

      const updated = await alertService.getEvent(event!.id);
      expect(updated?.deliveryAttempts).toBe(1);
      expect(updated?.lastDeliveryAt).toBeDefined();
    });

    test('should mark as failed after max attempts', async () => {
      const event = await alertService.fireAlert('alert-pod-creation-failed', {});
      expect(event).not.toBeNull();

      // Simulate max attempts (5)
      for (let i = 0; i < 5; i++) {
        await alertService.incrementDeliveryAttempt(event!.id);
      }

      await alertService.checkAndMarkFailed(event!.id);

      const updated = await alertService.getEvent(event!.id);
      expect(updated?.status).toBe('failed');
    });
  });

  describe('Enabled rules filter', () => {
    test('should only return enabled rules for checking', async () => {
      await alertService.updateRule('alert-pod-creation-failed', { enabled: false });

      const enabledRules = await alertService.listEnabledRules();

      expect(enabledRules.length).toBe(3);
      expect(enabledRules.find((r) => r.id === 'alert-pod-creation-failed')).toBeUndefined();
    });
  });
});
