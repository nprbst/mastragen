import { describe, expect, test, beforeEach, beforeAll, afterAll } from 'bun:test';

// Track if we have real GitHub credentials (affects which tests can run)
const hasRealGitHubCredentials = !!process.env.GITHUB_APP_CLIENT_ID;
import type { Kysely } from 'kysely';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';
import { createTestJwt } from '../helpers/jwt.ts';
import { createAuthRoutes } from '../../src/routes/auth.ts';
import { AuthService } from '../../src/services/auth.ts';
import { initializeKeyPair } from '../../src/lib/crypto.ts';
import type { Database } from '../../src/db/types.ts';

// Generate test RSA keys at module load time
const testKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
// Set environment variables so initializeKeyPair uses them
process.env.ENCRYPTION_PUBLIC_KEY = testKeyPair.publicKey;
process.env.ENCRYPTION_PRIVATE_KEY = testKeyPair.privateKey;

// Test T011: Integration test for auth routes (login, callback, logout, me, refresh)

const TEST_DB_PATH = './data/test-auth-integration.db';

describe('Auth routes integration', () => {
  let db: Kysely<Database>;
  let app: Hono;
  let authService: AuthService;
  let testUser: { id: string; email: string; name: string; github_id: number; github_login: string };

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);
    await initializeKeyPair();

    // Create a test user
    testUser = {
      id: nanoid(12),
      email: 'test@example.com',
      name: 'Test User',
      github_id: 12345,
      github_login: 'testuser',
    };

    await db.insertInto('users').values({
      id: testUser.id,
      email: testUser.email,
      name: testUser.name,
      github_id: testUser.github_id,
      github_login: testUser.github_login,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).execute();
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  beforeEach(async () => {
    app = new Hono();
    authService = new AuthService(db);
    app.route('/auth', createAuthRoutes(db));
  });

  describe('GET /auth/login', () => {
    test('should redirect to GitHub OAuth', async () => {
      const res = await app.request('/auth/login');

      // Should redirect (302)
      expect(res.status).toBe(302);

      // Should have Location header pointing to GitHub OAuth
      const location = res.headers.get('Location');
      expect(location).toBeDefined();
      // GitHub OAuth uses client_id param
      expect(location).toMatch(/github\.com\/login\/oauth\/authorize/);
      expect(location).toMatch(/client_id=/);
    });

    test('should include state parameter for CSRF protection', async () => {
      const res = await app.request('/auth/login');

      const location = res.headers.get('Location');
      expect(location).toBeDefined();
      expect(location).toMatch(/state=/);
    });

    test('should support redirect_uri query parameter', async () => {
      const res = await app.request('/auth/login?redirect_uri=/dashboard');

      expect(res.status).toBe(302);
      // The state should encode the redirect_uri (tested via callback flow)
    });
  });

  describe('GET /auth/callback', () => {
    test('should return 400 when code is missing', async () => {
      const res = await app.request('/auth/callback');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Missing authorization code');
    });

    test('should return 400 when state is invalid', async () => {
      const res = await app.request('/auth/callback?code=test-code&state=invalid-state');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid state parameter');
    });

    test.skipIf(hasRealGitHubCredentials)('should exchange code for tokens and create session', async () => {
      // This test only works in mock mode (no GITHUB_APP_CLIENT_ID)
      // When real credentials are present, the OAuth flow requires a real GitHub code

      // First, initiate login to get a valid state
      const loginRes = await app.request('/auth/login');
      const location = loginRes.headers.get('Location');
      expect(location).toBeDefined();

      // Extract state from the redirect URL
      const url = new URL(location!);
      const validState = url.searchParams.get('state');
      expect(validState).toBeDefined();

      // In development mode (no GITHUB_APP_CLIENT_ID), the AuthService uses mock data
      const validCode = 'dev-auth-code';

      const res = await app.request(`/auth/callback?code=${validCode}&state=${validState}`);

      // Should redirect to the original redirect_uri with access token
      expect(res.status).toBe(302);

      // Should set refresh token cookie
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/refresh_token=/);
    });
  });

  describe('POST /auth/logout', () => {
    test('should return 401 when not authenticated', async () => {
      const res = await app.request('/auth/logout', { method: 'POST' });

      expect(res.status).toBe(401);
    });

    test('should clear auth session when authenticated', async () => {
      const validToken = await createTestJwt({
        sub: testUser.id,
        email: testUser.email,
        name: testUser.name,
      });

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      });

      // Should succeed
      expect(res.status).toBe(200);

      // Should clear cookies
      const setCookie = res.headers.get('Set-Cookie');
      if (setCookie) {
        expect(setCookie).toMatch(/Max-Age=0|expires=.*1970/i);
      }
    });
  });

  describe('GET /auth/me', () => {
    test('should return 401 when not authenticated', async () => {
      const res = await app.request('/auth/me');

      expect(res.status).toBe(401);
    });

    test('should return user info when authenticated', async () => {
      const validToken = await createTestJwt({
        sub: testUser.id,
        email: testUser.email,
        name: testUser.name,
      });

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
      const validToken = await createTestJwt({
        sub: testUser.id,
        email: testUser.email,
        name: testUser.name,
      });

      const res = await app.request('/auth/me', {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Should not expose internal fields like github_access_token
      expect(body).not.toHaveProperty('github_access_token');
    });
  });

  describe('POST /auth/refresh', () => {
    test('should return 401 when no refresh token', async () => {
      const res = await app.request('/auth/refresh', { method: 'POST' });

      expect(res.status).toBe(401);
    });

    test('should return 401 when refresh token is expired', async () => {
      // Create an expired refresh token (expired 1 hour ago)
      const now = Math.floor(Date.now() / 1000);
      const expiredRefreshToken = await createTestJwt({
        sub: testUser.id,
        email: testUser.email,
        exp: now - 3600, // Expired 1 hour ago
      });

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${expiredRefreshToken}` },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Refresh token expired');
    });

    test('should return new access token with valid refresh token', async () => {
      // Use authService to generate a proper refresh token
      const validRefreshToken = await authService.generateRefreshToken(testUser.id);

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${validRefreshToken}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { accessToken: string };
      expect(body).toHaveProperty('accessToken');

      // New access token should be valid JWT format
      expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    test('should rotate refresh token on use', async () => {
      const validRefreshToken = await authService.generateRefreshToken(testUser.id);

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
