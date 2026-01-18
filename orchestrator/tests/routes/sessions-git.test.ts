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

  /**
   * T038: CUI History Preservation
   *
   * Tests that conversation history is saved and restored:
   * - On suspend: Copy from CUI's /root/.claude/projects/-workspace/ to workspace's .cui/
   * - On resume: Copy from workspace's .cui/ back to CUI container
   */
  describe('CUI History Preservation (T038)', () => {
    test('suspendWithGit calls saveCuiHistory to persist conversation history', async () => {
      const mockCalls: string[] = [];

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
            sha: 'h'.repeat(40),
            message,
          });
        }),
        push: mock(() => {
          mockCalls.push('push');
          return Promise.resolve();
        }),
        getCurrentSha: mock(() => Promise.resolve('h'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(1)),
      };

      const mockCuiHistoryService = {
        saveCuiHistory: mock(() => {
          mockCalls.push('saveCuiHistory');
          return Promise.resolve();
        }),
        restoreCuiHistory: mock(() => {
          mockCalls.push('restoreCuiHistory');
          return Promise.resolve();
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'cui-history-suspend-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/cui-history-suspend-test-abc123',
      });

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Call suspendWithGit with CUI history service
      const result = await sandboxService.suspendWithGit(
        session.id,
        mockGitService as any,
        { cuiHistoryService: mockCuiHistoryService }
      );

      // Verify saveCuiHistory was called before commit
      const saveCuiHistoryIndex = mockCalls.indexOf('saveCuiHistory');
      const commitIndex = mockCalls.findIndex((c) => c.startsWith('commitAll:'));

      expect(saveCuiHistoryIndex).toBeGreaterThanOrEqual(0);
      expect(saveCuiHistoryIndex).toBeLessThan(commitIndex);
      expect(result.state).toBe('suspended');
    });

    test('resumeWithGit calls restoreCuiHistory after clone', async () => {
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

      const mockCuiHistoryService = {
        saveCuiHistory: mock(() => {
          mockCalls.push('saveCuiHistory');
          return Promise.resolve();
        }),
        restoreCuiHistory: mock(() => {
          mockCalls.push('restoreCuiHistory');
          return Promise.resolve();
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'cui-history-resume-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/cui-history-resume-test-xyz789',
      });

      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'i'.repeat(40),
        commitCount: 5,
      });
      await sessionsRepo.updateState(session.id, 'suspended');

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Call resumeWithGit with CUI history service
      const result = await sandboxService.resumeWithGit(
        session.id,
        mockGitService as any,
        { cuiHistoryService: mockCuiHistoryService }
      );

      // Verify restoreCuiHistory was called after clone
      const cloneIndex = mockCalls.findIndex((c) => c.startsWith('clone:'));
      const restoreIndex = mockCalls.indexOf('restoreCuiHistory');

      expect(cloneIndex).toBeGreaterThanOrEqual(0);
      expect(restoreIndex).toBeGreaterThan(cloneIndex);
      expect(result.session.state).toBe('active');
    });

    test('saveCuiHistory is skipped gracefully when history directory does not exist', async () => {
      const mockCalls: string[] = [];

      const mockGitService = {
        getStatus: mock(() =>
          Promise.resolve({ hasChanges: false, staged: [], unstaged: [], untracked: [] })
        ),
        commitAll: mock(() => Promise.resolve(null)),
        push: mock(() => Promise.resolve()),
        getCurrentSha: mock(() => Promise.resolve('j'.repeat(40))),
        getCommitCount: mock(() => Promise.resolve(0)),
      };

      // Mock that throws "no such file" error
      const mockCuiHistoryService = {
        saveCuiHistory: mock(() => {
          mockCalls.push('saveCuiHistory:no-history');
          return Promise.resolve(); // Should handle gracefully
        }),
        restoreCuiHistory: mock(() => Promise.resolve()),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'no-history-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        cui_auth_token: 'test-token',
        user_id: 'testuser',
        branch_name: 'mg/testuser/no-history-test-abc123',
      });

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Should not throw, even if no history exists
      const result = await sandboxService.suspendWithGit(session.id, mockGitService as any, {
        cuiHistoryService: mockCuiHistoryService,
      });

      expect(result.state).toBe('suspended');
    });
  });

  /**
   * Phase 5: User Story 3 - Multi-Project Sessions
   *
   * T039: Contract test for POST /sessions with userId
   * T040: Integration test for session creation with branch workflow
   * T041: Test for 403 when user lacks write access
   */
  describe('POST /sessions with userId (Phase 5 - Multi-Project)', () => {
    describe('T039 - Contract Test', () => {
      test('returns 201 with branchName when userId is provided', async () => {
        const mockGitHubService = {
          checkUserPermissions: mock(() =>
            Promise.resolve({
              canRead: true,
              canWrite: true,
              canAdmin: false,
              permission: 'write',
            })
          ),
          getDefaultBranchSha: mock(() => Promise.resolve('a'.repeat(40))),
          createBranch: mock(() => Promise.resolve()),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Call createWithGit (new method we need to implement)
        const result = await sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'multi-project-test',
            environment: 'dev',
            userId: 'testuser',
          },
          mockGitHubService as any
        );

        // Verify session was created with userId and branchName
        expect(result.session.user_id).toBe('testuser');
        expect(result.session.branch_name).toMatch(/^mg\/testuser\/multi-project-test-/);
        expect(result.session.state).toBe('active');

        // Verify URLs are returned
        expect(result.urls).toBeDefined();
        expect(result.urls.cui).toMatch(/^http:\/\/localhost:\d+/);
      });

      test('generates correct branch name format: {prefix}{userId}/{artifactName}-{sessionId}', async () => {
        const mockGitHubService = {
          checkUserPermissions: mock(() =>
            Promise.resolve({ canRead: true, canWrite: true, canAdmin: false, permission: 'write' })
          ),
          getDefaultBranchSha: mock(() => Promise.resolve('b'.repeat(40))),
          createBranch: mock(() => Promise.resolve()),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        const result = await sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'feature-billing',
            environment: 'dev',
            userId: 'alice',
          },
          mockGitHubService as any
        );

        // Branch name should be: mg/alice/feature-billing-{first6charsOfSessionId}
        const sessionId = result.session.id;
        const expectedBranchName = `mg/alice/feature-billing-${sessionId.slice(0, 6)}`;
        expect(result.session.branch_name).toBe(expectedBranchName);
      });
    });

    describe('T040 - Integration Test', () => {
      test('calls GitHub operations: checkPermissions → getDefaultBranchSha → createBranch', async () => {
        const mockCalls: string[] = [];

        const mockGitHubService = {
          checkUserPermissions: mock((owner: string, repo: string, username: string) => {
            mockCalls.push(`checkUserPermissions:${owner}/${repo}:${username}`);
            return Promise.resolve({
              canRead: true,
              canWrite: true,
              canAdmin: false,
              permission: 'write',
            });
          }),
          getDefaultBranchSha: mock((owner: string, repo: string) => {
            mockCalls.push(`getDefaultBranchSha:${owner}/${repo}`);
            return Promise.resolve('c'.repeat(40));
          }),
          createBranch: mock((owner: string, repo: string, branchName: string, sha: string) => {
            mockCalls.push(`createBranch:${owner}/${repo}:${branchName}:${sha.slice(0, 8)}`);
            return Promise.resolve();
          }),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        await sandboxService.createWithGit(
          {
            projectId: testProjectId,
            artifactName: 'workflow-test',
            environment: 'dev',
            userId: 'bob',
          },
          mockGitHubService as any
        );

        // Verify operations were called in correct order
        expect(mockCalls[0]).toMatch(/^checkUserPermissions:org\/repo:bob$/);
        expect(mockCalls[1]).toMatch(/^getDefaultBranchSha:org\/repo$/);
        expect(mockCalls[2]).toMatch(/^createBranch:org\/repo:mg\/bob\/workflow-test-/);
      });
    });

    describe('T041 - Permission Denied Test', () => {
      test('throws InsufficientPermissionsError when user lacks write access', async () => {
        const mockGitHubService = {
          checkUserPermissions: mock(() =>
            Promise.resolve({
              canRead: true,
              canWrite: false, // User has read but not write access
              canAdmin: false,
              permission: 'read',
            })
          ),
          getDefaultBranchSha: mock(() => Promise.resolve('d'.repeat(40))),
          createBranch: mock(() => Promise.resolve()),
        };

        const { SandboxService, InsufficientPermissionsError } = await import(
          '../../src/services/sandbox.ts'
        );

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Should throw InsufficientPermissionsError
        await expect(
          sandboxService.createWithGit(
            {
              projectId: testProjectId,
              artifactName: 'permission-test',
              environment: 'dev',
              userId: 'readonly-user',
            },
            mockGitHubService as any
          )
        ).rejects.toThrow(InsufficientPermissionsError);

        // Verify permission check was called but branch creation was not
        expect(mockGitHubService.checkUserPermissions).toHaveBeenCalled();
        expect(mockGitHubService.createBranch).not.toHaveBeenCalled();
      });

      test('throws InsufficientPermissionsError with correct details', async () => {
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

        const { SandboxService, InsufficientPermissionsError } = await import(
          '../../src/services/sandbox.ts'
        );

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        try {
          await sandboxService.createWithGit(
            {
              projectId: testProjectId,
              artifactName: 'details-test',
              environment: 'dev',
              userId: 'no-access-user',
            },
            mockGitHubService as any
          );
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(InsufficientPermissionsError);
          const permError = error as InstanceType<typeof InsufficientPermissionsError>;
          expect(permError.username).toBe('no-access-user');
          expect(permError.repo).toBe('org/repo');
          expect(permError.requiredPermission).toBe('write');
        }
      });
    });
  });
});
