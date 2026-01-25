import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../../src/db/types.ts';
import { createTestJwt } from '../../helpers/jwt.ts';

// Type for our app's context variables
type AppVariables = {
  db: Kysely<Database>;
};

/**
 * T052: Unit test for GitHub installation-based project access
 *
 * Tests that:
 * 1. Users can only access projects linked to GitHub installations they have access to
 * 2. Suspended installations deny access
 * 3. Projects without installations return appropriate errors
 * 4. Admin access requires repository admin permissions
 */
describe('GitHub installation-based project access', () => {
  let app: Hono<{ Variables: AppVariables }>;

  // Mock database for testing
  function createMockDb(options: {
    project?: {
      id: string;
      installation_id: string | null;
      github_repo: string;
    } | null;
    installation?: {
      id: string;
      installation_id: number;
      suspended_at: string | null;
    } | null;
    user?: {
      id: string;
      github_access_token: string | null;
    } | null;
    userHasInstallationAccess?: boolean;
    userHasAdminAccess?: boolean;
  }) {
    const mockDb = {
      selectFrom: (table: string) => {
        const chain = {
          selectAll: () => chain,
          select: () => chain,
          where: (_field: string, _op: string, _value: unknown) => chain,
          executeTakeFirst: async () => {
            if (table === 'projects') return options.project;
            if (table === 'github_app_installations') return options.installation;
            if (table === 'users') return options.user;
            return null;
          },
        };
        return chain;
      },
    };
    return mockDb as unknown as Kysely<Database>;
  }

  beforeEach(() => {
    app = new Hono<{ Variables: AppVariables }>();
    // Reset any fetch mocks
    mock.restore();
  });

  describe('requireProjectAccess middleware', () => {
    test('should return 401 when no auth token provided', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const res = await app.request('/projects/proj-123/details');

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    test('should return 404 when project does not exist', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({ project: null });

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not found');
    });

    test('should return 403 when project has no installation_id', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: null,
          github_repo: 'owner/repo',
        },
      });

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not linked to GitHub installation');
    });

    test('should return 403 when installation is suspended', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: '2024-01-01T00:00:00Z',
        },
        user: {
          id: 'user-123',
          github_access_token: 'gho_test123',
        },
      });

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('GitHub App installation is suspended');
    });

    test('should return 403 when user has no GitHub access token', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: null,
        },
        user: {
          id: 'user-123',
          github_access_token: null,
        },
      });

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('GitHub access token not available');
    });

    test('should return 403 when user does not have access to the installation', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: null,
        },
        user: {
          id: 'user-123',
          github_access_token: 'gho_test123',
        },
      });

      // Mock GitHub API to return empty installations
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/user/installations')) {
          return new Response(JSON.stringify({ installations: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Access denied to this project');
    });

    test('should allow access when user has valid installation access', async () => {
      const { requireAuth, requireProjectAccess } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: null,
        },
        user: {
          id: 'user-123',
          github_access_token: 'gho_test123',
        },
      });

      // Mock GitHub API to return the installation
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/user/installations')) {
          return new Response(JSON.stringify({ installations: [{ id: 12345 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/*', requireAuth(), requireProjectAccess());
      app.get('/projects/:projectId/details', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/details', {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe('requireProjectAdmin middleware', () => {
    test('should return 403 when user does not have admin permissions', async () => {
      const { requireAuth, requireProjectAdmin } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: null,
        },
        user: {
          id: 'user-123',
          github_access_token: 'gho_test123',
        },
      });

      // Mock GitHub API to return non-admin permissions
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/repos/owner/repo')) {
          return new Response(
            JSON.stringify({ permissions: { admin: false, push: true, pull: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/admin/*', requireAuth(), requireProjectAdmin());
      app.put('/projects/:projectId/admin/settings', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Admin access required');
    });

    test('should allow access when user has admin permissions', async () => {
      const { requireAuth, requireProjectAdmin } = await import('../../../src/middleware/auth.ts');

      const mockDb = createMockDb({
        project: {
          id: 'proj-123',
          installation_id: 'inst-456',
          github_repo: 'owner/repo',
        },
        installation: {
          id: 'inst-456',
          installation_id: 12345,
          suspended_at: null,
        },
        user: {
          id: 'user-123',
          github_access_token: 'gho_test123',
        },
      });

      // Mock GitHub API to return admin permissions
      const originalFetch = globalThis.fetch;
      const mockFetch = async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/repos/owner/repo')) {
          return new Response(
            JSON.stringify({ permissions: { admin: true, push: true, pull: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };
      globalThis.fetch = mockFetch as typeof fetch;

      app.use('*', async (c, next) => {
        c.set('db', mockDb);
        await next();
      });
      app.use('/projects/:projectId/admin/*', requireAuth(), requireProjectAdmin());
      app.put('/projects/:projectId/admin/settings', (c) => c.json({ ok: true }));

      const token = await createTestJwt({ sub: 'user-123', email: 'test@example.com' });

      const res = await app.request('/projects/proj-123/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });
});
