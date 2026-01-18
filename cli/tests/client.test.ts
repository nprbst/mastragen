import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { MgenClient, ApiError } from '../src/client.ts';

describe('MgenClient', () => {
  const baseUrl = 'http://localhost:3000';
  let client: MgenClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    client = new MgenClient(baseUrl);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Helper to create a typed mock for fetch
  function mockFetch(fn: () => Promise<Response>): void {
    globalThis.fetch = mock(fn) as unknown as typeof fetch;
  }

  describe('health', () => {
    test('returns health status when API is healthy', async () => {
      const mockResponse = {
        status: 'ok' as const,
        database: 'connected' as const,
        docker: 'disconnected' as const,
        version: '0.1.0',
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await client.health();

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('returns health status when API is unhealthy', async () => {
      const mockResponse = {
        status: 'unhealthy' as const,
        database: 'disconnected' as const,
        docker: 'disconnected' as const,
        version: '0.1.0',
        error: 'One or more services are unhealthy',
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 503 }))
      );

      const result = await client.health();

      expect(result).toEqual(mockResponse);
    });

    test('throws ApiError when fetch fails', async () => {
      mockFetch(() => Promise.reject(new Error('Network error')));

      await expect(client.health()).rejects.toThrow('Network error');
    });
  });

  describe('createSession', () => {
    test('creates a new session', async () => {
      const mockResponse = {
        id: 'abc123',
        projectId: 'proj01',
        artifactName: 'my-feature',
        environment: 'dev',
        state: 'active' as const,
        createdAt: '2024-01-17T12:00:00Z',
        updatedAt: '2024-01-17T12:00:00Z',
        urls: {
          cui: 'http://localhost:3001',
          mastra: 'http://localhost:4111',
          astro: null,
          vscode: 'http://localhost:8080',
        },
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 201 }))
      );

      const result = await client.createSession({
        projectId: 'proj01',
        artifactName: 'my-feature',
        environment: 'dev',
      });

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj01',
          artifactName: 'my-feature',
          environment: 'dev',
        }),
      });
    });

    test('throws ApiError for 404 project not found', async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Project not found: proj99' }), { status: 404 })
        )
      );

      await expect(
        client.createSession({
          projectId: 'proj99',
          artifactName: 'feature',
          environment: 'dev',
        })
      ).rejects.toThrow(ApiError);

      try {
        await client.createSession({
          projectId: 'proj99',
          artifactName: 'feature',
          environment: 'dev',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(404);
        expect((e as ApiError).message).toBe('Project not found: proj99');
      }
    });

    test('throws ApiError for 409 session already exists', async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'Session already exists for this project and artifact name',
              existingSessionId: 'existing123',
            }),
            { status: 409 }
          )
        )
      );

      try {
        await client.createSession({
          projectId: 'proj01',
          artifactName: 'existing-feature',
          environment: 'dev',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(409);
      }
    });
  });

  describe('listSessions', () => {
    test('returns all sessions', async () => {
      const mockResponse = [
        {
          id: 'abc123',
          projectId: 'proj01',
          artifactName: 'feature-1',
          environment: 'dev',
          state: 'active' as const,
          createdAt: '2024-01-17T12:00:00Z',
          updatedAt: '2024-01-17T12:00:00Z',
        },
        {
          id: 'def456',
          projectId: 'proj01',
          artifactName: 'feature-2',
          environment: 'dev',
          state: 'suspended' as const,
          createdAt: '2024-01-17T11:00:00Z',
          updatedAt: '2024-01-17T11:30:00Z',
        },
      ];

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await client.listSessions();

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('filters by state', async () => {
      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      );

      await client.listSessions({ state: 'active' });

      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions?state=active`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('filters by projectId', async () => {
      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      );

      await client.listSessions({ projectId: 'proj01' });

      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions?projectId=proj01`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('filters by both state and projectId', async () => {
      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      );

      await client.listSessions({ state: 'suspended', projectId: 'proj01' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions?state=suspended&projectId=proj01`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
  });

  describe('getSession', () => {
    test('returns session with URLs for active session', async () => {
      const mockResponse = {
        id: 'abc123',
        projectId: 'proj01',
        artifactName: 'my-feature',
        environment: 'dev',
        state: 'active' as const,
        createdAt: '2024-01-17T12:00:00Z',
        updatedAt: '2024-01-17T12:00:00Z',
        urls: {
          cui: 'http://localhost:3001',
          mastra: 'http://localhost:4111',
          astro: null,
          vscode: 'http://localhost:8080',
        },
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await client.getSession('abc123');

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions/abc123`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('throws ApiError for 404 not found', async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Session not found: nonexistent' }), { status: 404 })
        )
      );

      try {
        await client.getSession('nonexistent');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(404);
      }
    });
  });

  describe('suspendSession', () => {
    test('suspends an active session', async () => {
      const mockResponse = {
        id: 'abc123',
        projectId: 'proj01',
        artifactName: 'my-feature',
        environment: 'dev',
        state: 'suspended' as const,
        createdAt: '2024-01-17T12:00:00Z',
        updatedAt: '2024-01-17T12:30:00Z',
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await client.suspendSession('abc123');

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions/abc123/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('throws ApiError for 400 not active', async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Session is not active: abc123' }), { status: 400 })
        )
      );

      try {
        await client.suspendSession('abc123');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(400);
      }
    });
  });

  describe('resumeSession', () => {
    test('resumes a suspended session', async () => {
      const mockResponse = {
        id: 'abc123',
        projectId: 'proj01',
        artifactName: 'my-feature',
        environment: 'dev',
        state: 'active' as const,
        createdAt: '2024-01-17T12:00:00Z',
        updatedAt: '2024-01-17T13:00:00Z',
        urls: {
          cui: 'http://localhost:3001',
          mastra: 'http://localhost:4111',
          astro: null,
          vscode: 'http://localhost:8080',
        },
      };

      mockFetch(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await client.resumeSession('abc123');

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions/abc123/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    test('throws ApiError for 400 already active', async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Session is already active: abc123' }), {
            status: 400,
          })
        )
      );

      try {
        await client.resumeSession('abc123');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(400);
      }
    });
  });
});
