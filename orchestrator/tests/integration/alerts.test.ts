import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { alertsRoutes } from '../../src/routes/alerts.ts';
import { AlertService } from '../../src/services/alert-service.ts';
import { MetricsService } from '../../src/services/metrics-service.ts';
import { AlertCheckerJob } from '../../src/jobs/alert-checker.ts';
import { createTestJwt } from '../helpers/jwt.ts';

/**
 * T075: Integration tests for alerts system
 *
 * Tests the complete flow:
 * 1. Rule CRUD via API
 * 2. Condition checking triggers alert
 * 3. Event creation and delivery
 * 4. Acknowledgment flow
 * 5. Metrics integration
 */
describe('Alerts integration', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let alertService: AlertService;
  let metricsService: MetricsService;
  let authToken: string;

  const testUserId = 'test-user-123';
  const testUserEmail = 'test@example.com';

  // Helper to make authenticated requests
  async function authRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return app.request(path, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${authToken}`,
      },
    });
  }

  beforeAll(async () => {
    db = createDatabase(':memory:');
    await runMigrations(db);

    // Create test user
    await db
      .insertInto('users')
      .values({
        id: testUserId,
        email: testUserEmail,
        name: 'Test User',
        github_id: 12345,
        github_login: 'testuser',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create auth token
    authToken = await createTestJwt({
      sub: testUserId,
      email: testUserEmail,
      name: 'Test User',
    });

    metricsService = new MetricsService(db);
    alertService = new AlertService(db, metricsService);

    // Create app with routes
    app = new Hono();
    app.use('*', async (c, next) => {
      // @ts-expect-error - db is added dynamically to context for middleware use
      c.set('db', db);
      await next();
    });
    app.route('/alerts', alertsRoutes(db));
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up events between tests
    await db.deleteFrom('alert_events').execute();
  });

  describe('Rule API endpoints', () => {
    test('GET /alerts/rules returns seeded rules', async () => {
      const res = await authRequest('/alerts/rules');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rules).toBeDefined();
      expect(data.rules.length).toBeGreaterThanOrEqual(4); // 4 seeded rules + any created in tests

      const names = data.rules.map((r: any) => r.name);
      expect(names).toContain('Pod Creation Failure');
      expect(names).toContain('Tailscale Registration Timeout');
      expect(names).toContain('Database Connection Failure');
      expect(names).toContain('Orphaned Pod Detection');
    });

    test('GET /alerts/rules/:id returns single rule', async () => {
      const res = await authRequest('/alerts/rules/alert-pod-creation-failed');

      expect(res.status).toBe(200);
      const rule = await res.json();
      expect(rule.id).toBe('alert-pod-creation-failed');
      expect(rule.name).toBe('Pod Creation Failure');
      expect(rule.conditionType).toBe('pod_creation_failed');
      expect(rule.severity).toBe('error');
      expect(rule.enabled).toBe(true);
    });

    test('GET /alerts/rules/:id returns 404 for non-existent', async () => {
      const res = await authRequest('/alerts/rules/non-existent');

      expect(res.status).toBe(404);
    });

    test('POST /alerts/rules creates new rule', async () => {
      const res = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Alert',
          conditionType: 'pod_creation_failed',
          severity: 'critical',
          destinations: [{ type: 'webhook', url: 'https://example.com/webhook' }],
        }),
      });

      expect(res.status).toBe(201);
      const rule = await res.json();
      expect(rule.name).toBe('Test Alert');
      expect(rule.severity).toBe('critical');
      expect(rule.destinations.length).toBe(1);
    });

    test('PATCH /alerts/rules/:id updates rule', async () => {
      const res = await authRequest('/alerts/rules/alert-pod-creation-failed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
        }),
      });

      expect(res.status).toBe(200);
      const rule = await res.json();
      expect(rule.enabled).toBe(false);

      // Restore for other tests
      await alertService.updateRule('alert-pod-creation-failed', { enabled: true });
    });

    test('DELETE /alerts/rules/:id deletes rule', async () => {
      // Create a test rule first
      const createRes = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'To Delete',
          conditionType: 'orphaned_pod',
          severity: 'warning',
          destinations: [],
        }),
      });
      const created = await createRes.json();

      // Delete it
      const deleteRes = await authRequest(`/alerts/rules/${created.id}`, {
        method: 'DELETE',
      });

      expect(deleteRes.status).toBe(200);

      // Verify it's gone
      const getRes = await authRequest(`/alerts/rules/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('Event API endpoints', () => {
    let testEventId: string;

    beforeEach(async () => {
      // Create a test event
      const event = await alertService.fireAlert('alert-pod-creation-failed', {
        sessionId: 'test-session',
        error: 'Test error',
      });
      testEventId = event!.id;
    });

    test('GET /alerts/events returns events', async () => {
      const res = await authRequest('/alerts/events');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toBeDefined();
      expect(data.events.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);
    });

    test('GET /alerts/events filters by status', async () => {
      const res = await authRequest('/alerts/events?status=pending');

      expect(res.status).toBe(200);
      const data = await res.json();
      for (const event of data.events) {
        expect(event.status).toBe('pending');
      }
    });

    test('GET /alerts/events filters by ruleId', async () => {
      const res = await authRequest('/alerts/events?ruleId=alert-pod-creation-failed');

      expect(res.status).toBe(200);
      const data = await res.json();
      for (const event of data.events) {
        expect(event.ruleId).toBe('alert-pod-creation-failed');
      }
    });

    test('GET /alerts/events/:id returns single event', async () => {
      const res = await authRequest(`/alerts/events/${testEventId}`);

      expect(res.status).toBe(200);
      const event = await res.json();
      expect(event.id).toBe(testEventId);
      expect(event.ruleId).toBe('alert-pod-creation-failed');
      expect(event.context.sessionId).toBe('test-session');
    });

    test('GET /alerts/events/:id returns 404 for non-existent', async () => {
      const res = await authRequest('/alerts/events/non-existent');

      expect(res.status).toBe(404);
    });

    test('POST /alerts/events/:id/acknowledge acknowledges event', async () => {
      const res = await authRequest(`/alerts/events/${testEventId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Fixed the issue' }),
      });

      expect(res.status).toBe(200);
      const ack = await res.json();
      expect(ack.status).toBe('acknowledged');
      expect(ack.acknowledgedBy).toBe(testUserId);
      expect(ack.acknowledgedAt).toBeDefined();
    });

    test('POST /alerts/events/:id/acknowledge returns 409 for already acknowledged', async () => {
      // First acknowledgment
      await authRequest(`/alerts/events/${testEventId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Second acknowledgment should fail
      const res = await authRequest(`/alerts/events/${testEventId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('End-to-end alert flow', () => {
    test('AlertCheckerJob fires alert on condition match', async () => {
      // Create a job with custom context provider
      const job = new AlertCheckerJob(db, alertService, metricsService, {
        contextProviders: {
          database_failed: async () => ({ error: 'Connection refused' }),
        },
        deliverAlerts: false,
      });

      // Run the job
      const result = await job.run();

      expect(result.alertsFired).toBeGreaterThan(0);

      // Verify event was created
      const eventsRes = await authRequest('/alerts/events?ruleId=alert-database-failed');
      const events = await eventsRes.json();
      expect(events.events.length).toBeGreaterThan(0);
      expect(events.events[0].context.error).toBe('Connection refused');
    });

    test('Metrics are updated on alert fire', async () => {
      const initialCounters = metricsService.getAlertFiredCounters();
      const initialCount = initialCounters.get('tailscale_timeout') ?? 0;

      // Fire an alert
      await alertService.fireAlert('alert-tailscale-timeout', {
        sessionId: 'test',
        elapsedSeconds: 120,
      });

      const updatedCounters = metricsService.getAlertFiredCounters();
      expect(updatedCounters.get('tailscale_timeout')).toBe(initialCount + 1);
    });

    test('Complete workflow: fire, list, acknowledge', async () => {
      // 1. Fire an alert
      const event = await alertService.fireAlert('alert-orphaned-pod', {
        podName: 'sandbox-orphan-123',
        orphanedSeconds: 700,
      });
      expect(event).not.toBeNull();

      // 2. List events and find it
      const listRes = await authRequest('/alerts/events?status=pending');
      const listData = await listRes.json();
      const foundEvent = listData.events.find((e: any) => e.id === event!.id);
      expect(foundEvent).toBeDefined();

      // 3. Acknowledge the event
      const ackRes = await authRequest(`/alerts/events/${event!.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Cleaned up orphaned pod' }),
      });
      expect(ackRes.status).toBe(200);

      // 4. Verify it's acknowledged
      const getRes = await authRequest(`/alerts/events/${event!.id}`);
      const ackEvent = await getRes.json();
      expect(ackEvent.status).toBe('acknowledged');
    });
  });

  describe('Validation', () => {
    test('POST /alerts/rules rejects invalid conditionType', async () => {
      const res = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid',
          conditionType: 'invalid_type',
          severity: 'warning',
          destinations: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /alerts/rules rejects invalid severity', async () => {
      const res = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid',
          conditionType: 'pod_creation_failed',
          severity: 'invalid',
          destinations: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /alerts/rules rejects invalid webhook URL', async () => {
      const res = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid',
          conditionType: 'pod_creation_failed',
          severity: 'warning',
          destinations: [{ type: 'webhook', url: 'not-a-url' }],
        }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /alerts/rules rejects invalid email', async () => {
      const res = await authRequest('/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid',
          conditionType: 'pod_creation_failed',
          severity: 'warning',
          destinations: [{ type: 'email', email: 'not-an-email' }],
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
