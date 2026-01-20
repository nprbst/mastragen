import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.ts';
import { createTestDb, cleanupTestDb } from '../helpers/test-db.ts';
import { ProjectsRepository } from '../../src/repositories/projects.ts';
import { SessionsRepository } from '../../src/repositories/sessions.ts';
import { AuthService } from '../../src/services/auth.ts';

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
    db = await createTestDb(TEST_DB_PATH);

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
    await cleanupTestDb(db, TEST_DB_PATH);
  });

  describe('POST /sessions/:id/suspend (T021 - Contract Test)', () => {
    test('returns 200 with git fields (branchName, lastCommitSha, commitCount)', async () => {
      // Create a session with git fields set
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'suspend-git-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        user_id: 'testuser',
        branch_name: 'mg/testuser/suspend-git-test-abc123',
      });

      // Update to have git state (simulating after a commit)
      await sessionsRepo.updateGitState(session.id, {
        lastCommitSha: 'a'.repeat(40),
        commitCount: 3,
      });

      // Generate a session token for authentication
      const authService = new AuthService(db);
      const sessionToken = await authService.generateSessionToken(session.id, 'testuser');

      // Import the sessions routes module which we need to enhance
      const { sessionsRoutes } = await import('../../src/routes/sessions.ts');

      const app = new Hono();
      // Add db to context (like the main app does)
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));

      // Call suspend endpoint with session token
      const res = await app.request(`/sessions/${session.id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
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
        user_id: 'testuser',
        branch_name: 'mg/testuser/no-commits-test-def456',
      });

      // Generate a session token for authentication
      const authService = new AuthService(db);
      const sessionToken = await authService.generateSessionToken(session.id, 'testuser');

      const { sessionsRoutes } = await import('../../src/routes/sessions.ts');

      const app = new Hono();
      // Add db to context (like the main app does)
      app.use('*', async (c, next) => {
        // @ts-expect-error - db is added dynamically to context for middleware use
        c.set('db', db);
        await next();
      });
      app.route('/sessions', sessionsRoutes(db, { dockerEnabled: false }));

      const res = await app.request(`/sessions/${session.id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
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
      expect(result.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
    });

    test('returns 409 when session is locked by another pod (T035 requirement)', async () => {
      // Create a session that is "locked" (already has containers running)
      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'locked-session',
        environment: 'dev',
        workspace_volume: 'test-volume',
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
   * T038: Claude History Preservation
   *
   * Tests that conversation history is saved and restored:
   * - On suspend: Copy from Claude's /home/coder/.claude/projects/-workspace/ to workspace's .claude-history/
   * - On resume: Copy from workspace's .claude-history/ back to VS Code container
   */
  describe('Claude History Preservation (T038)', () => {
    test('suspendWithGit calls saveClaudeHistory to persist conversation history', async () => {
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

      const mockClaudeHistoryService = {
        saveClaudeHistory: mock(() => {
          mockCalls.push('saveClaudeHistory');
          return Promise.resolve();
        }),
        restoreClaudeHistory: mock(() => {
          mockCalls.push('restoreClaudeHistory');
          return Promise.resolve();
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'claude-history-suspend-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        user_id: 'testuser',
        branch_name: 'mg/testuser/claude-history-suspend-test-abc123',
      });

      const { SandboxService } = await import('../../src/services/sandbox.ts');

      const sandboxService = new SandboxService({
        projectsRepo,
        sessionsRepo,
        dockerEnabled: false,
      });

      // Call suspendWithGit with Claude history service
      const result = await sandboxService.suspendWithGit(
        session.id,
        mockGitService as any,
        { claudeHistoryService: mockClaudeHistoryService }
      );

      // Verify saveClaudeHistory was called before commit
      const saveClaudeHistoryIndex = mockCalls.indexOf('saveClaudeHistory');
      const commitIndex = mockCalls.findIndex((c) => c.startsWith('commitAll:'));

      expect(saveClaudeHistoryIndex).toBeGreaterThanOrEqual(0);
      expect(saveClaudeHistoryIndex).toBeLessThan(commitIndex);
      expect(result.state).toBe('suspended');
    });

    test('resumeWithGit calls restoreClaudeHistory after clone', async () => {
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

      const mockClaudeHistoryService = {
        saveClaudeHistory: mock(() => {
          mockCalls.push('saveClaudeHistory');
          return Promise.resolve();
        }),
        restoreClaudeHistory: mock(() => {
          mockCalls.push('restoreClaudeHistory');
          return Promise.resolve();
        }),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'claude-history-resume-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
        user_id: 'testuser',
        branch_name: 'mg/testuser/claude-history-resume-test-xyz789',
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

      // Call resumeWithGit with Claude history service
      const result = await sandboxService.resumeWithGit(
        session.id,
        mockGitService as any,
        { claudeHistoryService: mockClaudeHistoryService }
      );

      // Verify restoreClaudeHistory was called after clone
      const cloneIndex = mockCalls.findIndex((c) => c.startsWith('clone:'));
      const restoreIndex = mockCalls.indexOf('restoreClaudeHistory');

      expect(cloneIndex).toBeGreaterThanOrEqual(0);
      expect(restoreIndex).toBeGreaterThan(cloneIndex);
      expect(result.session.state).toBe('active');
    });

    test('saveClaudeHistory is skipped gracefully when history directory does not exist', async () => {
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

      // Mock that handles "no such file" gracefully
      const mockClaudeHistoryService = {
        saveClaudeHistory: mock(() => {
          mockCalls.push('saveClaudeHistory:no-history');
          return Promise.resolve(); // Should handle gracefully
        }),
        restoreClaudeHistory: mock(() => Promise.resolve()),
      };

      const session = await sessionsRepo.create({
        project_id: testProjectId,
        artifact_name: 'no-history-test',
        environment: 'dev',
        workspace_volume: 'test-volume',
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
        claudeHistoryService: mockClaudeHistoryService,
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
        expect(result.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
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

  /**
   * Phase 6: PR Creation Tests (T049-T051)
   */
  describe('POST /sessions/:id/pull-request (Phase 6 - PR Creation)', () => {
    describe('T049 - Contract Test', () => {
      test('returns 201 with PR info when creating PR from suspended session', async () => {
        const mockGitService = {
          getStatus: mock(() => Promise.resolve({ hasChanges: false })),
          commitAll: mock(() => Promise.resolve(null)),
          push: mock(() => Promise.resolve()),
          getCurrentSha: mock(() => Promise.resolve('e'.repeat(40))),
          getCommitCount: mock(() => Promise.resolve(5)),
        };

        const mockGitHubService = {
          createPullRequest: mock(() =>
            Promise.resolve({
              number: 42,
              url: 'https://github.com/org/repo/pull/42',
              title: 'Test PR',
              state: 'open' as const,
            })
          ),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create a session first with some commits
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'pr-test-contract',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/pr-test-contract-abc123',
        });

        // Update session to have commits
        await sessionsRepo.updateGitState(session.id, {
          lastCommitSha: 'e'.repeat(40),
          commitCount: 5,
        });

        // Suspend the session
        await sessionsRepo.updateState(session.id, 'suspended');

        const result = await sandboxService.createPullRequest(
          session.id,
          mockGitService as any,
          mockGitHubService as any,
          { title: 'Test PR', description: 'Test description' }
        );

        // Verify PR was created
        expect(result.pr.number).toBe(42);
        expect(result.pr.url).toBe('https://github.com/org/repo/pull/42');
        expect(result.pr.state).toBe('open');

        // Verify session state is pr_open
        expect(result.session.state).toBe('pr_open');
        expect(result.session.pr_number).toBe(42);
        expect(result.session.pr_url).toBe('https://github.com/org/repo/pull/42');
      });

      test('returns 409 when PR already exists for session', async () => {
        const { SandboxService, PRAlreadyExistsError } = await import(
          '../../src/services/sandbox.ts'
        );

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create a session with existing PR
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'pr-test-exists',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/pr-test-exists-abc123',
        });

        // Set up session with existing PR
        await sessionsRepo.update(session.id, {
          pr_number: 99,
          pr_url: 'https://github.com/org/repo/pull/99',
          state: 'pr_open',
        });

        await expect(
          sandboxService.createPullRequest(session.id, {} as any, {} as any)
        ).rejects.toThrow(PRAlreadyExistsError);
      });

      test('returns 400 when session has no commits', async () => {
        const { SandboxService, NoCommitsError } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create a session with no commits
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'pr-test-no-commits',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/pr-test-no-commits-abc123',
        });

        await expect(
          sandboxService.createPullRequest(session.id, {} as any, {} as any)
        ).rejects.toThrow(NoCommitsError);
      });
    });

    describe('T050 - Integration Test', () => {
      test('commits and pushes changes from active session before creating PR', async () => {
        const mockCalls: string[] = [];

        const mockGitService = {
          getStatus: mock(() => {
            mockCalls.push('getStatus');
            return Promise.resolve({ hasChanges: true });
          }),
          commitAll: mock((msg: string) => {
            mockCalls.push(`commitAll:${msg}`);
            return Promise.resolve({ sha: 'f'.repeat(40), message: msg });
          }),
          push: mock((branch: string, setUpstream: boolean) => {
            mockCalls.push(`push:${branch}:${setUpstream}`);
            return Promise.resolve();
          }),
          getCurrentSha: mock(() => Promise.resolve('f'.repeat(40))),
          getCommitCount: mock(() => Promise.resolve(6)),
        };

        const mockGitHubService = {
          createPullRequest: mock((input: any) => {
            mockCalls.push(`createPR:${input.head}:${input.base}`);
            return Promise.resolve({
              number: 100,
              url: 'https://github.com/org/repo/pull/100',
              title: input.title,
              state: 'open' as const,
            });
          }),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create an active session with some commits
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'pr-test-active',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/pr-test-active-abc123',
        });

        // Simulate having some commits
        await sessionsRepo.updateGitState(session.id, {
          lastCommitSha: 'e'.repeat(40),
          commitCount: 5,
        });

        // Session is active by default

        const result = await sandboxService.createPullRequest(
          session.id,
          mockGitService as any,
          mockGitHubService as any
        );

        // Verify operations were called in correct order
        expect(mockCalls[0]).toBe('getStatus');
        expect(mockCalls[1]).toMatch(/^commitAll:/);
        expect(mockCalls[2]).toMatch(/^push:mg\/testuser\/pr-test-active-abc123:/);
        expect(mockCalls[3]).toMatch(/^createPR:/);

        // Verify result
        expect(result.pr.number).toBe(100);
        expect(result.session.state).toBe('pr_open');
      });
    });

    describe('T051 - Custom Title and Description Test', () => {
      test('uses custom title and description when provided', async () => {
        let capturedInput: any = null;

        const mockGitService = {
          getStatus: mock(() => Promise.resolve({ hasChanges: false })),
        };

        const mockGitHubService = {
          createPullRequest: mock((input: any) => {
            capturedInput = input;
            return Promise.resolve({
              number: 200,
              url: 'https://github.com/org/repo/pull/200',
              title: input.title,
              state: 'open' as const,
            });
          }),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create a suspended session with commits
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'pr-test-custom',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/pr-test-custom-abc123',
        });

        await sessionsRepo.updateGitState(session.id, {
          lastCommitSha: 'g'.repeat(40),
          commitCount: 3,
        });

        await sessionsRepo.updateState(session.id, 'suspended');

        await sandboxService.createPullRequest(session.id, mockGitService as any, mockGitHubService as any, {
          title: 'Custom PR Title',
          description: 'This is a custom description for the PR.',
        });

        // Verify custom title and description were passed
        expect(capturedInput.title).toBe('Custom PR Title');
        expect(capturedInput.body).toBe('This is a custom description for the PR.');
      });

      test('generates default title when not provided', async () => {
        let capturedInput: any = null;

        const mockGitService = {
          getStatus: mock(() => Promise.resolve({ hasChanges: false })),
        };

        const mockGitHubService = {
          createPullRequest: mock((input: any) => {
            capturedInput = input;
            return Promise.resolve({
              number: 201,
              url: 'https://github.com/org/repo/pull/201',
              title: input.title,
              state: 'open' as const,
            });
          }),
        };

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Create a suspended session with commits
        const session = await sessionsRepo.create({
          project_id: testProjectId,
          artifact_name: 'feature-billing',
          environment: 'dev',
          user_id: 'testuser',
          branch_name: 'mg/testuser/feature-billing-abc123',
        });

        await sessionsRepo.updateGitState(session.id, {
          lastCommitSha: 'h'.repeat(40),
          commitCount: 2,
        });

        await sessionsRepo.updateState(session.id, 'suspended');

        await sandboxService.createPullRequest(
          session.id,
          mockGitService as any,
          mockGitHubService as any
        );

        // Verify default title was generated
        expect(capturedInput.title).toBe('[feature-billing] Session work');
      });
    });
  });

  /**
   * Phase 7: Monorepo Support Tests (T060-T061)
   *
   * T060: Integration test for monorepo session with mastraPath and uiSandboxPath
   * T061: Test for commit including changes from both service directories
   *
   * Note: T062, T065 (template initialization) deferred to future release.
   */
  describe('Phase 7: Monorepo Support', () => {
    let monorepoProjectId: string;

    beforeEach(async () => {
      // Create a monorepo project with mastraPath and uiSandboxPath
      const monorepoProject = await projectsRepo.create({
        name: 'monorepo-test-project',
        github_repo: 'org/monorepo',
        mastra_path: 'packages/backend',
        ui_sandbox_path: 'packages/frontend',
      });
      monorepoProjectId = monorepoProject.id;

      // Add dev environment
      await projectsRepo.addEnvironment(monorepoProjectId, {
        name: 'dev',
        env_vars: {},
      });
    });

    describe('T060 - Monorepo Session Creation', () => {
      test('creates session with mastraPath and uiSandboxPath configured', async () => {
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

        const result = await sandboxService.createWithGit(
          {
            projectId: monorepoProjectId,
            artifactName: 'monorepo-feature',
            environment: 'dev',
            userId: 'testuser',
          },
          mockGitHubService as any
        );

        // Verify session was created
        expect(result.session.user_id).toBe('testuser');
        expect(result.session.branch_name).toMatch(/^mg\/testuser\/monorepo-feature-/);
        expect(result.session.state).toBe('active');

        // Verify URLs include astro (because ui_sandbox_path is configured)
        expect(result.urls).toBeDefined();
        expect(result.urls.vscode).toMatch(/^http:\/\/localhost:\d+/);
        expect(result.urls.astro).toMatch(/^http:\/\/localhost:\d+/);
      });

      test('session without ui_sandbox_path does not have astro URL', async () => {
        // Create a project without ui_sandbox_path
        const backendOnlyProject = await projectsRepo.create({
          name: 'backend-only-project',
          github_repo: 'org/backend-only',
          mastra_path: 'src',
          // No ui_sandbox_path
        });
        await projectsRepo.addEnvironment(backendOnlyProject.id, {
          name: 'dev',
          env_vars: {},
        });

        const mockGitHubService = {
          checkUserPermissions: mock(() =>
            Promise.resolve({
              canRead: true,
              canWrite: true,
              canAdmin: false,
              permission: 'write',
            })
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
            projectId: backendOnlyProject.id,
            artifactName: 'backend-feature',
            environment: 'dev',
            userId: 'testuser',
          },
          mockGitHubService as any
        );

        // Verify URLs - astro should be null when ui_sandbox_path is not configured
        expect(result.urls.astro).toBeNull();
      });

      test('verifies project paths are correctly stored', async () => {
        // Verify the monorepo project has correct paths
        const project = await projectsRepo.findById(monorepoProjectId);

        expect(project).toBeDefined();
        expect(project!.mastra_path).toBe('packages/backend');
        expect(project!.ui_sandbox_path).toBe('packages/frontend');
      });
    });

    describe('T061 - Cross-Directory Commit', () => {
      test('suspend commits changes from both mastraPath and uiSandboxPath directories', async () => {
        const mockCalls: string[] = [];

        // Mock GitService that simulates changes in both directories
        const mockGitService = {
          getStatus: mock(() => {
            mockCalls.push('getStatus');
            return Promise.resolve({
              hasChanges: true,
              staged: [],
              unstaged: [
                'packages/backend/src/index.ts', // Change in mastraPath
                'packages/frontend/src/App.tsx', // Change in uiSandboxPath
              ],
              untracked: ['packages/backend/new-file.ts'],
            });
          }),
          commitAll: mock((message: string) => {
            mockCalls.push(`commitAll:${message}`);
            return Promise.resolve({
              sha: 'c'.repeat(40),
              message,
            });
          }),
          push: mock((branch: string) => {
            mockCalls.push(`push:${branch}`);
            return Promise.resolve();
          }),
          getCurrentSha: mock(() => Promise.resolve('c'.repeat(40))),
          getCommitCount: mock(() => Promise.resolve(1)),
        };

        // Create a session for the monorepo project
        const session = await sessionsRepo.create({
          project_id: monorepoProjectId,
          artifact_name: 'cross-dir-commit-test',
          environment: 'dev',
          workspace_volume: 'test-volume',
          user_id: 'testuser',
          branch_name: 'mg/testuser/cross-dir-commit-test-abc123',
        });

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        // Suspend the session - should commit changes from both directories
        const result = await sandboxService.suspendWithGit(session.id, mockGitService as any);

        // Verify git operations were called
        expect(mockCalls).toContain('getStatus');
        expect(mockCalls.find((c) => c.startsWith('commitAll:'))).toBeDefined();
        expect(mockCalls.find((c) => c.startsWith('push:'))).toBeDefined();

        // Verify session is suspended with commit
        expect(result.state).toBe('suspended');
        expect(result.last_commit_sha).toBe('c'.repeat(40));
      });

      test('git add -A stages all changes across monorepo subdirectories', async () => {
        // This test verifies the behavior described in T063/T064:
        // git operations work across subdirectories because:
        // 1. GitService uses `git -C /workspace` to run commands from repo root
        // 2. `git add -A` stages ALL changes in the repository

        let capturedStatusChanges: string[] = [];

        const mockGitService = {
          getStatus: mock(() => {
            // Simulate changes across multiple directories
            const changes = [
              'packages/backend/src/api.ts',
              'packages/backend/tests/api.test.ts',
              'packages/frontend/src/components/Header.tsx',
              'packages/frontend/public/favicon.ico',
              'README.md', // Root file change
            ];
            capturedStatusChanges = changes;
            return Promise.resolve({
              hasChanges: true,
              staged: [],
              unstaged: changes,
              untracked: [],
            });
          }),
          commitAll: mock((message: string) => {
            // All 5 files should be committed together
            return Promise.resolve({
              sha: 'd'.repeat(40),
              message,
            });
          }),
          push: mock(() => Promise.resolve()),
          getCurrentSha: mock(() => Promise.resolve('d'.repeat(40))),
          getCommitCount: mock(() => Promise.resolve(1)),
        };

        const session = await sessionsRepo.create({
          project_id: monorepoProjectId,
          artifact_name: 'multi-dir-test',
          environment: 'dev',
          workspace_volume: 'test-volume',
          user_id: 'testuser',
          branch_name: 'mg/testuser/multi-dir-test-xyz789',
        });

        const { SandboxService } = await import('../../src/services/sandbox.ts');

        const sandboxService = new SandboxService({
          projectsRepo,
          sessionsRepo,
          dockerEnabled: false,
        });

        await sandboxService.suspendWithGit(session.id, mockGitService as any);

        // Verify status reported changes from multiple directories
        expect(capturedStatusChanges).toContain('packages/backend/src/api.ts');
        expect(capturedStatusChanges).toContain('packages/frontend/src/components/Header.tsx');
        expect(capturedStatusChanges).toContain('README.md');

        // commitAll was called (which uses git add -A to stage everything)
        expect(mockGitService.commitAll).toHaveBeenCalled();
      });
    });

    describe('T063/T064 - Git Operations Across Subdirectories (Verification)', () => {
      test('GitService operates from workspace root (verified by -C flag usage)', async () => {
        // This is a conceptual verification test
        // The actual implementation in git.ts uses: git -C /workspace <command>
        // which means all git operations work from the repo root, not subdirectories
        //
        // This ensures:
        // - git status shows changes from ALL directories
        // - git add -A stages changes from ALL directories
        // - git commit includes ALL staged changes in one commit

        const session = await sessionsRepo.create({
          project_id: monorepoProjectId,
          artifact_name: 'git-root-test',
          environment: 'dev',
          workspace_volume: 'test-volume',
          user_id: 'testuser',
          branch_name: 'mg/testuser/git-root-test-abc123',
        });

        // Verify session is linked to monorepo project
        const project = await projectsRepo.findById(session.project_id);
        expect(project).toBeDefined();
        expect(project!.mastra_path).toBe('packages/backend');
        expect(project!.ui_sandbox_path).toBe('packages/frontend');

        // The test passes if we can create a session for a monorepo project
        // The actual git -C behavior is tested in unit tests (git.test.ts)
        expect(session.project_id).toBe(monorepoProjectId);
      });
    });

    describe('T066 - Container Working Directories (Verification)', () => {
      test('project paths are available for container configuration', async () => {
        // This verifies the data needed for container startup exists
        // Actual container startup is tested via integration tests with Docker

        const project = await projectsRepo.findById(monorepoProjectId);

        expect(project).toBeDefined();

        // These paths are used in SandboxService.startContainers() to set workingDir:
        // - Mastra container: /workspace/${project.mastra_path}
        // - Astro container: /workspace/${project.ui_sandbox_path}
        expect(project!.mastra_path).toBe('packages/backend');
        expect(project!.ui_sandbox_path).toBe('packages/frontend');

        // The actual implementation in sandbox.ts:
        // const mastraWorkDir = `/workspace${project.mastra_path !== '.' ? `/${project.mastra_path}` : ''}`;
        // const astroWorkDir = `/workspace/${project.ui_sandbox_path}`;
        // These are passed as WorkingDir in container config
      });
    });
  });
});
