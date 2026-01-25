import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database as DatabaseSchema, Project } from '../../src/db/types.ts';
import {
  requireAuth,
  requireProjectAccess,
  requireProjectAdmin,
} from '../../src/middleware/auth.ts';
import { createTestJwt } from '../helpers/jwt.ts';
import { cleanupTestDb, createTestDb } from '../helpers/test-db.ts';

// Type for our app's context variables
type AppVariables = {
  db: Kysely<DatabaseSchema>;
  project: Project;
  installation: unknown;
};

const TEST_DB_PATH = './data/test-project-access-integration.db';

/**
 * T053: Integration test for protected routes with GitHub installation access checks
 *
 * Tests the full authorization flow:
 * 1. Create project linked to GitHub installation
 * 2. Verify auth middleware protects routes
 * 3. Verify installation-based access control
 * 4. Verify admin role checks
 */
describe('Protected routes with GitHub installation access', () => {
  let db: Kysely<DatabaseSchema>;
  let app: Hono<{ Variables: AppVariables }>;

  // Test data
  const testInstallation = {
    id: 'inst-test-123',
    installation_id: 12345,
    account_type: 'Organization' as const,
    account_login: 'test-org',
    account_id: 99999,
    permissions: '{}',
    repository_selection: 'selected',
    suspended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const testProject = {
    id: 'proj-test-456',
    name: 'Test Project',
    github_repo: 'test-org/test-repo',
    default_branch: 'main',
    branch_prefix: 'mg/',
    mastra_path: '.',
    ui_sandbox_path: null,
    installation_id: 'inst-test-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const testUser = {
    id: 'user-test-789',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null,
    github_id: 12345,
    github_login: 'testuser',
    github_access_token: 'gho_test_token',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_PATH);
  });

  afterAll(async () => {
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  beforeEach(async () => {
    // Clean tables between tests
    await db.deleteFrom('users').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('github_app_installations').execute();

    // Insert test data
    await db.insertInto('github_app_installations').values(testInstallation).execute();
    await db.insertInto('projects').values(testProject).execute();
    await db.insertInto('users').values(testUser).execute();

    // Create Hono app with routes
    app = new Hono<{ Variables: AppVariables }>();

    // Middleware to inject database into context
    app.use('*', async (c, next) => {
      c.set('db', db);
      await next();
    });

    // Protected project routes
    app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
    app.get('/projects/:projectId/details', (c) => {
      const project = c.get('project');
      return c.json({ id: project.id, name: project.name });
    });

    // Admin-only routes
    app.use('/projects/:projectId/admin/*', requireAuth(), requireProjectAdmin());
    app.put('/projects/:projectId/admin/settings', (c) => c.json({ updated: true }));
  });

  describe('Authentication requirements', () => {
    test('should reject requests without authentication', async () => {
      const res = await app.request(`/projects/${testProject.id}/details`);

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    test('should reject requests with invalid JWT', async () => {
      const res = await app.request(`/projects/${testProject.id}/details`, {
        headers: { Authorization: 'Bearer invalid.token.here' },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid token');
    });

    test('should reject requests with expired JWT', async () => {
      const expiredToken = await createTestJwt({
        sub: testUser.id,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const res = await app.request(`/projects/${testProject.id}/details`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Token expired');
    });
  });

  describe('Project access control', () => {
    test('should return 404 for non-existent project', async () => {
      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      const res = await app.request('/projects/non-existent-id/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not found');
    });

    test('should return 403 for project with suspended installation', async () => {
      // Create a suspended installation with unique values
      const suspendedInstallation = {
        id: 'inst-suspended-001',
        installation_id: 99901,
        account_type: 'Organization' as const,
        account_login: 'suspended-org',
        account_id: 88801,
        permissions: '{}',
        repository_selection: 'selected',
        suspended_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const suspendedProject = {
        id: 'proj-suspended-001',
        name: 'Suspended Project',
        github_repo: 'suspended-org/suspended-repo',
        default_branch: 'main',
        branch_prefix: 'mg/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: 'inst-suspended-001',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await db.insertInto('github_app_installations').values(suspendedInstallation).execute();
      await db.insertInto('projects').values(suspendedProject).execute();

      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      const res = await app.request(`/projects/${suspendedProject.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('GitHub App installation is suspended');
    });

    test('should return 403 for project without installation', async () => {
      // Create a project without installation with unique values
      const noInstallProject = {
        id: 'proj-no-install-001',
        name: 'No Install Project',
        github_repo: 'no-install-org/no-install-repo',
        default_branch: 'main',
        branch_prefix: 'mg/',
        mastra_path: '.',
        ui_sandbox_path: null,
        installation_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.insertInto('projects').values(noInstallProject).execute();

      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      const res = await app.request(`/projects/${noInstallProject.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not linked to GitHub installation');
    });

    test('should return 403 for user without GitHub access token', async () => {
      // Create a user without GitHub token with unique values
      const noTokenUser = {
        id: 'user-no-token-001',
        email: 'notoken@example.com',
        name: 'No Token User',
        avatar_url: null,
        github_id: 77701,
        github_login: 'notokenuser',
        github_access_token: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.insertInto('users').values(noTokenUser).execute();

      const token = await createTestJwt({ sub: noTokenUser.id, email: noTokenUser.email });

      const res = await app.request(`/projects/${testProject.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('GitHub access token not available');
    });
  });

  describe('Installation access verification', () => {
    test('should verify user has access to installation via GitHub API', async () => {
      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      // Mock GitHub API
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/user/installations')) {
          return new Response(
            JSON.stringify({ installations: [{ id: testInstallation.installation_id }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      const res = await app.request(`/projects/${testProject.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      globalThis.fetch = originalFetch;

      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; name: string };
      expect(body.id).toBe(testProject.id);
      expect(body.name).toBe(testProject.name);
    });

    test('should deny access when user is not in installation', async () => {
      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      // Mock GitHub API to return different installations
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/user/installations')) {
          return new Response(
            JSON.stringify({ installations: [{ id: 99999 }] }), // Different installation
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      const res = await app.request(`/projects/${testProject.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      globalThis.fetch = originalFetch;

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Access denied to this project');
    });
  });

  describe('Admin access control', () => {
    test('should deny admin access to non-admin users', async () => {
      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      // Mock GitHub API for both installation access and repo permissions
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        // Mock installation access check (return valid installation)
        if (urlStr.includes('/user/installations')) {
          return new Response(
            JSON.stringify({ installations: [{ id: testInstallation.installation_id }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Mock repo permissions (non-admin)
        if (urlStr.includes('/repos/')) {
          return new Response(
            JSON.stringify({ permissions: { admin: false, push: true, pull: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      const res = await app.request(`/projects/${testProject.id}/admin/settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setting: 'value' }),
      });

      globalThis.fetch = originalFetch;

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Admin access required');
    });

    test('should allow admin access to repository admins', async () => {
      const token = await createTestJwt({ sub: testUser.id, email: testUser.email });

      // Mock GitHub API for both installation access and repo permissions
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        // Mock installation access check (return valid installation)
        if (urlStr.includes('/user/installations')) {
          return new Response(
            JSON.stringify({ installations: [{ id: testInstallation.installation_id }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Mock repo permissions (admin)
        if (urlStr.includes('/repos/')) {
          return new Response(
            JSON.stringify({ permissions: { admin: true, push: true, pull: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      const res = await app.request(`/projects/${testProject.id}/admin/settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setting: 'value' }),
      });

      globalThis.fetch = originalFetch;

      expect(res.status).toBe(200);
      const body = (await res.json()) as { updated: boolean };
      expect(body.updated).toBe(true);
    });
  });
});
