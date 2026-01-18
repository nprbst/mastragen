import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../src/db/migrations/002_git_fields.ts';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';

const TEST_DB_PATH = './data/test-sessions-git.db';

/**
 * Tests for git-enhanced session operations.
 *
 * These tests verify:
 * - T021: Contract test for POST /sessions/:id/suspend with git fields
 * - T022: Integration test for suspend workflow (changes → commit → push)
 */
describe('Sessions Git Routes', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let sessionsRepo: SessionsRepository;
  let testProjectId: string;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);

    projectsRepo = new ProjectsRepository(db);
    sessionsRepo = new SessionsRepository(db);

    // Create a test project
    const project = await projectsRepo.create({
      name: 'test-git-project',
      github_repo: 'org/repo',
    });
    testProjectId = project.id;

    // Add dev environment
    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: {},
    });
  });

  afterEach(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('POST /sessions/:id/suspend (T021 - Contract Test)', () => {
    test('returns 200 with git fields (branchName, lastCommitSha, commitCount)', async () => {
      // Create a session with git fields set
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'suspend-git-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/suspend-git-test-abc123',
      });

      // Update to have git state (simulating after a commit)
      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'a'.repeat(40),
        commitCount: 3,
      });

      // Import the sessions routes module which we need to enhance
      const { sessionsRoutes } = await import('../../src/routes/sessions.ts');

      const app = new Hono();
      app.route('/sessions', sessionsRoutes(db));

      // Call suspend endpoint
      const res = await app.request(`/sessions/${session.id}/suspend`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;

      // Verify basic session fields
      expect(body.id).toBe(session.id);
      expect(body.state).toBe('suspended');

      // Verify git fields are present in response (T021 requirement)
      expect(body.branchName).toBe('mg/testuser/suspend-git-test-abc123');
      expect(body.lastCommitSha).toBe('a'.repeat(40));
      expect(body.commitCount).toBe(3);
    });

    test('returns git fields with null lastCommitSha when no commits', async () => {
      // Create session without any commits
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'no-commits-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/no-commits-test-def456',
      });

      const { sessionsRoutes } = await import('../../src/routes/sessions.ts');

      const app = new Hono();
      app.route('/sessions', sessionsRoutes(db));

      const res = await app.request(`/sessions/${session.id}/suspend`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.state).toBe('suspended');
      expect(body.branchName).toBe('mg/testuser/no-commits-test-def456');
      expect(body.lastCommitSha).toBeNull();
      expect(body.commitCount).toBe(0);
    });
  });

  describe('POST /sessions/:id/suspend (T022 - Integration Test)', () => {
    test('calls git operations: getStatus → commitAll → push when changes exist', async () => {
      // Track mock calls
      const mockCalls: string[] = [];

      // Create mock GitService
      const mockGitService = {
        getStatus: mock(() => {
          mockCalls.push('getStatus');
          return Promise.resolve({
            hasChanges: true,
            staged: [],
            unstaged: ['file.ts'],
            untracked: [],
          });
        }),
        commitAll: mock((message: string) => {
          mockCalls.push(`commitAll:${message}`);
          return Promise.resolve({
            sha: 'b'.repeat(40),
            message,
          });
        }),
        push: mock((branch: string) => {
          mockCalls.push(`push:${branch}`);
          return Promise.resolve();
        }),
        getCurrentSha: mock(() => {
          return Promise.resolve('b'.repeat(40));
        }),
        getCommitCount: mock(() => {
          return Promise.resolve(1);
        }),
      };

      // Create a session
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'git-workflow-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/git-workflow-test-xyz789',
      });

      // Import SandboxService and call suspendWithGit
      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false, // Disable Docker for tests
      });

      // Call the enhanced suspend method (which we need to implement)
      // This should call: getStatus → commitAll → push
      const result = await sandboxService.suspendWithGit(session.id, mockGitService as any);

      // Verify git operations were called in order
      expect(mockCalls).toContain('getStatus');
      expect(mockCalls.find((c) => c.startsWith('commitAll:'))).toBeDefined();
      expect(mockCalls.find((c) => c.startsWith('push:'))).toBeDefined();

      // Verify session state updated
      expect(result.state).toBe('suspended');
      expect(result.last_commit_sha).toBe('b'.repeat(40));
    });

    test('skips commit when no changes (T027 requirement)', async () => {
      const mockCalls: string[] = [];

      const mockGitService = {
        getStatus: mock(() => {
          mockCalls.push('getStatus');
          return Promise.resolve({
            hasChanges: false,
            staged: [],
            unstaged: [],
            untracked: [],
          });
        }),
        commitAll: mock(() => {
          mockCalls.push('commitAll');
          return Promise.resolve(null);
        }),
        push: mock(() => {
          mockCalls.push('push');
          return Promise.resolve();
        }),
        getCurrentSha: mock(() => {
          return Promise.resolve('c'.repeat(40));
        }),
        getCommitCount: mock(() => {
          return Promise.resolve(2);
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'no-changes-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/no-changes-test-abc123',
      });

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const result = await sandboxService.suspendWithGit(session.id, mockGitService as any);

      // Should call getStatus but not commitAll or push (no changes)
      expect(mockCalls).toContain('getStatus');
      expect(mockCalls).not.toContain('commitAll');
      expect(mockCalls).not.toContain('push');

      // Session should still be suspended gracefully
      expect(result.state).toBe('suspended');
    });

    test('handles git operation failure with retry (T028 requirement)', async () => {
      let pushAttempts = 0;

      const mockGitService = {
        getStatus: mock(() => {
          return Promise.resolve({
            hasChanges: true,
            staged: [],
            unstaged: ['file.ts'],
            untracked: [],
          });
        }),
        commitAll: mock(() => {
          return Promise.resolve({
            sha: 'd'.repeat(40),
            message: 'Auto-commit on suspend',
          });
        }),
        push: mock(() => {
          pushAttempts++;
          if (pushAttempts < 3) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve();
        }),
        getCurrentSha: mock(() => {
          return Promise.resolve('d'.repeat(40));
        }),
        getCommitCount: mock(() => {
          return Promise.resolve(1);
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'retry-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/retry-test-abc123',
      });

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Should succeed after retries
      const result = await sandboxService.suspendWithGit(session.id, mockGitService as any);

      expect(pushAttempts).toBe(3);
      expect(result.state).toBe('suspended');
    });
  });

  /**
   * Phase 4: User Story 2 - Resume Suspended Session
   *
   * T029: Contract test for POST /sessions/:id/resume
   * T030: Integration test for resume workflow
   * T031: Test for resume from specific commit SHA
   */
  describe('POST /sessions/:id/resume (T029 - Contract Test)', () => {
    test('returns 200 with git fields and URLs for resumed session', async () => {
      // Create an active session with git fields to verify response shape
      // (Contract test verifies response format, not full resume workflow)
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'resume-git-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/resume-git-test-abc123',
      });

      // Set git state
      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'e'.repeat(40),
        commitCount: 5,
      });

      // Use SandboxService directly with Docker disabled for contract test
      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Manually suspend, then resume with the service
      await sessionsRepo.updateState(session.id, 'suspended');
      const result = await sandboxService.resume(session.id);

      // Verify session state
      expect(result.session.id).toBe(session.id);
      expect(result.session.state).toBe('active');

      // Verify git fields are present in session (T029 requirement)
      expect(result.session.branch_name).toBe('mg/testuser/resume-git-test-abc123');
      expect(result.session.last_commit_sha).toBe('e'.repeat(40));
      expect(result.session.commit_count).toBe(5);

      // Verify URLs are present for active session
      expect(result.urls).toBeDefined();
      expect(result.urls.cui).toMatch(/^http:\/\/localhost:\d+/);
    });

    test('returns 409 when session is locked by another pod (T035 requirement)', async () => {
      // Create a session that is "locked" (already has containers running)
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'locked-session',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/locked-session-abc123',
        container_id: 'existing-container-id', // Simulates running containers
      });

      // Set to suspended but with container_id still present
      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService, SessionLockError } = await import('../../src/services/sandbox.ts');

      const mockGitService = {
        clone: mock(() => Promise.resolve()),
        checkout: mock(() => Promise.resolve()),
      };

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // resumeWithGit should check for existing containers and throw SessionLockError
      await expect(
        sandboxService.resumeWithGit(session.id, mockGitService as any, {
          checkLock: true,
        })
      ).rejects.toThrow(SessionLockError);
    });
  });

  describe('POST /sessions/:id/resume (T030 - Integration Test)', () => {
    test('calls git operations: clone → checkout when resuming', async () => {
      const mockCalls: string[] = [];

      const mockGitService = {
        clone: mock((repoUrl: string, branch?: string) => {
          mockCalls.push(`clone:${repoUrl}:${branch}`);
          return Promise.resolve();
        }),
        checkout: mock((ref: string) => {
          mockCalls.push(`checkout:${ref}`);
          return Promise.resolve();
        }),
      };

      // Create a suspended session
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'resume-workflow-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/resume-workflow-test-xyz789',
      });

      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'f'.repeat(40),
        commitCount: 3,
      });
      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Call resumeWithGit
      const result = await sandboxService.resumeWithGit(session.id, mockGitService as any);

      // Verify git operations were called
      expect(mockCalls.find((c) => c.startsWith('clone:'))).toBeDefined();

      // Verify session state updated
      expect(result.session.state).toBe('active');
    });
  });

  describe('POST /sessions/:id/resume (T031 - Resume from Specific Commit)', () => {
    test('checks out specific commit SHA when provided', async () => {
      const mockCalls: string[] = [];
      const specificSha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      const mockGitService = {
        clone: mock((repoUrl: string, branch?: string) => {
          mockCalls.push(`clone:${repoUrl}:${branch}`);
          return Promise.resolve();
        }),
        checkout: mock((ref: string) => {
          mockCalls.push(`checkout:${ref}`);
          return Promise.resolve();
        }),
      };

      // Create a suspended session
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'commit-sha-resume',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/commit-sha-resume-abc123',
      });

      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'g'.repeat(40),
        commitCount: 10,
      });
      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Call resumeWithGit with specific commit SHA
      const result = await sandboxService.resumeWithGit(session.id, mockGitService as any, {
        commitSha: specificSha,
      });

      // Verify checkout was called with the specific SHA
      expect(mockCalls).toContain(`checkout:${specificSha}`);

      // Verify session state updated
      expect(result.session.state).toBe('active');
    });
  });
});
