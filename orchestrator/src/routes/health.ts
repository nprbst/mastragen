import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';
import { HealthService } from '../services/health.ts';

/**
 * Creates health check routes.
 */
export function healthRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const healthService = new HealthService({ db, dockerEnabled: false });

  app.get('/', async (c) => {
    const health = await healthService.check();

    if (health.status === 'ok') {
      return c.json(health, 200);
    }

    return c.json(health, 503);
  });

  return app;
}
