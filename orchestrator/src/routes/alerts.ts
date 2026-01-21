/**
 * T061-T068: Alert API routes
 *
 * Endpoints:
 * - GET /api/alerts/rules - List all rules
 * - GET /api/alerts/rules/:id - Get single rule
 * - POST /api/alerts/rules - Create rule
 * - PATCH /api/alerts/rules/:id - Update rule
 * - DELETE /api/alerts/rules/:id - Delete rule
 * - GET /api/alerts/events - List events (filterable)
 * - GET /api/alerts/events/:id - Get single event
 * - POST /api/alerts/events/:id/acknowledge - Acknowledge event
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database } from '../db/types.ts';
import { AlertService } from '../services/alert-service.ts';
import { MetricsService, getMetricsService } from '../services/metrics-service.ts';
import {
  CreateAlertRuleRequestSchema,
  UpdateAlertRuleRequestSchema,
  ListAlertEventsFilterSchema,
  AcknowledgeAlertEventRequestSchema,
} from '../schemas/alerts.ts';
import { requireAuth, getAuthUser } from '../middleware/auth.ts';

/**
 * Creates alert management routes.
 */
export function alertsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();

  // Use existing MetricsService or create new one
  const metricsService = getMetricsService() ?? new MetricsService(db);
  const alertService = new AlertService(db, metricsService);

  // ============================================================================
  // Rules Endpoints (T061-T065)
  // ============================================================================

  // T061: GET /rules - List all alert rules
  app.get('/rules', requireAuth(), async (c) => {
    try {
      const rules = await alertService.listRules();
      return c.json({ rules });
    } catch (error) {
      console.error('GET /alerts/rules error:', error);
      return c.json({ error: 'Failed to list alert rules' }, 500);
    }
  });

  // T062: GET /rules/:id - Get single alert rule
  app.get('/rules/:id', requireAuth(), async (c) => {
    const { id } = c.req.param();

    try {
      const rule = await alertService.getRule(id);
      if (!rule) {
        return c.json({ error: 'Alert rule not found' }, 404);
      }
      return c.json(rule);
    } catch (error) {
      console.error(`GET /alerts/rules/${id} error:`, error);
      return c.json({ error: 'Failed to get alert rule' }, 500);
    }
  });

  // T063: POST /rules - Create new alert rule
  app.post('/rules', requireAuth(), async (c) => {
    const rawBody = await c.req.json();

    // Validate request body
    const parseResult = v.safeParse(CreateAlertRuleRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', details: issues }, 400);
    }

    try {
      const rule = await alertService.createRule(parseResult.output);
      if (!rule) {
        return c.json({ error: 'Failed to create alert rule' }, 500);
      }
      return c.json(rule, 201);
    } catch (error) {
      console.error('POST /alerts/rules error:', error);
      return c.json({ error: 'Failed to create alert rule' }, 500);
    }
  });

  // T064: PATCH /rules/:id - Update alert rule
  app.patch('/rules/:id', requireAuth(), async (c) => {
    const { id } = c.req.param();
    const rawBody = await c.req.json();

    // Validate request body
    const parseResult = v.safeParse(UpdateAlertRuleRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', details: issues }, 400);
    }

    try {
      const rule = await alertService.updateRule(id, parseResult.output);
      if (!rule) {
        return c.json({ error: 'Alert rule not found' }, 404);
      }
      return c.json(rule);
    } catch (error) {
      console.error(`PATCH /alerts/rules/${id} error:`, error);
      return c.json({ error: 'Failed to update alert rule' }, 500);
    }
  });

  // T065: DELETE /rules/:id - Delete alert rule
  app.delete('/rules/:id', requireAuth(), async (c) => {
    const { id } = c.req.param();

    try {
      const existing = await alertService.getRule(id);
      if (!existing) {
        return c.json({ error: 'Alert rule not found' }, 404);
      }

      await alertService.deleteRule(id);
      return c.json({ success: true });
    } catch (error) {
      console.error(`DELETE /alerts/rules/${id} error:`, error);
      return c.json({ error: 'Failed to delete alert rule' }, 500);
    }
  });

  // ============================================================================
  // Events Endpoints (T066-T068)
  // ============================================================================

  // T066: GET /events - List alert events
  app.get('/events', requireAuth(), async (c) => {
    const rawQuery = c.req.query();

    // Parse and validate query parameters
    const parseResult = v.safeParse(ListAlertEventsFilterSchema, rawQuery);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', details: issues }, 400);
    }

    try {
      const result = await alertService.listEvents(parseResult.output);
      return c.json(result);
    } catch (error) {
      console.error('GET /alerts/events error:', error);
      return c.json({ error: 'Failed to list alert events' }, 500);
    }
  });

  // T067: GET /events/:id - Get single alert event
  app.get('/events/:id', requireAuth(), async (c) => {
    const { id } = c.req.param();

    try {
      const event = await alertService.getEvent(id);
      if (!event) {
        return c.json({ error: 'Alert event not found' }, 404);
      }
      return c.json(event);
    } catch (error) {
      console.error(`GET /alerts/events/${id} error:`, error);
      return c.json({ error: 'Failed to get alert event' }, 500);
    }
  });

  // T068: POST /events/:id/acknowledge - Acknowledge alert event
  app.post('/events/:id/acknowledge', requireAuth(), async (c) => {
    const { id } = c.req.param();
    const rawBody = await c.req.json().catch(() => ({}));

    // Validate request body
    const parseResult = v.safeParse(AcknowledgeAlertEventRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', details: issues }, 400);
    }

    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    try {
      const existing = await alertService.getEvent(id);
      if (!existing) {
        return c.json({ error: 'Alert event not found' }, 404);
      }

      if (existing.status === 'acknowledged') {
        return c.json({ error: 'Event already acknowledged' }, 409);
      }

      const event = await alertService.acknowledgeEvent(id, user.id, parseResult.output.note);
      if (!event) {
        return c.json({ error: 'Failed to acknowledge event' }, 500);
      }

      return c.json({
        id: event.id,
        status: event.status,
        acknowledgedAt: event.acknowledgedAt,
        acknowledgedBy: event.acknowledgedBy,
      });
    } catch (error) {
      console.error(`POST /alerts/events/${id}/acknowledge error:`, error);
      return c.json({ error: 'Failed to acknowledge alert event' }, 500);
    }
  });

  return app;
}
