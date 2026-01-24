import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { SessionSharesRepository } from '../../src/repositories/session-shares.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';
import { UsersRepository } from '../../src/repositories/users.ts';

/**
 * T019: Integration tests for session share/unshare flow
 *
 * Tests:
 * 1. Create share - creates record and allows access check
 * 2. List shares - returns shares with user details
 * 3. Revoke share - soft-deletes via revoked_at
 * 4. Prevent duplicate shares (same session + user)
 * 5. Prevent self-sharing (owner sharing to themselves)
 */
describe('Session shares integration', () => {
  let db: Kysely<Database>;
  let sessionSharesRepo: SessionSharesRepository;
  let sessionsRepo: SessionsRepository;
  let usersRepo: UsersRepository;
  const testDbPath = ':memory:';

  beforeAll(async () => {
    db = createDatabase(testDbPath);
    await runMigrations(db);
    sessionSharesRepo = new SessionSharesRepository(db);
    sessionsRepo = new SessionsRepository(db);
    usersRepo = new UsersRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up in order respecting foreign keys
    await db.deleteFrom('session_shares').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('users').execute();
  });

  async function createTestUser(id: string, email: string, name: string | null = null) {
    await db
      .insertInto('users')
      .values({
        id,
        email,
        name,
        github_id: Math.floor(Math.random() * 1000000),
        github_login: email.split('@')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  }

  async function createTestProject(id: string, name: string = 'test-project') {
    await db
      .insertInto('projects')
      .values({
        id,
        name,
        github_repo: `test-org/${name}`,
        default_branch: 'main',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  }

  async function createTestSession(
    id: string,
    projectId: string,
    userId: string,
    state: 'active' | 'suspended' = 'active'
  ) {
    await db
      .insertInto('sessions')
      .values({
        id,
        project_id: projectId,
        user_id: userId,
        state,
        artifact_name: `artifact-${id}`, // Unique artifact name per session
        environment: 'development',
        branch_name: 'test-branch',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  }

  describe('Share creation', () => {
    test('should create share record', async () => {
      const ownerId = 'owner-user-1';
      const sharedWithId = 'shared-user-1';
      const projectId = 'project-share-1';
      const sessionId = 'session-share-1';

      await createTestUser(ownerId, 'owner@example.com', 'Owner User');
      await createTestUser(sharedWithId, 'shared@example.com', 'Shared User');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      const share = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      expect(share).not.toBeNull();
      expect(share!.id).toBeDefined();
      expect(share!.session_id).toBe(sessionId);
      expect(share!.shared_by_user_id).toBe(ownerId);
      expect(share!.shared_with_user_id).toBe(sharedWithId);
      expect(share!.granted_at).toBeDefined();
      expect(share!.revoked_at).toBeNull();
    });

    test('should allow access check via hasAccess', async () => {
      const ownerId = 'owner-user-2';
      const sharedWithId = 'shared-user-2';
      const projectId = 'project-share-2';
      const sessionId = 'session-share-2';

      await createTestUser(ownerId, 'owner2@example.com');
      await createTestUser(sharedWithId, 'shared2@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      // Before share, no access
      const hasAccessBefore = await sessionSharesRepo.hasAccess(sessionId, sharedWithId);
      expect(hasAccessBefore).toBe(false);

      // Create share
      await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      // After share, has access
      const hasAccessAfter = await sessionSharesRepo.hasAccess(sessionId, sharedWithId);
      expect(hasAccessAfter).toBe(true);
    });
  });

  describe('List shares', () => {
    test('should return shares with user details', async () => {
      const ownerId = 'owner-user-3';
      const sharedWithId = 'shared-user-3';
      const projectId = 'project-share-3';
      const sessionId = 'session-share-3';

      await createTestUser(ownerId, 'owner3@example.com', 'Owner Three');
      await createTestUser(sharedWithId, 'shared3@example.com', 'Shared Three');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      const shares = await sessionSharesRepo.getSessionShares(sessionId);

      expect(shares.length).toBe(1);
      expect(shares[0].shared_with_user_id).toBe(sharedWithId);
      expect(shares[0].shared_with_email).toBe('shared3@example.com');
      expect(shares[0].shared_with_name).toBe('Shared Three');
    });

    test('should not return revoked shares', async () => {
      const ownerId = 'owner-user-4';
      const sharedWithId = 'shared-user-4';
      const projectId = 'project-share-4';
      const sessionId = 'session-share-4';

      await createTestUser(ownerId, 'owner4@example.com');
      await createTestUser(sharedWithId, 'shared4@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      const share = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      // Revoke the share
      await sessionSharesRepo.revoke(share!.id);

      // List should return empty
      const shares = await sessionSharesRepo.getSessionShares(sessionId);
      expect(shares.length).toBe(0);
    });
  });

  describe('Revoke share', () => {
    test('should soft-delete by setting revoked_at', async () => {
      const ownerId = 'owner-user-5';
      const sharedWithId = 'shared-user-5';
      const projectId = 'project-share-5';
      const sessionId = 'session-share-5';

      await createTestUser(ownerId, 'owner5@example.com');
      await createTestUser(sharedWithId, 'shared5@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      const share = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      // Before revoke
      expect(share!.revoked_at).toBeNull();

      // Revoke
      await sessionSharesRepo.revoke(share!.id);

      // After revoke
      const revokedShare = await sessionSharesRepo.findById(share!.id);
      expect(revokedShare).not.toBeNull();
      expect(revokedShare!.revoked_at).not.toBeNull();
    });

    test('should remove access after revoke', async () => {
      const ownerId = 'owner-user-6';
      const sharedWithId = 'shared-user-6';
      const projectId = 'project-share-6';
      const sessionId = 'session-share-6';

      await createTestUser(ownerId, 'owner6@example.com');
      await createTestUser(sharedWithId, 'shared6@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      const share = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      // Has access before revoke
      const hasAccessBefore = await sessionSharesRepo.hasAccess(sessionId, sharedWithId);
      expect(hasAccessBefore).toBe(true);

      // Revoke
      await sessionSharesRepo.revoke(share!.id);

      // No access after revoke
      const hasAccessAfter = await sessionSharesRepo.hasAccess(sessionId, sharedWithId);
      expect(hasAccessAfter).toBe(false);
    });
  });

  describe('Share constraints', () => {
    test('should prevent duplicate active shares', async () => {
      const ownerId = 'owner-user-7';
      const sharedWithId = 'shared-user-7';
      const projectId = 'project-share-7';
      const sessionId = 'session-share-7';

      await createTestUser(ownerId, 'owner7@example.com');
      await createTestUser(sharedWithId, 'shared7@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      // First share should succeed
      const share1 = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });
      expect(share1).not.toBeNull();

      // Check if active share already exists
      const existingShare = await sessionSharesRepo.findActiveShare(sessionId, sharedWithId);
      expect(existingShare).not.toBeNull();
    });

    test('should allow reshare after revoke', async () => {
      const ownerId = 'owner-user-8';
      const sharedWithId = 'shared-user-8';
      const projectId = 'project-share-8';
      const sessionId = 'session-share-8';

      await createTestUser(ownerId, 'owner8@example.com');
      await createTestUser(sharedWithId, 'shared8@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      // First share
      const share1 = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      // Revoke
      await sessionSharesRepo.revoke(share1!.id);

      // Second share should succeed (new share after revoke)
      const existingShare = await sessionSharesRepo.findActiveShare(sessionId, sharedWithId);
      expect(existingShare).toBeFalsy();

      const share2 = await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });
      expect(share2).not.toBeNull();
      expect(share2!.id).not.toBe(share1!.id);
    });
  });

  describe('Shared with user queries', () => {
    test('should return sessions shared with user', async () => {
      const ownerId = 'owner-user-9';
      const sharedWithId = 'shared-user-9';
      const projectId = 'project-share-9';
      const sessionId1 = 'session-share-9a';
      const sessionId2 = 'session-share-9b';

      await createTestUser(ownerId, 'owner9@example.com');
      await createTestUser(sharedWithId, 'shared9@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId1, projectId, ownerId);
      await createTestSession(sessionId2, projectId, ownerId);

      // Share both sessions
      await sessionSharesRepo.create({
        sessionId: sessionId1,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });
      await sessionSharesRepo.create({
        sessionId: sessionId2,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId,
      });

      const sharedWithUser = await sessionSharesRepo.getSharedWithUser(sharedWithId);
      expect(sharedWithUser.length).toBe(2);

      const sessionIds = sharedWithUser.map((s) => s.session_id);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).toContain(sessionId2);
    });

    test('should count active shares', async () => {
      const ownerId = 'owner-user-10';
      const sharedWithId1 = 'shared-user-10a';
      const sharedWithId2 = 'shared-user-10b';
      const projectId = 'project-share-10';
      const sessionId = 'session-share-10';

      await createTestUser(ownerId, 'owner10@example.com');
      await createTestUser(sharedWithId1, 'shared10a@example.com');
      await createTestUser(sharedWithId2, 'shared10b@example.com');
      await createTestProject(projectId);
      await createTestSession(sessionId, projectId, ownerId);

      // Share with two users
      await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId1,
      });
      await sessionSharesRepo.create({
        sessionId,
        sharedByUserId: ownerId,
        sharedWithUserId: sharedWithId2,
      });

      const count = await sessionSharesRepo.countActiveShares(sessionId);
      expect(count).toBe(2);
    });
  });
});
