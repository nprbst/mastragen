import { beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * T035: Unit tests for IdleConfigService
 *
 * Tests idle configuration management:
 * 1. Get global config
 * 2. Update global config
 * 3. Get project-specific config
 * 4. Set project config
 * 5. Delete project config
 * 6. Get effective config (project > global fallback)
 */
describe('IdleConfigService', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('getGlobalConfig', () => {
    test('should return global config when project_id is null', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'idle-config-global',
                  project_id: null,
                  idle_timeout_minutes: 30,
                  warning_minutes: 5,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                })
              ),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getGlobalConfig();

      expect(result).not.toBeNull();
      expect(result?.idleTimeoutMinutes).toBe(30);
      expect(result?.warningMinutes).toBe(5);
      expect(result?.enabled).toBe(true);
      expect(result?.projectId).toBeNull();
    });

    test('should return null when no global config exists', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => Promise.resolve(undefined)),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getGlobalConfig();

      expect(result).toBeNull();
    });
  });

  describe('updateGlobalConfig', () => {
    test('should update global config values', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let updatedValues: Record<string, unknown> = {};

      const mockDb = {
        updateTable: mock(() => ({
          set: mock((values: Record<string, unknown>) => {
            updatedValues = values;
            return {
              where: mock(() => ({
                execute: mock(() => Promise.resolve()),
              })),
            };
          }),
        })),
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'idle-config-global',
                  project_id: null,
                  idle_timeout_minutes: 45,
                  warning_minutes: 10,
                  enabled: 0,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T01:00:00Z',
                })
              ),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.updateGlobalConfig({
        idleTimeoutMinutes: 45,
        warningMinutes: 10,
        enabled: false,
      });

      expect(updatedValues.idle_timeout_minutes).toBe(45);
      expect(updatedValues.warning_minutes).toBe(10);
      expect(updatedValues.enabled).toBe(0);
      expect(result.idleTimeoutMinutes).toBe(45);
      expect(result.warningMinutes).toBe(10);
      expect(result.enabled).toBe(false);
    });

    test('should only update provided fields', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let updatedValues: Record<string, unknown> = {};

      const mockDb = {
        updateTable: mock(() => ({
          set: mock((values: Record<string, unknown>) => {
            updatedValues = values;
            return {
              where: mock(() => ({
                execute: mock(() => Promise.resolve()),
              })),
            };
          }),
        })),
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'idle-config-global',
                  project_id: null,
                  idle_timeout_minutes: 60,
                  warning_minutes: 5,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T01:00:00Z',
                })
              ),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      await service.updateGlobalConfig({ idleTimeoutMinutes: 60 });

      expect(updatedValues.idle_timeout_minutes).toBe(60);
      expect(updatedValues.warning_minutes).toBeUndefined();
      expect(updatedValues.enabled).toBeUndefined();
    });
  });

  describe('getProjectConfig', () => {
    test('should return project-specific config', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'idle-config-proj1',
                  project_id: 'project-123',
                  idle_timeout_minutes: 60,
                  warning_minutes: 10,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                })
              ),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getProjectConfig('project-123');

      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('project-123');
      expect(result?.idleTimeoutMinutes).toBe(60);
    });

    test('should return null when no project config exists', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => Promise.resolve(undefined)),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getProjectConfig('project-456');

      expect(result).toBeNull();
    });
  });

  describe('getEffectiveConfig', () => {
    test('should return project config when it exists', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock((_col: string, _op: string, value: string | null) => ({
              executeTakeFirst: mock(() => {
                if (value === 'project-123') {
                  return Promise.resolve({
                    id: 'idle-config-proj1',
                    project_id: 'project-123',
                    idle_timeout_minutes: 120,
                    warning_minutes: 15,
                    enabled: 1,
                    created_at: '2026-01-21T00:00:00Z',
                    updated_at: '2026-01-21T00:00:00Z',
                  });
                }
                return Promise.resolve({
                  id: 'idle-config-global',
                  project_id: null,
                  idle_timeout_minutes: 30,
                  warning_minutes: 5,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                });
              }),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getEffectiveConfig('project-123');

      expect(result.projectId).toBe('project-123');
      expect(result.idleTimeoutMinutes).toBe(120);
    });

    test('should fall back to global config when project config does not exist', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let callCount = 0;
      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => {
                callCount++;
                if (callCount === 1) {
                  return Promise.resolve(undefined);
                }
                return Promise.resolve({
                  id: 'idle-config-global',
                  project_id: null,
                  idle_timeout_minutes: 30,
                  warning_minutes: 5,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                });
              }),
            })),
          })),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.getEffectiveConfig('project-456');

      expect(result.projectId).toBeNull();
      expect(result.idleTimeoutMinutes).toBe(30);
    });
  });

  describe('setProjectConfig', () => {
    test('should create new project config when it does not exist', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let insertedValues: Record<string, unknown> = {};
      let callCount = 0;

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => {
                callCount++;
                if (callCount === 1) {
                  return Promise.resolve(undefined);
                }
                return Promise.resolve({
                  id: 'new-config-id',
                  project_id: 'project-123',
                  idle_timeout_minutes: 45,
                  warning_minutes: 10,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                });
              }),
            })),
          })),
        })),
        insertInto: mock(() => ({
          values: mock((values: Record<string, unknown>) => {
            insertedValues = values;
            return {
              execute: mock(() => Promise.resolve()),
            };
          }),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.setProjectConfig('project-123', {
        idleTimeoutMinutes: 45,
        warningMinutes: 10,
        enabled: true,
      });

      expect(insertedValues.project_id).toBe('project-123');
      expect(insertedValues.idle_timeout_minutes).toBe(45);
      expect(insertedValues.warning_minutes).toBe(10);
      expect(result.idleTimeoutMinutes).toBe(45);
    });

    test('should update existing project config', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let updatedValues: Record<string, unknown> = {};
      let callCount = 0;

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => {
                callCount++;
                return Promise.resolve({
                  id: 'existing-config',
                  project_id: 'project-123',
                  idle_timeout_minutes: callCount === 1 ? 30 : 60,
                  warning_minutes: callCount === 1 ? 5 : 15,
                  enabled: 1,
                  created_at: '2026-01-21T00:00:00Z',
                  updated_at: '2026-01-21T00:00:00Z',
                });
              }),
            })),
          })),
        })),
        updateTable: mock(() => ({
          set: mock((values: Record<string, unknown>) => {
            updatedValues = values;
            return {
              where: mock(() => ({
                execute: mock(() => Promise.resolve()),
              })),
            };
          }),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      const result = await service.setProjectConfig('project-123', {
        idleTimeoutMinutes: 60,
        warningMinutes: 15,
      });

      expect(updatedValues.idle_timeout_minutes).toBe(60);
      expect(updatedValues.warning_minutes).toBe(15);
      expect(result.idleTimeoutMinutes).toBe(60);
    });
  });

  describe('deleteProjectConfig', () => {
    test('should delete project config', async () => {
      const { IdleConfigService } = await import('../../../src/services/idle-config-service.ts');

      let deletedProjectId = '';
      const mockDb = {
        deleteFrom: mock(() => ({
          where: mock((_col: string, _op: string, projectId: string) => {
            deletedProjectId = projectId;
            return {
              execute: mock(() => Promise.resolve()),
            };
          }),
        })),
      };

      const service = new IdleConfigService(mockDb as never);
      await service.deleteProjectConfig('project-123');

      expect(deletedProjectId).toBe('project-123');
    });
  });
});
