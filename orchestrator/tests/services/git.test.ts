import { describe, expect, it, mock } from 'bun:test';
import type Docker from 'dockerode';
import {
  GitService,
  GitOperationError,
} from '../../src/services/git.ts';

// Helper to create a mock exec that simulates Docker exec behavior
function createMockExec(stdout: string, exitCode = 0) {
  return mock(() =>
    Promise.resolve({
      start: (
        _opts: { hijack: boolean; stdin: boolean },
        callback: (err: Error | null, stream: unknown) => void
      ) => {
        const mockStream = {
          on: (event: string, handler: (data?: Buffer) => void) => {
            if (event === 'data' && stdout) {
              handler(Buffer.from(stdout));
            }
            if (event === 'end') {
              setTimeout(() => handler(), 0);
            }
            if (event === 'error') {
              // No error
            }
            return mockStream;
          },
        };
        callback(null, mockStream);
      },
      inspect: mock(() => Promise.resolve({ ExitCode: exitCode })),
    })
  );
}

// Helper to create a mock exec that rejects
function createMockExecError(errorMessage: string) {
  return mock(() => Promise.reject(new Error(errorMessage)));
}

describe('GitService', () => {
  const testContainerId = 'test-container-123';
  const testWorkspacePath = '/workspace';

  describe('getStatus', () => {
    it('returns clean status when no changes', async () => {
      const mockExec = createMockExec('');
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const status = await gitService.getStatus();

      expect(status.hasChanges).toBe(false);
      expect(status.staged).toEqual([]);
      expect(status.unstaged).toEqual([]);
      expect(status.untracked).toEqual([]);
    });

    it('returns changes when files are modified', async () => {
      const gitStatusOutput = ` M src/index.ts
?? new-file.ts
A  staged-file.ts`;

      const mockExec = createMockExec(gitStatusOutput);
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const status = await gitService.getStatus();

      expect(status.hasChanges).toBe(true);
      expect(status.unstaged).toContain('src/index.ts');
      expect(status.untracked).toContain('new-file.ts');
      expect(status.staged).toContain('staged-file.ts');
    });

    it('throws GitOperationError on exec failure', async () => {
      const mockExec = createMockExecError('Container not running');
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(gitService.getStatus()).rejects.toThrow(GitOperationError);
    });
  });

  describe('commitAll', () => {
    it('stages all changes and creates commit', async () => {
      let callCount = 0;
      const mockExec = mock(() => {
        callCount++;
        if (callCount === 1) {
          // git add -A
          return Promise.resolve({
            start: (
              _opts: unknown,
              cb: (err: null, stream: unknown) => void
            ) => {
              const stream = {
                on: (event: string, handler: () => void) => {
                  if (event === 'end') setTimeout(handler, 0);
                  return stream;
                },
              };
              cb(null, stream);
            },
            inspect: () => Promise.resolve({ ExitCode: 0 }),
          });
        }
        if (callCount === 2) {
          // git commit
          return Promise.resolve({
            start: (
              _opts: unknown,
              cb: (err: null, stream: unknown) => void
            ) => {
              const stream = {
                on: (event: string, handler: (data?: Buffer) => void) => {
                  if (event === 'data')
                    handler(Buffer.from('[main abc1234] Test commit'));
                  if (event === 'end') setTimeout(() => handler(), 0);
                  return stream;
                },
              };
              cb(null, stream);
            },
            inspect: () => Promise.resolve({ ExitCode: 0 }),
          });
        }
        // git rev-parse HEAD
        return Promise.resolve({
          start: (
            _opts: unknown,
            cb: (err: null, stream: unknown) => void
          ) => {
            const stream = {
              on: (event: string, handler: (data?: Buffer) => void) => {
                if (event === 'data')
                  handler(
                    Buffer.from('abc1234567890abcdef1234567890abcdef123456\n')
                  );
                if (event === 'end') setTimeout(() => handler(), 0);
                return stream;
              },
            };
            cb(null, stream);
          },
          inspect: () => Promise.resolve({ ExitCode: 0 }),
        });
      });

      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const result = await gitService.commitAll('Test commit');

      expect(result).not.toBeNull();
      expect(result?.sha).toBe('abc1234567890abcdef1234567890abcdef123456');
      expect(result?.message).toBe('Test commit');
    });

    it('returns null when there are no changes to commit', async () => {
      let callCount = 0;
      const mockExec = mock(() => {
        callCount++;
        if (callCount === 1) {
          // git add -A
          return Promise.resolve({
            start: (
              _opts: unknown,
              cb: (err: null, stream: unknown) => void
            ) => {
              const stream = {
                on: (event: string, handler: () => void) => {
                  if (event === 'end') setTimeout(handler, 0);
                  return stream;
                },
              };
              cb(null, stream);
            },
            inspect: () => Promise.resolve({ ExitCode: 0 }),
          });
        }
        // git commit - nothing to commit
        return Promise.resolve({
          start: (
            _opts: unknown,
            cb: (err: null, stream: unknown) => void
          ) => {
            const stream = {
              on: (event: string, handler: (data?: Buffer) => void) => {
                if (event === 'data')
                  handler(
                    Buffer.from('nothing to commit, working tree clean')
                  );
                if (event === 'end') setTimeout(() => handler(), 0);
                return stream;
              },
            };
            cb(null, stream);
          },
          inspect: () => Promise.resolve({ ExitCode: 1 }),
        });
      });

      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const result = await gitService.commitAll('Test commit');

      expect(result).toBeNull();
    });
  });

  describe('createBranch', () => {
    it('creates a new branch from base', async () => {
      const mockExec = createMockExec(
        "Switched to a new branch 'feature-branch'"
      );
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(
        gitService.createBranch('feature-branch', 'main')
      ).resolves.toBeUndefined();
    });
  });

  describe('push', () => {
    it('pushes branch to origin', async () => {
      const mockExec = createMockExec(
        "To github.com:org/repo.git\n * [new branch]      feature-branch -> feature-branch"
      );
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(gitService.push('feature-branch')).resolves.toBeUndefined();
    });
  });

  describe('clone', () => {
    it('clones repository to workspace', async () => {
      const mockExec = createMockExec("Cloning into '/workspace'...\ndone.");
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(
        gitService.clone('https://github.com/org/repo.git')
      ).resolves.toBeUndefined();
    });

    it('clones specific branch when provided', async () => {
      const mockExec = createMockExec("Cloning into '/workspace'...\ndone.");
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(
        gitService.clone('https://github.com/org/repo.git', 'feature-branch')
      ).resolves.toBeUndefined();
    });
  });

  describe('checkout', () => {
    it('checks out a branch', async () => {
      const mockExec = createMockExec("Switched to branch 'main'");
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(gitService.checkout('main')).resolves.toBeUndefined();
    });

    it('checks out a specific commit SHA', async () => {
      const mockExec = createMockExec(
        'HEAD is now at abc1234 Previous commit message'
      );
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(
        gitService.checkout('abc1234567890abcdef1234567890abcdef123456')
      ).resolves.toBeUndefined();
    });
  });

  describe('ensureGitAttributes', () => {
    it('adds .claude-history/ export-ignore to .gitattributes when not present', async () => {
      let callCount = 0;
      const mockExec = mock(() => {
        callCount++;
        if (callCount === 1) {
          // git show - file doesn't contain the entry
          return Promise.resolve({
            start: (
              _opts: unknown,
              cb: (err: null, stream: unknown) => void
            ) => {
              const stream = {
                on: (event: string, handler: (data?: Buffer) => void) => {
                  if (event === 'data') handler(Buffer.from('*.log text\n'));
                  if (event === 'end') setTimeout(() => handler(), 0);
                  return stream;
                },
              };
              cb(null, stream);
            },
            inspect: () => Promise.resolve({ ExitCode: 0 }),
          });
        }
        // Shell command to append
        return Promise.resolve({
          start: (
            _opts: unknown,
            cb: (err: null, stream: unknown) => void
          ) => {
            const stream = {
              on: (event: string, handler: () => void) => {
                if (event === 'end') setTimeout(handler, 0);
                return stream;
              },
            };
            cb(null, stream);
          },
          inspect: () => Promise.resolve({ ExitCode: 0 }),
        });
      });

      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(gitService.ensureGitAttributes()).resolves.toBeUndefined();
      expect(callCount).toBe(2);
    });

    it('skips if .claude-history/ export-ignore already exists', async () => {
      let callCount = 0;
      const mockExec = mock(() => {
        callCount++;
        // git show - already contains the entry
        return Promise.resolve({
          start: (
            _opts: unknown,
            cb: (err: null, stream: unknown) => void
          ) => {
            const stream = {
              on: (event: string, handler: (data?: Buffer) => void) => {
                if (event === 'data')
                  handler(Buffer.from('.claude-history/ export-ignore\n'));
                if (event === 'end') setTimeout(() => handler(), 0);
                return stream;
              },
            };
            cb(null, stream);
          },
          inspect: () => Promise.resolve({ ExitCode: 0 }),
        });
      });

      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      await expect(gitService.ensureGitAttributes()).resolves.toBeUndefined();
      // Should only call git show once, no append needed
      expect(callCount).toBe(1);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name', async () => {
      const mockExec = createMockExec('feature-branch\n');
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const branch = await gitService.getCurrentBranch();
      expect(branch).toBe('feature-branch');
    });
  });

  describe('getCurrentSha', () => {
    it('returns current commit SHA', async () => {
      const mockExec = createMockExec(
        'abc1234567890abcdef1234567890abcdef123456\n'
      );
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const sha = await gitService.getCurrentSha();
      expect(sha).toBe('abc1234567890abcdef1234567890abcdef123456');
    });
  });

  describe('getCommitCount', () => {
    it('returns commit count', async () => {
      const mockExec = createMockExec('42\n');
      const mockDocker = {
        getContainer: () => ({ exec: mockExec }),
      } as unknown as Docker;

      const gitService = new GitService({
        docker: mockDocker,
        containerId: testContainerId,
        workspacePath: testWorkspacePath,
      });

      const count = await gitService.getCommitCount();
      expect(count).toBe(42);
    });
  });
});
