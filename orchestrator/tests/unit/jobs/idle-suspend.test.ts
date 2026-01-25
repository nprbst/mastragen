import { beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * T034: Unit tests for IdleSuspendJob
 *
 * Tests idle detection and suspension:
 * 1. Detect idle sessions
 * 2. Issue warnings before timeout
 * 3. Auto-suspend with reason 'auto'
 * 4. Respect per-project config
 */
describe('IdleSuspendJob', () => {
  beforeEach(() => {
    mock.restore();
  });

  function createMockDb(options: {
    sessions?: Array<{
      id: string;
      project_id: string;
      state: string;
      last_activity_at: string;
    }>;
    projectIdleConfig?: {
      id: string;
      project_id: string;
      idle_timeout_minutes: number;
      warning_minutes: number;
      enabled: number;
    } | null;
    globalIdleConfig?: {
      id: string;
      project_id: null;
      idle_timeout_minutes: number;
      warning_minutes: number;
      enabled: number;
    };
    onUpdate?: (values: Record<string, unknown>) => void;
  }) {
    const { sessions = [], projectIdleConfig = null, globalIdleConfig, onUpdate } = options;

    return {
      selectFrom: mock((table: string) => ({
        selectAll: mock(() => ({
          where: mock((col: string, op: string, value: unknown) => {
            if (table === 'sessions') {
              if (col === 'state') {
                return {
                  where: mock(() => ({
                    limit: mock(() => ({
                      execute: mock(() => Promise.resolve(sessions)),
                    })),
                  })),
                };
              }
              if (col === 'id') {
                return {
                  executeTakeFirst: mock(() =>
                    Promise.resolve(sessions.find((s) => s.id === value))
                  ),
                };
              }
            }

            if (table === 'idle_config') {
              if (col === 'project_id') {
                if (op === 'is' && value === null) {
                  return {
                    executeTakeFirst: mock(() =>
                      Promise.resolve(
                        globalIdleConfig
                          ? {
                              ...globalIdleConfig,
                              created_at: '2026-01-21T00:00:00Z',
                              updated_at: '2026-01-21T00:00:00Z',
                            }
                          : undefined
                      )
                    ),
                  };
                }
                if (op === '=') {
                  return {
                    executeTakeFirst: mock(() =>
                      Promise.resolve(
                        projectIdleConfig && projectIdleConfig.project_id === value
                          ? {
                              ...projectIdleConfig,
                              created_at: '2026-01-21T00:00:00Z',
                              updated_at: '2026-01-21T00:00:00Z',
                            }
                          : undefined
                      )
                    ),
                  };
                }
              }
            }

            return {
              executeTakeFirst: mock(() => Promise.resolve(undefined)),
              execute: mock(() => Promise.resolve([])),
              limit: mock(() => ({
                execute: mock(() => Promise.resolve([])),
              })),
            };
          }),
        })),
      })),
      updateTable: mock(() => ({
        set: mock((values: Record<string, unknown>) => {
          onUpdate?.(values);
          return {
            where: mock(() => ({
              execute: mock(() => Promise.resolve()),
            })),
          };
        }),
      })),
    };
  }

  describe('run', () => {
    test('should suspend session that exceeds idle timeout', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      let updatedState = '';
      let updatedReason = '';

      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: thirtyFiveMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
        onUpdate: (values) => {
          if (values.state) updatedState = values.state as string;
          if (values.suspension_reason) updatedReason = values.suspension_reason as string;
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(1);
      expect(updatedState).toBe('suspended');
      expect(updatedReason).toBe('auto');
    });

    test('should warn session approaching timeout', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      let updateCalled = false;

      const twentySixMinutesAgo = new Date(Date.now() - 26 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: twentySixMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
        onUpdate: () => {
          updateCalled = true;
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const result = await job.run();

      expect(result.sessionsWarned).toBe(1);
      expect(result.sessionsSuspended).toBe(0);
      expect(updateCalled).toBe(true);
    });

    test('should skip sessions with disabled idle config', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: thirtyFiveMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 0,
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(0);
      expect(result.sessionsWarned).toBe(0);
    });

    test('should not suspend active session within timeout', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: tenMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const result = await job.run();

      expect(result.sessionsSuspended).toBe(0);
      expect(result.sessionsWarned).toBe(0);
    });
  });

  describe('getIdleStatus', () => {
    test('should return idle status for active session', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: tenMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const status = await job.getIdleStatus('session-123');

      expect(status).not.toBeNull();
      expect(status?.sessionId).toBe('session-123');
      expect(status?.state).toBe('active');
      expect(status?.idleTimeoutMinutes).toBe(30);
      expect(status?.warningMinutes).toBe(5);
      expect(status?.idleSinceMinutes).toBeGreaterThanOrEqual(10);
      expect(status?.warningIssued).toBe(false);
    });

    test('should return null for non-existent session', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      const mockDb = createMockDb({
        sessions: [],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const status = await job.getIdleStatus('non-existent');

      expect(status).toBeNull();
    });

    test('should indicate warning issued when approaching timeout', async () => {
      const { IdleSuspendJob } = await import('../../../src/jobs/idle-suspend.ts');

      const twentySixMinutesAgo = new Date(Date.now() - 26 * 60 * 1000).toISOString();

      const mockDb = createMockDb({
        sessions: [
          {
            id: 'session-123',
            project_id: 'project-1',
            state: 'active',
            last_activity_at: twentySixMinutesAgo,
          },
        ],
        globalIdleConfig: {
          id: 'idle-config-global',
          project_id: null,
          idle_timeout_minutes: 30,
          warning_minutes: 5,
          enabled: 1,
        },
      });

      const job = new IdleSuspendJob(mockDb as never);
      const status = await job.getIdleStatus('session-123');

      expect(status?.warningIssued).toBe(true);
      expect(status?.suspendAt).not.toBeNull();
    });
  });
});
