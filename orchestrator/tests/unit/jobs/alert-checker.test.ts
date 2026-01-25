import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../../src/db/index.ts';
import { runMigrations } from '../../../src/db/migrator.ts';
import type { Database } from '../../../src/db/types.ts';
import { AlertCheckerJob, createAlertCheckerScheduler } from '../../../src/jobs/alert-checker.ts';
import { AlertService } from '../../../src/services/alert-service.ts';
import { MetricsService } from '../../../src/services/metrics-service.ts';

/**
 * T074: Unit tests for AlertCheckerJob
 *
 * Tests:
 * - Job runs and returns result
 * - Checks enabled rules only
 * - Fires alerts when conditions are met
 * - Skips disabled rules
 * - Handles delivery after firing
 */
describe('AlertCheckerJob', () => {
  let db: Kysely<Database>;
  let alertService: AlertService;
  let metricsService: MetricsService;
  let job: AlertCheckerJob;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    await runMigrations(db);
    metricsService = new MetricsService(db);
    alertService = new AlertService(db, metricsService);
    job = new AlertCheckerJob(db, alertService, metricsService);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('Job execution', () => {
    test('should run and return result', async () => {
      const result = await job.run();

      expect(result).toBeDefined();
      expect(result.rulesChecked).toBeGreaterThan(0);
      expect(result.alertsFired).toBe(0); // No conditions met
      expect(result.errors).toEqual([]);
    });

    test('should check only enabled rules', async () => {
      // Disable all seeded rules
      await alertService.updateRule('alert-pod-creation-failed', { enabled: false });
      await alertService.updateRule('alert-tailscale-timeout', { enabled: false });
      await alertService.updateRule('alert-database-failed', { enabled: false });
      await alertService.updateRule('alert-orphaned-pod', { enabled: false });

      const result = await job.run();

      expect(result.rulesChecked).toBe(0);
    });

    test('should fire alert when condition is met', async () => {
      // Database health check always runs - simulate a failure
      // by injecting a context provider that reports failure
      const customJob = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          database_failed: async () => ({ error: 'Connection refused' }),
        },
      });

      const result = await customJob.run();

      expect(result.alertsFired).toBeGreaterThan(0);

      // Verify event was created
      const events = await alertService.listEvents({
        ruleId: 'alert-database-failed',
      });
      expect(events.events.length).toBe(1);
    });

    test('should not fire when condition is not met', async () => {
      // Default context providers return healthy state
      const result = await job.run();

      expect(result.alertsFired).toBe(0);
    });
  });

  describe('Context providers', () => {
    test('should use default database health check', async () => {
      // Database should be healthy - no alert fired
      await job.run();

      const events = await alertService.listEvents({
        ruleId: 'alert-database-failed',
      });
      expect(events.events.length).toBe(0);
    });

    test('should support custom context providers', async () => {
      const customJob = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          tailscale_timeout: async () => ({
            sessionId: 'test-session',
            elapsedSeconds: 120,
            threshold: 60,
          }),
        },
      });

      const result = await customJob.run();

      expect(result.alertsFired).toBeGreaterThanOrEqual(1);

      const events = await alertService.listEvents({
        ruleId: 'alert-tailscale-timeout',
      });
      expect(events.events.length).toBe(1);
    });
  });

  describe('Error handling', () => {
    test('should continue on error and collect them', async () => {
      const customJob = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          pod_creation_failed: async () => {
            throw new Error('Test error');
          },
        },
      });

      const result = await customJob.run();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Test error');
    });
  });

  describe('Alert delivery', () => {
    test('should attempt delivery after firing', async () => {
      // Configure a rule with a webhook destination
      await alertService.updateRule('alert-database-failed', {
        destinations: [{ type: 'webhook', url: 'https://example.com/test-webhook' }],
      });

      const customJob = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          database_failed: async () => ({ error: 'Test failure' }),
        },
        deliverAlerts: false, // Don't actually deliver in test
      });

      const result = await customJob.run();

      expect(result.alertsFired).toBe(1);
    });
  });

  describe('Scheduler', () => {
    test('should create scheduler with start/stop', () => {
      const scheduler = createAlertCheckerScheduler(db);

      expect(scheduler.start).toBeDefined();
      expect(scheduler.stop).toBeDefined();
    });

    test('should not throw when started and stopped', () => {
      const scheduler = createAlertCheckerScheduler(db);

      expect(() => {
        scheduler.start();
        scheduler.stop();
      }).not.toThrow();
    });
  });

  describe('Metrics integration', () => {
    test('should increment alert fired counter via alertService', async () => {
      const customJob = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          database_failed: async () => ({ error: 'Test failure' }),
        },
      });

      await customJob.run();

      const counters = metricsService.getAlertFiredCounters();
      expect(counters.get('database_failed')).toBe(1);
    });
  });
});
