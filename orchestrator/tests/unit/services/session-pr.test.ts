import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * T085: Unit test for session PR service
 *
 * Tests the PR creation logic:
 * 1. Push current branch to remote
 * 2. Create PR via GitHub API
 * 3. Return PR URL
 */
describe('SessionPrService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createPr', () => {
    test('should push current branch before creating PR', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      let pushCalled = false;
      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git push')) {
            pushCalled = true;
          }
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              html_url: 'https://github.com/owner/repo/pull/1',
              number: 1,
            }),
            { status: 201 }
          )
        )
      ) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);
      await service.createPr({
        sessionId: 'session-123',
        title: 'Add feature X',
        body: 'Description',
        repo: 'owner/repo',
        base: 'main',
        accessToken: 'gho_test',
      });

      expect(pushCalled).toBe(true);
    });

    test('should create PR via GitHub API', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      let apiCalled = false;
      let apiBody: { title?: string; body?: string; head?: string; base?: string } = {};
      globalThis.fetch = mock((url: string, opts?: RequestInit) => {
        if (url.includes('/pulls')) {
          apiCalled = true;
          apiBody = JSON.parse((opts?.body as string) || '{}');
          return Promise.resolve(
            new Response(
              JSON.stringify({
                html_url: 'https://github.com/owner/repo/pull/1',
                number: 1,
              }),
              { status: 201 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);
      await service.createPr({
        sessionId: 'session-123',
        title: 'Add feature X',
        body: 'Description of changes',
        repo: 'owner/repo',
        base: 'main',
        accessToken: 'gho_test',
      });

      expect(apiCalled).toBe(true);
      expect(apiBody.title).toBe('Add feature X');
      expect(apiBody.body).toBe('Description of changes');
      expect(apiBody.head).toBe('mg/session-123');
      expect(apiBody.base).toBe('main');
    });

    test('should return PR URL on success', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              html_url: 'https://github.com/owner/repo/pull/42',
              number: 42,
            }),
            { status: 201 }
          )
        )
      ) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);
      const result = await service.createPr({
        sessionId: 'session-123',
        title: 'Add feature X',
        body: 'Description',
        repo: 'owner/repo',
        base: 'main',
        accessToken: 'gho_test',
      });

      expect(result.url).toBe('https://github.com/owner/repo/pull/42');
      expect(result.number).toBe(42);
    });

    test('should include authorization header', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      let authHeader = '';
      globalThis.fetch = mock((_url: string, opts?: RequestInit) => {
        const headers = opts?.headers as Record<string, string>;
        authHeader = headers?.Authorization || '';
        return Promise.resolve(
          new Response(
            JSON.stringify({ html_url: 'https://github.com/owner/repo/pull/1', number: 1 }),
            { status: 201 }
          )
        );
      }) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);
      await service.createPr({
        sessionId: 'session-123',
        title: 'Test PR',
        body: 'Test',
        repo: 'owner/repo',
        base: 'main',
        accessToken: 'gho_my_token',
      });

      expect(authHeader).toBe('Bearer gho_my_token');
    });

    test('should throw if push fails', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git push')) {
            return Promise.resolve({
              exitCode: 1,
              stdout: '',
              stderr: 'fatal: push failed',
            });
          }
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      const service = new SessionPrService(mockSandboxClient as never);

      await expect(
        service.createPr({
          sessionId: 'session-123',
          title: 'Test PR',
          body: 'Test',
          repo: 'owner/repo',
          base: 'main',
          accessToken: 'gho_test',
        })
      ).rejects.toThrow();
    });

    test('should throw if GitHub API returns error', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Validation Failed', errors: [] }), {
            status: 422,
          })
        )
      ) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);

      await expect(
        service.createPr({
          sessionId: 'session-123',
          title: 'Test PR',
          body: 'Test',
          repo: 'owner/repo',
          base: 'main',
          accessToken: 'gho_test',
        })
      ).rejects.toThrow();
    });

    test('should handle PR already exists error', async () => {
      const { SessionPrService } = await import('../../../src/services/session-pr.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: 'Validation Failed',
              errors: [{ message: 'A pull request already exists' }],
            }),
            { status: 422 }
          )
        )
      ) as unknown as typeof fetch;

      const service = new SessionPrService(mockSandboxClient as never);

      await expect(
        service.createPr({
          sessionId: 'session-123',
          title: 'Test PR',
          body: 'Test',
          repo: 'owner/repo',
          base: 'main',
          accessToken: 'gho_test',
        })
      ).rejects.toThrow(/already exists/);
    });
  });
});
