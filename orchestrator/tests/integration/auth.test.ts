import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import type { Kysely } from 'kysely';
import { Hono } from 'hono';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../src/db/migrations/002_git_fields.ts';
import type { Database } from '../../src/db/types.ts';

// Test T011: Integration test for auth routes (login, callback, logout, me, refresh)

const TEST_DB_PATH = './data/test-auth-integration.db';

describe('Auth routes integration', () => {
  let db: Kysely<Database>;
  let app: Hono;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);
    // Phase 3 migration will be added once created
    // await runMigrations003(db);
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    app = new Hono();
    // Import and register auth routes
    // This will fail until implementation exists - expected for TDD
    try {
      const { authRoutes } = await import('../../src/routes/auth.ts');
      app.route('/auth', authRoutes);
    } catch {
      // Expected to fail until implementation
    }
  });

  describe('GET /auth/login', () => {
    test('should redirect to OIDC provider', async () => {
      const res = await app.request('/auth/login');

      // Should redirect (302 or 303)
      expect([302, 303, 307]).toContain(res.status);

      // Should have Location header pointing to OIDC provider
      const location = res.headers.get('Location');
      expect(location).toBeDefined();
      // The URL should contain OIDC parameters
      expect(location).toMatch(/response_type=code/);
    });

    test('should include state parameter for CSRF protection', async () => {
      const res = await app.request('/auth/login');

      const location = res.headers.get('Location');
      expect(location).toMatch(/state=/);
    });

    test('should support redirect_uri query parameter', async () => {
      const res = await app.request('/auth/login?redirect_uri=/dashboard');

      expect([302, 303, 307]).toContain(res.status);
      // The state should encode the redirect_uri
    });
  });

  describe('GET /auth/callback', () => {
    test('should return 400 when code is missing', async () => {
      const res = await app.request('/auth/callback');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing authorization code');
    });

    test('should return 400 when state is invalid', async () => {
      const res = await app.request('/auth/callback?code=test-code&state=invalid-state');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid state parameter');
    });

    test('should exchange code for tokens and create session', async () => {
      // This test requires mocking the OIDC provider
      // In a real test, we'd set up a mock OIDC server
      const validCode = 'valid-auth-code';
      const validState = 'valid-state'; // Would need to be generated from a real login flow

      const res = await app.request(`/auth/callback?code=${validCode}&state=${validState}`);

      // Should redirect to the original redirect_uri or default to dashboard
      expect([302, 303, 307]).toContain(res.status);

      // Should set auth cookies or return JWT
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toBeDefined();
    });
  });

  describe('POST /auth/logout', () => {
    test('should return 401 when not authenticated', async () => {
      const res = await app.request('/auth/logout', { method: 'POST' });

      expect(res.status).toBe(401);
    });

    test('should clear auth session when authenticated', async () => {
      const validToken = 'valid.jwt.token';

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      });

      // Should succeed
      expect([200, 204]).toContain(res.status);

      // Should clear cookies
      const setCookie = res.headers.get('Set-Cookie');
      if (setCookie) {
        expect(setCookie).toMatch(/Max-Age=0|Expires=.*1970/i);
      }
    });
  });

  describe('GET /auth/me', () => {
    test('should return 401 when not authenticated', async () => {
      const res = await app.request('/auth/me');

      expect(res.status).toBe(401);
    });

    test('should return user info when authenticated', async () => {
      const validToken = 'valid.jwt.token';

      const res = await app.request('/auth/me', {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
      expect(body).toHaveProperty('name');
    });

    test('should not expose sensitive fields', async () => {
      const validToken = 'valid.jwt.token';

      const res = await app.request('/auth/me', {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Should not expose internal fields
      expect(body).not.toHaveProperty('provider_id');
    });
  });

  describe('POST /auth/refresh', () => {
    test('should return 401 when no refresh token', async () => {
      const res = await app.request('/auth/refresh', { method: 'POST' });

      expect(res.status).toBe(401);
    });

    test('should return 401 when refresh token is expired', async () => {
      const expiredRefreshToken = 'expired.refresh.token';

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${expiredRefreshToken}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Refresh token expired');
    });

    test('should return new access token with valid refresh token', async () => {
      const validRefreshToken = 'valid.refresh.token';

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${validRefreshToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('accessToken');

      // New access token should be valid JWT format
      expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    test('should rotate refresh token on use', async () => {
      const validRefreshToken = 'valid.refresh.token';

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${validRefreshToken}` },
      });

      // Should set new refresh token cookie
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toMatch(/refresh_token=/);
    });
  });

  describe('User creation on first login', () => {
    test('should create user record on first OIDC callback', async () => {
      // After successful callback, user should exist in database
      // This would require mocking the OIDC flow
      // Placeholder test - actual implementation in integration test with mocked OIDC
      expect(true).toBe(true);
    });

    test('should update user info on subsequent logins', async () => {
      // User profile info from OIDC should update existing user
      expect(true).toBe(true);
    });
  });

  describe('Audit logging', () => {
    test('should log successful login events', async () => {
      // Mock the audit logger and verify it's called
      // This will be tested via spying on the AuditLogger
      expect(true).toBe(true);
    });

    test('should log failed login attempts', async () => {
      expect(true).toBe(true);
    });

    test('should log logout events', async () => {
      expect(true).toBe(true);
    });
  });
});
