import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../src/db/migrations/002_git_fields.ts';
import type { Database } from '../../src/db/types.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';

const TEST_DB_PATH = './data/test-e2e-git-workflow.db';

/**
 * E2E Tests for Git Workflow (Phase 8)
 *
 * These tests verify:
 * - T067: Full lifecycle: create → suspend → resume → PR
 * - T068: Session lock conflict (409 on concurrent resume)
 * - T069: Permission denied (403 on session creation)
 *
 * Note: These tests use SandboxService directly with dockerEnabled: false
 * and mock GitService/GitHubService to test the complete workflow without
 * requiring actual Docker containers or GitHub API access.
 */
describe('Git Workflow E2E', () => {
  let db: Kysely<Database>;
  let projectsRepo: ProjectsRepository;
  let sessionsRepo: SessionsRepository;
  let testProjectId: string;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = createDatabase(TEST_DB_PATH);
    await runMigrations001(db);
    await runMigrations002(db);

    projectsRepo = new ProjectsRepository(db);
    sessionsRepo = new SessionsRepository(db);

    // Create a test project with environment
    const project = await projectsRepo.create({
      name: 'e2e-git-workflow-project',
      github_repo: 'org/e2e-git-repo',
      default_branch: 'main',
      branch_prefix: 'mg/',
    });
    testProjectId = project.id;

    await projectsRepo.addEnvironment(testProjectId, {
      name: 'dev',
      env_vars: { TEST_VAR: 'test-value' },
    });
  });

  afterAll(async () => {
    await db.destroy();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * T067: Full Git Lifecycle E2E Test
   *
   * Tests the complete workflow:
   * 1. Create session with userId (creates git branch)
   * 2. Suspend session (commits and pushes changes)
   * 3. Resume session (clones branch, starts containers)
   * 4. Create PR (transition to pr_open state)
   */
  describe('T067 - Full Git Lifecycle', () => {
    test('complete git lifecycle: create → suspend → resume → PR', async () => {
      // Track all operations across the lifecycle
      const operationLog: string[] = [];

      // Mock GitHubService for session creation
      const mockGitHubService = {
        checkUserPermissions: mock(() => {
          operationLog.push('github:checkUserPermissions');
          return Promise.resolve({
            canRead: true,
            canWrite: true,
            canAdmin: false,
            permission: 'write',
          });
        }),
        getDefaultBranchSha: mock(() => {
          operationLog.push('github:getDefaultBranchSha');
          return Promise.resolve('a'.repeat(40));
        }),
        createBranch: mock(() => {
          operationLog.push('github:createBranch');
          return Promise.resolve();
        }),
        createPullRequest: mock((input: any) => {
          operationLog.push(`github:createPullRequest:${input.title}`);
          return Promise.resolve({
            number: 42,
            url: 'https://github.com/org/e2e-git-repo/pull/42',
            title: input.title,
            state: 'open' as const,
          });
        }),
      };

      // Mock GitService for suspend/resume
      const mockGitServiceForSuspend = {
        getStatus: mock(() => {
          operationLog.push('git:getStatus');
          return Promise.resolve({
            hasChanges: true,
            staged: [],
            unstaged: ['file.ts'],
            untracked: [],
          });
        }),
        commitAll: mock((message: string) => {
          operationLog.push(`git:commitAll:${message.substring(0, 20)}`);
          return Promise.resolve({
            sha: 'b'.repeat(40),
            message,
          });
        }),
        push: mock((branch: string) => {
          operationLog.push(`git:push:${branch}`);
          return Promise.resolve();
        }),
        getCurrentSha: mock(() => Promise.resolve('b'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(1)),
      };

      const mockGitServiceForResume = {
        clone: mock((_repoUrl: string, branch?: string) => {
          operationLog.push(`git:clone:${branch}`);
          return Promise.resolve();
        }),
        checkout: mock((ref: string) => {
          operationLog.push(`git:checkout:${ref}`);
          return Promise.resolve();
        }),
      };

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false, // Disable Docker for E2E test
      });

      // Step 1: Create session with userId (creates git branch)
      const createResult = await sandboxService.createWithGit(
        {
          projectId: testProjectId,
          artifactName: 'full-lifecycle-test',
          environment: 'dev',
          userId: 'lifecycle-user',
        },
        mockGitHubService as any
      );

      expect(createResult.session.id).toBeDefined();
      expect(createResult.session.state).toBe('active');
      expect(createResult.session.user_id).toBe('lifecycle-user');
      expect(createResult.session.branch_name).toMatch(/^mg\/lifecycle-user\/full-lifecycle-test-/);
      expect(createResult.urls).toBeDefined();
      expect(createResult.urls.cui).toMatch(/^http:\/\/localhost:\d+/);

      const sessionId = createResult.session.id;

      // Verify GitHub operations for branch creation
      expect(operationLog).toContain('github:checkUserPermissions');
      expect(operationLog).toContain('github:getDefaultBranchSha');
      expect(operationLog).toContain('github:createBranch');

      // Step 2: Suspend the session (commits and pushes changes)
      const suspendResult = await sandboxService.suspendWithGit(
        sessionId,
        mockGitServiceForSuspend as any
      );

      expect(suspendResult.state).toBe('suspended');
      expect(suspendResult.branch_name).toMatch(/^mg\/lifecycle-user\/full-lifecycle-test-/);
      expect(suspendResult.last_commit_sha).toBe('b'.repeat(40));
      expect(suspendResult.commit_count).toBe(1);

      // Verify git operations for suspend
      expect(operationLog).toContain('git:getStatus');
      expect(operationLog.find((op) => op.startsWith('git:commitAll:'))).toBeDefined();
      expect(operationLog.find((op) => op.startsWith('git:push:'))).toBeDefined();

      // Step 3: Resume the session (clones branch, starts containers)
      const resumeResult = await sandboxService.resumeWithGit(
        sessionId,
        mockGitServiceForResume as any
      );

      expect(resumeResult.session.state).toBe('active');
      expect(resumeResult.urls).toBeDefined();
      expect(resumeResult.urls.cui).toMatch(/^http:\/\/localhost:\d+/);

      // Verify git operations for resume
      expect(operationLog.find((op) => op.startsWith('git:clone:'))).toBeDefined();

      // Step 4: Create PR from the session
      // First suspend again to transition to a valid state for PR
      await sandboxService.suspendWithGit(sessionId, mockGitServiceForSuspend as any);

      const prResult = await sandboxService.createPullRequest(
        sessionId,
        mockGitServiceForSuspend as any,
        mockGitHubService as any,
        {
          title: 'Full Lifecycle Test PR',
          description: 'This PR was created from the full lifecycle E2E test.',
        }
      );

      expect(prResult.pr.number).toBe(42);
      expect(prResult.pr.url).toBe('https://github.com/org/e2e-git-repo/pull/42');
      expect(prResult.session.state).toBe('pr_open');
      expect(prResult.session.pr_number).toBe(42);
      expect(prResult.session.pr_url).toBe('https://github.com/org/e2e-git-repo/pull/42');

      // Verify GitHub PR creation was called
      expect(operationLog.find((op) => op.startsWith('github:createPullRequest:'))).toBeDefined();

      // Step 5: Verify complete operation sequence
      // The log should show: create → suspend → resume → suspend → PR
      expect(operationLog.length).toBeGreaterThan(8);
    });

    test('lifecycle with resume from specific commit SHA', async () => {
      const operationLog: string[] = [];
      const specificSha = 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0';

      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({ canRead: true, canWrite: true, canAdmin: false, permission: 'write' })
        ),
        getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
        createBranch: mock(() => Promise.resolve()),
      };

      const mockGitServiceForSuspend = {
        getStatus: mock(() =>
          Promise.resolve({ hasChanges: false, staged: [], unstaged: [], untracked: [] })
        ),
        commitAll: mock(() => Promise.resolve(null)),
        push: mock(() => Promise.resolve()),
        getCurrentSha: mock(() => Promise.resolve('c'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(5)),
      };

      const mockGitServiceForResume = {
        clone: mock((_repoUrl: string, branch?: string) => {
          operationLog.push(`clone:${branch}`);
          return Promise.resolve();
        }),
        checkout: mock((ref: string) => {
          operationLog.push(`checkout:${ref}`);
          return Promise.resolve();
        }),
      };

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Create and suspend a session
      const createResult = await sandboxService.createWithGit(
        {
          projectId: testProjectId,
          artifactName: 'specific-commit-test',
          environment: 'dev',
          userId: 'commit-user',
        },
        mockGitHubService as any
      );
      const sessionId = createResult.session.id;

      await sandboxService.suspendWithGit(sessionId, mockGitServiceForSuspend as any);

      // Resume from specific commit SHA
      const resumeResult = await sandboxService.resumeWithGit(
        sessionId,
        mockGitServiceForResume as any,
        { commitSha: specificSha }
      );

      expect(resumeResult.session.state).toBe('active');
      // Verify checkout was called with the specific SHA
      expect(operationLog).toContain(`checkout:${specificSha}`);
    });
  });

  /**
   * T068: Session Lock Conflict Test
   *
   * Tests that attempting to resume an already-active session returns 409 Conflict.
   */
  describe('T068 - Session Lock Conflict', () => {
    test('returns error when attempting to resume an active session', async () => {
      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({ canRead: true, canWrite: true, canAdmin: false, permission: 'write' })
        ),
        getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
        createBranch: mock(() => Promise.resolve()),
      };

      const mockGitServiceForSuspend = {
        getStatus: mock(() =>
          Promise.resolve({ hasChanges: false, staged: [], unstaged: [], untracked: [] })
        ),
        commitAll: mock(() => Promise.resolve(null)),
        push: mock(() => Promise.resolve()),
        getCurrentSha: mock(() => Promise.resolve('a'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(0)),
      };

      const mockGitServiceForResume = {
        clone: mock(() => Promise.resolve()),
        checkout: mock(() => Promise.resolve()),
      };

      const { SandboxService, SessionAlreadyActiveError } = await import(
        '../../src/services/sandbox.ts'
      );

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Create a session
      const createResult = await sandboxService.createWithGit(
        {
          projectId: testProjectId,
          artifactName: 'lock-conflict-test',
          environment: 'dev',
          userId: 'lock-user',
        },
        mockGitHubService as any
      );
      const sessionId = createResult.session.id;

      // Suspend
      await sandboxService.suspendWithGit(sessionId, mockGitServiceForSuspend as any);

      // Resume (first time - should succeed)
      const resumeResult = await sandboxService.resumeWithGit(
        sessionId,
        mockGitServiceForResume as any
      );
      expect(resumeResult.session.state).toBe('active');

      // Attempt second resume while session is active - should fail
      // The session is now active, so resumeWithGit should fail
      await expect(
        sandboxService.resumeWithGit(sessionId, mockGitServiceForResume as any)
      ).rejects.toThrow(SessionAlreadyActiveError);
    });

    test('returns SessionLockError when session has running containers', async () => {
      // Create a session that simulates having running containers
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'container-lock-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'lock-user-2',
        branch_name: 'mg/lock-user-2/container-lock-test-abc123',
        container_id: 'running-container-id', // Simulates running containers
      });

      // Set to suspended but with container_id still present (simulating another pod)
      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService, SessionLockError } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const mockGitService = {
        clone: mock(() => Promise.resolve()),
        checkout: mock(() => Promise.resolve()),
      };

      // This should throw SessionLockError
      await expect(
        sandboxService.resumeWithGit(session.id, mockGitService as any, {
          checkLock: true,
        })
      ).rejects.toThrow(SessionLockError);
    });

    test('SessionLockError contains helpful message', async () => {
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'lock-message-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'lock-user-3',
        branch_name: 'mg/lock-user-3/lock-message-test-abc123',
        container_id: 'running-container-456',
      });

      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService, SessionLockError } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const mockGitService = {
        clone: mock(() => Promise.resolve()),
        checkout: mock(() => Promise.resolve()),
      };

      try {
        await sandboxService.resumeWithGit(session.id, mockGitService as any, {
          checkLock: true,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(SessionLockError);
        const lockError = error as InstanceType<typeof SessionLockError>;
        // Error message should mention the session is locked
        expect(lockError.message.toLowerCase()).toContain('lock');
      }
    });
  });

  /**
   * T069: Permission Denied Test
   *
   * Tests that creating a session without write permission returns 403 Forbidden.
   */
  describe('T069 - Permission Denied', () => {
    test('returns 403 when user lacks write permission', async () => {
      // Test using SandboxService directly with a mock that denies permission
      const { SandboxService, InsufficientPermissionsError } = await import(
        '../../src/services/sandbox.ts'
      );

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({
            canRead: true,
            canWrite: false, // User lacks write access
            canAdmin: false,
            permission: 'read',
          })
        ),
        getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
        createBranch: mock(() => Promise.resolve()),
      };

      // Attempt to create session should fail with InsufficientPermissionsError
      await expect(
        sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'permission-test',
            environment: 'dev',
            userId: 'no-write-user',
          },
          mockGitHubService as any
        )
      ).rejects.toThrow(InsufficientPermissionsError);

      // Verify permission check was called but branch creation was not
      expect(mockGitHubService.checkUserPermissions).toHaveBeenCalled();
      expect(mockGitHubService.createBranch).not.toHaveBeenCalled();
    });

    test('InsufficientPermissionsError contains correct details', async () => {
      const { SandboxService, InsufficientPermissionsError } = await import(
        '../../src/services/sandbox.ts'
      );

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({
            canRead: true,
            canWrite: false,
            canAdmin: false,
            permission: 'read',
          })
        ),
      };

      try {
        await sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'details-test',
            environment: 'dev',
            userId: 'permission-denied-user',
          },
          mockGitHubService as any
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientPermissionsError);
        const permError = error as InstanceType<typeof InsufficientPermissionsError>;
        expect(permError.username).toBe('permission-denied-user');
        expect(permError.repo).toBe('org/e2e-git-repo');
        expect(permError.requiredPermission).toBe('write');
        // Verify error message is user-friendly
        expect(permError.message).toContain('permission-denied-user');
        expect(permError.message).toContain('write');
      }
    });

    test('403 error message suggests checking repository access', async () => {
      const { SandboxService, InsufficientPermissionsError } = await import(
        '../../src/services/sandbox.ts'
      );

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({
            canRead: false, // No read access either
            canWrite: false,
            canAdmin: false,
            permission: 'none',
          })
        ),
      };

      try {
        await sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'no-access-test',
            environment: 'dev',
            userId: 'no-access-user',
          },
          mockGitHubService as any
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientPermissionsError);
        // Error message should be actionable
        const permError = error as InstanceType<typeof InsufficientPermissionsError>;
        expect(permError.message.toLowerCase()).toContain('permission');
      }
    });
  });

  /**
   * T073: Performance Verification Test
   *
   * Tests that suspend completes within 30s for typical workload.
   * Note: With mocked services, this primarily validates the service layer overhead.
   * Real-world performance depends on actual git operations.
   */
  describe('T073 - Performance Verification', () => {
    test('suspend completes within 30s for typical workload', async () => {
      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({ canRead: true, canWrite: true, canAdmin: false, permission: 'write' })
        ),
        getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
        createBranch: mock(() => Promise.resolve()),
      };

      // Simulate typical workload: 50 files changed
      const changedFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);

      const mockGitService = {
        getStatus: mock(() =>
          Promise.resolve({
            hasChanges: true,
            staged: [],
            unstaged: changedFiles,
            untracked: [],
          })
        ),
        commitAll: mock((message: string) =>
          Promise.resolve({
            sha: 'b'.repeat(40),
            message,
          })
        ),
        push: mock(() => Promise.resolve()),
        getCurrentSha: mock(() => Promise.resolve('b'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(1)),
      };

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Create a session
      const createResult = await sandboxService.createWithGit(
        {
          projectId: testProjectId,
          artifactName: 'performance-test',
          environment: 'dev',
          userId: 'perf-user',
        },
        mockGitHubService as any
      );
      const sessionId = createResult.session.id;

      // Measure suspend time
      const startTime = Date.now();

      const suspendResult = await sandboxService.suspendWithGit(sessionId, mockGitService as any);

      const duration = Date.now() - startTime;

      expect(suspendResult.state).toBe('suspended');
      // Per SC-005: suspend completes within 30s for ≤50 files, ≤5MB diff
      expect(duration).toBeLessThan(30000);

      // Log the timing for visibility
      console.log(`[Performance] Suspend completed in ${duration}ms (50 files simulated)`);
    });

    test('service layer operations complete quickly without network delays', async () => {
      const mockGitHubService = {
        checkUserPermissions: mock(() =>
          Promise.resolve({ canRead: true, canWrite: true, canAdmin: false, permission: 'write' })
        ),
        getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
        createBranch: mock(() => Promise.resolve()),
      };

      const mockGitService = {
        getStatus: mock(() =>
          Promise.resolve({ hasChanges: true, staged: [], unstaged: ['file.ts'], untracked: [] })
        ),
        commitAll: mock(() => Promise.resolve({ sha: 'c'.repeat(40), message: 'test' })),
        push: mock(() => Promise.resolve()),
        getCurrentSha: mock(() => Promise.resolve('c'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(1)),
      };

      const mockGitServiceForResume = {
        clone: mock(() => Promise.resolve()),
        checkout: mock(() => Promise.resolve()),
      };

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Time the create operation
      let startTime = Date.now();
      const createResult = await sandboxService.createWithGit(
        {
          projectId: testProjectId,
          artifactName: 'perf-create-test',
          environment: 'dev',
          userId: 'perf-user-2',
        },
        mockGitHubService as any
      );
      const createDuration = Date.now() - startTime;
      console.log(`[Performance] Create completed in ${createDuration}ms`);
      expect(createDuration).toBeLessThan(5000); // Should complete quickly with mocks

      // Time the suspend operation
      startTime = Date.now();
      await sandboxService.suspendWithGit(createResult.session.id, mockGitService as any);
      const suspendDuration = Date.now() - startTime;
      console.log(`[Performance] Suspend completed in ${suspendDuration}ms`);
      expect(suspendDuration).toBeLessThan(5000);

      // Time the resume operation
      startTime = Date.now();
      await sandboxService.resumeWithGit(createResult.session.id, mockGitServiceForResume as any);
      const resumeDuration = Date.now() - startTime;
      console.log(`[Performance] Resume completed in ${resumeDuration}ms`);
      expect(resumeDuration).toBeLessThan(5000);
    });
  });
});
