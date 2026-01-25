import { beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * T086: Unit test for session share service
 *
 * Tests the share logic:
 * 1. Create share record in database
 * 2. Update Tailscale ACLs
 * 3. Return share URL/info
 */
describe('SessionShareService', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('share', () => {
    test('should create share record in database', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      let insertedData: {
        session_id?: string;
        shared_with_user_id?: string;
        shared_by_user_id?: string;
      } = {};
      const mockDb = {
        insertInto: mock(() => ({
          values: mock(
            (data: {
              session_id?: string;
              shared_with_user_id?: string;
              shared_by_user_id?: string;
            }) => {
              insertedData = data;
              return {
                execute: mock(() => Promise.resolve()),
              };
            }
          ),
        })),
      };

      const mockTailscale = {
        grantAccess: mock(() => Promise.resolve()),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      await service.share({
        sessionId: 'session-123',
        sharedWithUserId: 'user-789',
        sharedByUserId: 'user-456',
        sandboxHostname: 'sandbox-123.ts.net',
        sharedWithEmail: 'colleague@example.com',
      });

      expect(insertedData.session_id).toBe('session-123');
      expect(insertedData.shared_with_user_id).toBe('user-789');
      expect(insertedData.shared_by_user_id).toBe('user-456');
    });

    test('should call Tailscale to grant access', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      let grantCalled = false;
      let grantArgs: { email?: string; hostname?: string } = {};

      const mockDb = {
        insertInto: mock(() => ({
          values: mock(() => ({
            execute: mock(() => Promise.resolve()),
          })),
        })),
      };

      const mockTailscale = {
        grantAccess: mock((args: { email?: string; hostname?: string }) => {
          grantCalled = true;
          grantArgs = args;
          return Promise.resolve();
        }),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      await service.share({
        sessionId: 'session-123',
        sharedWithUserId: 'user-789',
        sharedByUserId: 'user-456',
        sandboxHostname: 'sandbox-123.ts.net',
        sharedWithEmail: 'colleague@example.com',
      });

      expect(grantCalled).toBe(true);
      expect(grantArgs.email).toBe('colleague@example.com');
      expect(grantArgs.hostname).toBe('sandbox-123.ts.net');
    });

    test('should return share info', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      const mockDb = {
        insertInto: mock(() => ({
          values: mock(() => ({
            execute: mock(() => Promise.resolve()),
          })),
        })),
      };

      const mockTailscale = {
        grantAccess: mock(() => Promise.resolve()),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      const result = await service.share({
        sessionId: 'session-123',
        sharedWithUserId: 'user-789',
        sharedByUserId: 'user-456',
        sandboxHostname: 'sandbox-123.ts.net',
        sharedWithEmail: 'colleague@example.com',
      });

      expect(result.shareId).toBeDefined();
      expect(result.sharedWithEmail).toBe('colleague@example.com');
      expect(result.accessUrl).toContain('sandbox-123.ts.net');
    });

    test('should generate unique share ID', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      const mockDb = {
        insertInto: mock(() => ({
          values: mock(() => ({
            execute: mock(() => Promise.resolve()),
          })),
        })),
      };

      const mockTailscale = {
        grantAccess: mock(() => Promise.resolve()),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);

      const result1 = await service.share({
        sessionId: 'session-123',
        sharedWithUserId: 'user-789',
        sharedByUserId: 'user-456',
        sandboxHostname: 'sandbox-123.ts.net',
        sharedWithEmail: 'user1@example.com',
      });

      const result2 = await service.share({
        sessionId: 'session-123',
        sharedWithUserId: 'user-790',
        sharedByUserId: 'user-456',
        sandboxHostname: 'sandbox-123.ts.net',
        sharedWithEmail: 'user2@example.com',
      });

      expect(result1.shareId).not.toBe(result2.shareId);
    });
  });

  describe('revoke', () => {
    test('should delete share record from database', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      let deletedId = '';
      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'share-123',
                  shared_with_email: 'colleague@example.com',
                })
              ),
            })),
          })),
        })),
        deleteFrom: mock(() => ({
          where: mock((col: string, _op: string, id: string) => {
            if (col === 'id') {
              deletedId = id;
            }
            return {
              execute: mock(() => Promise.resolve()),
            };
          }),
        })),
      };

      const mockTailscale = {
        revokeAccess: mock(() => Promise.resolve()),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      await service.revoke('share-123', 'sandbox-123.ts.net');

      expect(deletedId).toBe('share-123');
    });

    test('should delete the share record from database', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      let deleteCalled = false;

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() =>
                Promise.resolve({
                  id: 'share-123',
                  shared_with_user_id: 'user-789',
                  shared_by_user_id: 'user-456',
                  granted_at: '2024-01-01T00:00:00Z',
                })
              ),
            })),
          })),
        })),
        deleteFrom: mock(() => ({
          where: mock(() => ({
            execute: mock(() => {
              deleteCalled = true;
              return Promise.resolve();
            }),
          })),
        })),
      };

      const mockTailscale = {};

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      await service.revoke('share-123', 'sandbox-123.ts.net');

      expect(deleteCalled).toBe(true);
    });

    test('should throw if share not found', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              executeTakeFirst: mock(() => Promise.resolve(undefined)),
            })),
          })),
        })),
      };

      const mockTailscale = {
        revokeAccess: mock(() => Promise.resolve()),
      };

      const service = new SessionShareService(mockDb as never, mockTailscale as never);

      await expect(service.revoke('non-existent', 'sandbox.ts.net')).rejects.toThrow(/not found/);
    });
  });

  describe('listShares', () => {
    test('should return all shares for a session', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              execute: mock(() =>
                Promise.resolve([
                  {
                    id: 'share-1',
                    session_id: 'session-123',
                    shared_with_user_id: 'user-123',
                    shared_by_user_id: 'user-456',
                    granted_at: '2024-01-01T00:00:00Z',
                  },
                  {
                    id: 'share-2',
                    session_id: 'session-123',
                    shared_with_user_id: 'user-789',
                    shared_by_user_id: 'user-456',
                    granted_at: '2024-01-01T01:00:00Z',
                  },
                ])
              ),
            })),
          })),
        })),
      };

      const mockTailscale = {};

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      const shares = await service.listShares('session-123');

      expect(shares).toHaveLength(2);
      expect(shares[0]?.sharedWithUserId).toBe('user-123');
      expect(shares[1]?.sharedWithUserId).toBe('user-789');
    });

    test('should return empty array if no shares exist', async () => {
      const { SessionShareService } = await import('../../../src/services/session-share.ts');

      const mockDb = {
        selectFrom: mock(() => ({
          selectAll: mock(() => ({
            where: mock(() => ({
              execute: mock(() => Promise.resolve([])),
            })),
          })),
        })),
      };

      const mockTailscale = {};

      const service = new SessionShareService(mockDb as never, mockTailscale as never);
      const shares = await service.listShares('session-123');

      expect(shares).toHaveLength(0);
    });
  });
});
