import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { unlinkSync, existsSync } from 'node:fs';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrations/001_initial.ts';
import { healthRoutes } from '../../src/routes/health.ts';
import type { Database } from '../../src/db/types.ts';
import type { Kysely } from 'kysely';

const TEST_DB_PATH = './data/test-health-routes.db';

describe('Health Routes', () => {
  let db: Kysely<Database>;
  let app: Hono;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations(db);

    app = new Hono();
    app.route('/health', healthRoutes(db));
  });

  afterEach(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('GET /health', () => {
    test('returns 200 with status ok when database is connected', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.database).toBe('connected');
    });

    test('includes version in response', async () => {
      const res = await app.request('/health');
      const body = await res.json();

      expect(body.version).toBeDefined();
      expect(typeof body.version).toBe('string');
    });

    test('includes docker status in response', async () => {
      const res = await app.request('/health');
      const body = await res.json();

      // Docker status should be either 'connected' or 'disconnected'
      expect(['connected', 'disconnected']).toContain(body.docker);
    });
  });
});
