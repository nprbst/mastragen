/**
 * Metrics Routes - Prometheus-compatible metrics endpoint
 *
 * Exposes platform metrics for scraping by monitoring systems.
 * Rate limited to 10 requests per minute.
 *
 * Per specs/004-production-readiness/contracts/metrics.md
 */
import { Hono } from 'hono';
import { getMetricsService } from '../services/metrics-service.ts';

// Simple in-memory rate limiter
const rateLimitWindow = 60 * 1000; // 1 minute
const maxRequests = 10;
const requestTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove timestamps older than the window
  let oldest = requestTimestamps[0];
  while (oldest !== undefined && oldest < now - rateLimitWindow) {
    requestTimestamps.shift();
    oldest = requestTimestamps[0];
  }
  // Check if we're over the limit
  if (requestTimestamps.length >= maxRequests) {
    return true;
  }
  // Record this request
  requestTimestamps.push(now);
  return false;
}

export function metricsRoutes() {
  const router = new Hono();

  /**
   * GET /metrics
   * Returns Prometheus-format metrics.
   */
  router.get('/', async (c) => {
    // Rate limiting
    if (isRateLimited()) {
      return c.text('Rate limit exceeded. Max 10 requests per minute.', 429);
    }

    const metricsService = getMetricsService();
    if (!metricsService) {
      // Return unavailable response
      const unavailable = `# HELP mastragen_up Platform availability
# TYPE mastragen_up gauge
mastragen_up 0
`;
      return c.text(unavailable, 503, {
        'Content-Type': 'text/plain; version=0.0.4',
      });
    }

    try {
      const output = await metricsService.formatPrometheus();
      return c.text(output, 200, {
        'Content-Type': 'text/plain; version=0.0.4',
      });
    } catch (error) {
      console.error('[Metrics] Error collecting metrics:', error);
      const unavailable = `# HELP mastragen_up Platform availability
# TYPE mastragen_up gauge
mastragen_up 0
`;
      return c.text(unavailable, 503, {
        'Content-Type': 'text/plain; version=0.0.4',
      });
    }
  });

  return router;
}
