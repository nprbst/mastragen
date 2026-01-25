/**
 * T027-T028: Global configuration routes
 *
 * Endpoints for system-wide configuration:
 * - GET /api/config/idle - Get global idle config
 * - PATCH /api/config/idle - Update global idle config
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database } from '../db/types.ts';
import { requireAuth } from '../middleware/auth.ts';
import { UpdateGlobalIdleConfigRequestSchema } from '../schemas/idle-config.ts';
import { IdleConfigService } from '../services/idle-config-service.ts';

/**
 * Creates configuration routes.
 */
export function configRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const idleConfigService = new IdleConfigService(db);

  // GET /config/idle - Get global idle configuration (T027)
  app.get('/idle', requireAuth(), async (c) => {
    const config = await idleConfigService.getGlobalConfig();

    if (!config) {
      return c.json({ error: 'Global idle config not found' }, 404);
    }

    return c.json(config, 200);
  });

  // PATCH /config/idle - Update global idle configuration (T028)
  app.patch('/idle', requireAuth(), async (c) => {
    const rawBody = await c.req.json();

    // Validate request body
    const parseResult = v.safeParse(UpdateGlobalIdleConfigRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', issues }, 400);
    }

    const input = parseResult.output;

    // Validate warning_minutes is less than idle_timeout_minutes
    if (input.warningMinutes !== undefined && input.idleTimeoutMinutes !== undefined) {
      if (input.warningMinutes >= input.idleTimeoutMinutes) {
        return c.json({ error: 'Warning time must be less than idle timeout' }, 400);
      }
    }

    try {
      const config = await idleConfigService.updateGlobalConfig(input);
      return c.json(config, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update config';
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
