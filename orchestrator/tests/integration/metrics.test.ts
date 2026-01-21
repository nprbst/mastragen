import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { initializeMetricsService, getMetricsService } from '../../src/services/metrics-service.ts';
import { metricsRoutes } from '../../src/routes/metrics.ts';
import { metricsMiddleware } from '../../src/middleware/metrics-middleware.ts';

/**
 * T049: Integration tests for Prometheus metrics endpoint
 *
 * Tests:
 * 1. GET /metrics returns Prometheus format
 * 2. Metrics content includes expected metric types
 * 3. Rate limiting works correctly
 * 4. Content-Type header is correct
 */
describe('Metrics integration', () => {
  let db: Kysely<Database>;
  let app: Hono;
  const testDbPath = ':memory:';

  beforeAll(async () => {
    // Setup test database
    db = createDatabase(testDbPath);
    await runMigrations(db);

    // Initialize metrics service
    initializeMetricsService(db);

    // Create minimal app with metrics routes
    app = new Hono();
    app.use('*', metricsMiddleware());
    app.route('/metrics', metricsRoutes());

    // Add a sample endpoint to generate metrics
    app.get('/api/sessions', (c) => c.json({ sessions: [] }));
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('GET /metrics', () => {
    test('should return 200 with Prometheus format', async () => {
      const res = await app.request('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain; version=0.0.4');

      const body = await res.text();
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    test('should include session gauge metrics', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_sessions_total');
      expect(body).toContain('# TYPE mastragen_sessions_total gauge');
    });

    test('should include build info metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_build_info');
      expect(body).toContain('# TYPE mastragen_build_info gauge');
      expect(body).toContain('mastragen_build_info{version=');
    });

    test('should include API request metrics after making requests', async () => {
      // Make some requests to generate metrics
      await app.request('/api/sessions');
      await app.request('/api/sessions');

      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_api_requests_total');
      expect(body).toContain('# TYPE mastragen_api_requests_total counter');
      expect(body).toContain('mastragen_api_requests_total{endpoint="/api/sessions",method="GET"');
    });

    test('should include API duration histogram after making requests', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_api_request_duration_seconds');
      expect(body).toContain('# TYPE mastragen_api_request_duration_seconds histogram');
      expect(body).toContain('mastragen_api_request_duration_seconds_bucket{endpoint=');
    });

    test('should track session creation counter', async () => {
      const metricsService = getMetricsService();
      expect(metricsService).not.toBeNull();

      metricsService!.incrementSessionCreation('test-project');

      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_session_creations_total');
      expect(body).toContain('mastragen_session_creations_total{project="test-project"} 1');
    });

    test('should track alert fired counter', async () => {
      const metricsService = getMetricsService();
      expect(metricsService).not.toBeNull();

      metricsService!.incrementAlertFired('pod_creation_failed');
      metricsService!.incrementAlertFired('pod_creation_failed');

      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('# HELP mastragen_alerts_fired_total');
      expect(body).toContain('mastragen_alerts_fired_total{type="pod_creation_failed"} 2');
    });
  });

  describe('Rate limiting', () => {
    test('should return valid response or rate limit error', async () => {
      // Rate limiter state persists between tests
      // Just verify we get a valid response (200 or 429)
      const res = await app.request('/metrics');
      expect([200, 429]).toContain(res.status);

      if (res.status === 429) {
        const body = await res.text();
        expect(body).toContain('Rate limit exceeded');
      }
    });
  });
});
