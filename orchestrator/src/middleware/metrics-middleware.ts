/**
 * Metrics Middleware - Track API request counts and durations
 *
 * Records:
 * - Request count by endpoint, method, and status code
 * - Request duration in histogram buckets
 *
 * Per specs/004-production-readiness/contracts/metrics.md
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getMetricsService } from '../services/metrics-service.ts';

/**
 * Normalize API path for metrics by removing dynamic segments.
 * Converts /api/sessions/abc123 to /api/sessions/:id
 */
function normalizeEndpoint(path: string): string {
  // Skip non-API paths
  if (!path.startsWith('/api/') && !path.startsWith('/rpc/')) {
    return path;
  }

  // Replace UUID-like segments with :id
  return path.replace(/\/[0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,}[0-9a-f]{12,}/gi, '/:id');
}

/**
 * Create metrics middleware handler.
 */
export function metricsMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const startTime = performance.now();
    const path = c.req.path;
    const method = c.req.method;

    // Skip metrics endpoint to avoid self-tracking
    if (path === '/metrics') {
      return next();
    }

    await next();

    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;
    const status = c.res.status;

    // Record metrics
    const metricsService = getMetricsService();
    if (metricsService) {
      const endpoint = normalizeEndpoint(path);
      metricsService.recordApiRequest(endpoint, method, status, durationSeconds);
    }
  };
}
