import { describe, expect, test, mock, beforeEach } from 'bun:test';

/**
 * T084: Unit test for session suspend service
 *
 * Tests the suspend logic:
 * 1. Commit and push changes to branch
 * 2. Update session status
 * 3. Terminate sandbox container
 * 4. Return branch/commit info for later resume
 */
describe('SessionSuspendService', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('suspend', () => {
    test('should commit changes with provided message', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      const mockSandboxClient = {
        exec: mock(() =>
          Promise.resolve({ exitCode: 0, stdout: 'abc123\n', stderr: '' })
        ),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
            })),
          })),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      const result = await service.suspend('session-123', 'WIP: suspend for later');

      expect(result.commitSha).toBeDefined();
      expect(result.branch).toBeDefined();
    });

    test('should push changes to remote branch', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      let pushCalled = false;
      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git push')) {
            pushCalled = true;
          }
          return Promise.resolve({ exitCode: 0, stdout: 'abc123\n', stderr: '' });
        }),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
            })),
          })),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      await service.suspend('session-123', 'WIP: suspend for later');

      expect(pushCalled).toBe(true);
    });

    test('should update session status to suspended', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      let statusUpdate: { state?: string } = {};
      const mockSandboxClient = {
        exec: mock(() =>
          Promise.resolve({ exitCode: 0, stdout: 'abc123\n', stderr: '' })
        ),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock((data: { state?: string }) => {
            statusUpdate = data;
            return {
              where: mock(() => ({
                execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
              })),
            };
          }),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      await service.suspend('session-123', 'WIP');

      expect(statusUpdate.state).toBe('suspended');
    });

    test('should stop sandbox container after pushing', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      let stopCalled = false;
      const mockSandboxClient = {
        exec: mock(() =>
          Promise.resolve({ exitCode: 0, stdout: 'abc123\n', stderr: '' })
        ),
        stop: mock(() => {
          stopCalled = true;
          return Promise.resolve();
        }),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
            })),
          })),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      await service.suspend('session-123', 'WIP');

      expect(stopCalled).toBe(true);
    });

    test('should return branch and commit info', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git rev-parse HEAD')) {
            return Promise.resolve({ exitCode: 0, stdout: 'abc123def456\n', stderr: '' });
          }
          if (cmd.includes('git branch --show-current')) {
            return Promise.resolve({ exitCode: 0, stdout: 'mg/session-123\n', stderr: '' });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
            })),
          })),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      const result = await service.suspend('session-123', 'WIP');

      expect(result.commitSha).toBe('abc123def456');
      expect(result.branch).toBe('mg/session-123');
    });

    test('should throw if commit fails', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git commit')) {
            return Promise.resolve({
              exitCode: 1,
              stdout: '',
              stderr: 'fatal: nothing to commit',
            });
          }
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {};

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);

      await expect(service.suspend('session-123', 'WIP')).rejects.toThrow();
    });

    test('should throw if push fails', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      const mockSandboxClient = {
        exec: mock((cmd: string) => {
          if (cmd.includes('git push')) {
            return Promise.resolve({
              exitCode: 1,
              stdout: '',
              stderr: 'fatal: push failed',
            });
          }
          return Promise.resolve({ exitCode: 0, stdout: 'abc123\n', stderr: '' });
        }),
        stop: mock(() => Promise.resolve()),
      };

      const mockDb = {};

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);

      await expect(service.suspend('session-123', 'WIP')).rejects.toThrow();
    });
  });

  describe('resume', () => {
    test('should restart sandbox from existing branch', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      let startCalled = false;
      const mockSandboxClient = {
        start: mock(() => {
          startCalled = true;
          return Promise.resolve();
        }),
        exec: mock(() =>
          Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
        ),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
            })),
          })),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      await service.resume('session-123', 'mg/session-123');

      expect(startCalled).toBe(true);
    });

    test('should update session status to active', async () => {
      const { SessionSuspendService } = await import('../../../src/services/session-suspend.ts');

      let statusUpdate: { state?: string } = {};
      const mockSandboxClient = {
        start: mock(() => Promise.resolve()),
        exec: mock(() =>
          Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
        ),
      };

      const mockDb = {
        updateTable: mock(() => ({
          set: mock((data: { state?: string }) => {
            statusUpdate = data;
            return {
              where: mock(() => ({
                execute: mock(() => Promise.resolve([{ numUpdatedRows: 1n }])),
              })),
            };
          }),
        })),
      };

      const service = new SessionSuspendService(mockDb as never, mockSandboxClient as never);
      await service.resume('session-123', 'mg/session-123');

      expect(statusUpdate.state).toBe('active');
    });
  });
});
