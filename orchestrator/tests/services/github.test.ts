import { describe, expect, it, mock } from 'bun:test';
import { GitHubAPIError, GitHubService } from '../../src/services/github.ts';

// Mock Octokit
const mockOctokit = {
  repos: {
    getCollaboratorPermissionLevel: mock(() =>
      Promise.resolve({
        data: {
          permission: 'write',
          user: { login: 'testuser' },
        },
      })
    ),
    get: mock(() =>
      Promise.resolve({
        data: {
          clone_url: 'https://github.com/owner/repo.git',
          default_branch: 'main',
        },
      })
    ),
  },
  pulls: {
    create: mock(() =>
      Promise.resolve({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          state: 'open',
        },
      })
    ),
    get: mock(() =>
      Promise.resolve({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          state: 'open',
        },
      })
    ),
  },
  rest: {
    repos: {
      getCollaboratorPermissionLevel: mock(() =>
        Promise.resolve({
          data: {
            permission: 'write',
            user: { login: 'testuser' },
          },
        })
      ),
      get: mock(() =>
        Promise.resolve({
          data: {
            clone_url: 'https://github.com/owner/repo.git',
            default_branch: 'main',
          },
        })
      ),
    },
    pulls: {
      create: mock(() =>
        Promise.resolve({
          data: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            title: 'Test PR',
            state: 'open',
          },
        })
      ),
      get: mock(() =>
        Promise.resolve({
          data: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            title: 'Test PR',
            state: 'open',
          },
        })
      ),
    },
  },
};

describe('GitHubService', () => {
  describe('parseRepo', () => {
    it('parses owner/repo format', () => {
      const result = GitHubService.parseRepo('owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses full GitHub URL', () => {
      const result = GitHubService.parseRepo('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses GitHub URL with .git suffix', () => {
      const result = GitHubService.parseRepo('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('throws on invalid format', () => {
      expect(() => GitHubService.parseRepo('invalid')).toThrow();
    });
  });

  describe('checkUserPermissions', () => {
    it('returns permissions for user with write access', async () => {
      const service = new GitHubService({
        octokit: mockOctokit as any,
      });

      const permissions = await service.checkUserPermissions('owner', 'repo', 'testuser');

      expect(permissions.canRead).toBe(true);
      expect(permissions.canWrite).toBe(true);
      expect(permissions.canAdmin).toBe(false);
    });

    it('returns permissions for user with admin access', async () => {
      const adminMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          repos: {
            ...mockOctokit.rest.repos,
            getCollaboratorPermissionLevel: mock(() =>
              Promise.resolve({
                data: {
                  permission: 'admin',
                  user: { login: 'adminuser' },
                },
              })
            ),
          },
        },
      };

      const service = new GitHubService({
        octokit: adminMock as any,
      });

      const permissions = await service.checkUserPermissions('owner', 'repo', 'adminuser');

      expect(permissions.canRead).toBe(true);
      expect(permissions.canWrite).toBe(true);
      expect(permissions.canAdmin).toBe(true);
    });

    it('returns read-only for user with read access', async () => {
      const readOnlyMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          repos: {
            ...mockOctokit.rest.repos,
            getCollaboratorPermissionLevel: mock(() =>
              Promise.resolve({
                data: {
                  permission: 'read',
                  user: { login: 'reader' },
                },
              })
            ),
          },
        },
      };

      const service = new GitHubService({
        octokit: readOnlyMock as any,
      });

      const permissions = await service.checkUserPermissions('owner', 'repo', 'reader');

      expect(permissions.canRead).toBe(true);
      expect(permissions.canWrite).toBe(false);
      expect(permissions.canAdmin).toBe(false);
    });

    it('throws GitHubAPIError on API failure', async () => {
      const errorMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          repos: {
            ...mockOctokit.rest.repos,
            getCollaboratorPermissionLevel: mock(() => Promise.reject(new Error('Not Found'))),
          },
        },
      };

      const service = new GitHubService({
        octokit: errorMock as any,
      });

      await expect(service.checkUserPermissions('owner', 'repo', 'testuser')).rejects.toThrow(
        GitHubAPIError
      );
    });
  });

  describe('createPullRequest', () => {
    it('creates a pull request', async () => {
      const service = new GitHubService({
        octokit: mockOctokit as any,
      });

      const result = await service.createPullRequest({
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        head: 'feature-branch',
        base: 'main',
        body: 'Test description',
      });

      expect(result.number).toBe(42);
      expect(result.url).toBe('https://github.com/owner/repo/pull/42');
      expect(result.title).toBe('Test PR');
      expect(result.state).toBe('open');
    });

    it('throws GitHubAPIError on failure', async () => {
      const errorMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          pulls: {
            ...mockOctokit.rest.pulls,
            create: mock(() => Promise.reject(new Error('Validation failed'))),
          },
        },
      };

      const service = new GitHubService({
        octokit: errorMock as any,
      });

      await expect(
        service.createPullRequest({
          owner: 'owner',
          repo: 'repo',
          title: 'Test PR',
          head: 'feature-branch',
          base: 'main',
        })
      ).rejects.toThrow(GitHubAPIError);
    });
  });

  describe('getPullRequest', () => {
    it('gets pull request details', async () => {
      const service = new GitHubService({
        octokit: mockOctokit as any,
      });

      const result = await service.getPullRequest('owner', 'repo', 42);

      expect(result.number).toBe(42);
      expect(result.url).toBe('https://github.com/owner/repo/pull/42');
      expect(result.state).toBe('open');
    });
  });

  describe('getCloneUrl', () => {
    it('returns clone URL with token', async () => {
      const mockWithToken = {
        ...mockOctokit,
        auth: mock(() =>
          Promise.resolve({
            token: 'ghs_testtoken123',
          })
        ),
      };

      const service = new GitHubService({
        octokit: mockWithToken as any,
        getInstallationToken: async () => 'ghs_testtoken123',
      });

      const url = await service.getCloneUrl('owner', 'repo');

      expect(url).toContain('github.com');
      expect(url).toContain('owner/repo');
    });
  });

  describe('rate limiting', () => {
    it('retries on rate limit error', async () => {
      let callCount = 0;
      const rateLimitMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          repos: {
            ...mockOctokit.rest.repos,
            getCollaboratorPermissionLevel: mock(() => {
              callCount++;
              if (callCount < 3) {
                const error = new Error('API rate limit exceeded');
                (error as any).status = 403;
                (error as any).response = {
                  headers: { 'x-ratelimit-remaining': '0' },
                };
                return Promise.reject(error);
              }
              return Promise.resolve({
                data: {
                  permission: 'write',
                  user: { login: 'testuser' },
                },
              });
            }),
          },
        },
      };

      const service = new GitHubService({
        octokit: rateLimitMock as any,
        maxRetries: 3,
        retryDelayMs: 10, // Short delay for tests
      });

      const permissions = await service.checkUserPermissions('owner', 'repo', 'testuser');

      expect(permissions.canWrite).toBe(true);
      expect(callCount).toBe(3);
    });

    it('gives up after max retries', async () => {
      const alwaysFailMock = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          repos: {
            ...mockOctokit.rest.repos,
            getCollaboratorPermissionLevel: mock(() => {
              const error = new Error('API rate limit exceeded');
              (error as any).status = 403;
              (error as any).response = {
                headers: { 'x-ratelimit-remaining': '0' },
              };
              return Promise.reject(error);
            }),
          },
        },
      };

      const service = new GitHubService({
        octokit: alwaysFailMock as any,
        maxRetries: 2,
        retryDelayMs: 10,
      });

      await expect(service.checkUserPermissions('owner', 'repo', 'testuser')).rejects.toThrow(
        GitHubAPIError
      );
    });
  });
});
