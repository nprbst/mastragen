import { randomUUID } from 'node:crypto';
import Docker from 'dockerode';
import type { Project, Session } from '../db/types.ts';
import type { ProjectsRepository } from '../repositories/projects.ts';
import type { SessionsRepository } from '../repositories/sessions.ts';
import type { GitStatus, CommitResult } from './git.ts';
import { InsufficientPermissionsError, GitHubService, type PRResult, type PRCreateInput } from './github.ts';

export { InsufficientPermissionsError };

/**
 * Interface for GitService to allow mocking in tests (for suspend operations).
 */
export interface GitServiceInterface {
  getStatus(): Promise<GitStatus>;
  commitAll(message: string): Promise<CommitResult | null>;
  push(branch: string, setUpstream?: boolean): Promise<void>;
  getCurrentSha(): Promise<string>;
  getCommitCount(): Promise<number>;
}

/**
 * Interface for GitService to allow mocking in tests (for resume operations).
 */
export interface GitServiceResumeInterface {
  clone(repoUrl: string, branch?: string): Promise<void>;
  checkout(ref: string): Promise<void>;
}

/**
 * Interface for CUI history service to persist/restore conversation history.
 * On suspend: Copies history from CUI container to workspace's .cui/ directory
 * On resume: Copies history from workspace's .cui/ to CUI container
 */
export interface CuiHistoryServiceInterface {
  saveCuiHistory(): Promise<void>;
  restoreCuiHistory(): Promise<void>;
}

/**
 * Repository permissions for a user (mirrors github.ts RepoPermissions).
 */
export interface RepoPermissions {
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  permission: string;
}

/**
 * Interface for GitHubService to allow mocking in tests (for create operations).
 */
export interface GitHubServiceCreateInterface {
  checkUserPermissions(owner: string, repo: string, username: string): Promise<RepoPermissions>;
  getDefaultBranchSha(owner: string, repo: string, branch?: string): Promise<string>;
  createBranch(owner: string, repo: string, branchName: string, fromSha: string): Promise<void>;
}

/**
 * Interface for GitHubService to allow mocking in tests (for PR operations).
 */
export interface GitHubServicePRInterface {
  createPullRequest(input: PRCreateInput): Promise<PRResult>;
}

/**
 * Input for createPullRequest method.
 */
export interface CreatePRInput {
  title?: string;
  description?: string;
}

/**
 * Options for suspendWithGit method.
 */
export interface SuspendWithGitOptions {
  cuiHistoryService?: CuiHistoryServiceInterface;
}

/**
 * Options for resumeWithGit method.
 */
export interface ResumeWithGitOptions {
  commitSha?: string;
  checkLock?: boolean;
  cuiHistoryService?: CuiHistoryServiceInterface;
  claudeToken?: string;
}

export interface ServiceUrls {
  cui: string;
  mastra: string;
  astro: string | null;
  vscode: string;
}

export interface CreateSandboxInput {
  projectId: string;
  artifactName: string;
  environment: string;
  claudeToken?: string;
}

export interface CreateSandboxWithGitInput extends CreateSandboxInput {
  userId: string;
}

export interface CreateSandboxResult {
  session: Session;
  urls: ServiceUrls;
}

export interface ResumeSandboxResult {
  session: Session;
  urls: ServiceUrls;
}

export interface SandboxServiceOptions {
  projectsRepo: ProjectsRepository;
  sessionsRepo: SessionsRepository;
  dockerEnabled?: boolean;
}

export class SessionAlreadyExistsError extends Error {
  constructor(
    public existingSessionId: string,
    message: string
  ) {
    super(message);
    this.name = 'SessionAlreadyExistsError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class EnvironmentNotFoundError extends Error {
  constructor(projectId: string, envName: string) {
    super(`Environment not found: ${envName} in project ${projectId}`);
    this.name = 'EnvironmentNotFoundError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionNotActiveError extends Error {
  constructor(sessionId: string) {
    super(`Session is not active: ${sessionId}`);
    this.name = 'SessionNotActiveError';
  }
}

export class SessionAlreadyActiveError extends Error {
  constructor(sessionId: string) {
    super(`Session is already active: ${sessionId}`);
    this.name = 'SessionAlreadyActiveError';
  }
}

/**
 * Error thrown when a session is locked by another active pod.
 */
export class SessionLockError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is locked by another active pod`);
    this.name = 'SessionLockError';
  }
}

/**
 * Error thrown when trying to create a PR for a session that already has one.
 */
export class PRAlreadyExistsError extends Error {
  constructor(
    public sessionId: string,
    public prNumber: number
  ) {
    super(`Session ${sessionId} already has PR #${prNumber}`);
    this.name = 'PRAlreadyExistsError';
  }
}

/**
 * Error thrown when trying to create a PR for a session with no commits.
 */
export class NoCommitsError extends Error {
  constructor(public sessionId: string) {
    super(`Session ${sessionId} has no commits to create PR from`);
    this.name = 'NoCommitsError';
  }
}

export interface CleanupOptions {
  removeVolume?: boolean;
}

export class SandboxService {
  private projectsRepo: ProjectsRepository;
  private sessionsRepo: SessionsRepository;
  private dockerEnabled: boolean;
  private docker: Docker;

  // Default ports for services
  private static readonly PORTS = {
    cui: 3001,
    mastra: 4111,
    astro: 4321,
    vscode: 8080,
  };

  // Container image names (built from sandbox/ Dockerfiles)
  private static readonly IMAGES = {
    init: 'mastragen-001-core-platform-foundation-init',
    cui: 'mastragen-001-core-platform-foundation-cui',
    mastra: 'mastragen-001-core-platform-foundation-mastra',
    astro: 'mastragen-001-core-platform-foundation-astro',
    vscode: 'mastragen-001-core-platform-foundation-code-server',
  };

  // Cache for session -> project mapping (for URL generation)
  private sessionProjectCache: Map<string, Project> = new Map();

  constructor(options: SandboxServiceOptions) {
    this.projectsRepo = options.projectsRepo;
    this.sessionsRepo = options.sessionsRepo;
    this.dockerEnabled = options.dockerEnabled ?? true;
    this.docker = new Docker();
  }

  /**
   * Creates a new sandbox session.
   */
  async create(input: CreateSandboxInput): Promise<CreateSandboxResult> {
    const { projectId, artifactName, environment, claudeToken } = input;

    // Validate project exists
    const project = await this.projectsRepo.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Validate environment exists
    const env = await this.projectsRepo.findEnvironmentByName(projectId, environment);
    if (!env) {
      throw new EnvironmentNotFoundError(projectId, environment);
    }

    // Check for existing session
    const existingSession = await this.sessionsRepo.findByProjectAndName(projectId, artifactName);
    if (existingSession) {
      throw new SessionAlreadyExistsError(
        existingSession.id,
        `Session already exists for project ${projectId} with artifact name ${artifactName}`
      );
    }

    // Generate workspace volume name
    const workspaceVolume = this.generateWorkspaceVolumeName(projectId, artifactName);

    // Generate CUI auth token
    const cuiAuthToken = randomUUID().replace(/-/g, '');

    // Create session in database
    const session = await this.sessionsRepo.create({
      project_id: projectId,
      artifact_name: artifactName,
      environment,
      workspace_volume: workspaceVolume,
      cui_auth_token: cuiAuthToken,
      // container_id will be set when Docker containers are started
    });

    // Cache project for URL generation
    this.sessionProjectCache.set(session.id, project);

    // Start Docker containers if enabled
    console.log(`[SandboxService] create() - dockerEnabled: ${this.dockerEnabled}`);
    if (this.dockerEnabled) {
      console.log('[SandboxService] create() - calling startContainers...');
      try {
        await this.startContainers(session, project, env.env_vars, claudeToken);
        console.log('[SandboxService] create() - startContainers completed');
      } catch (err) {
        console.error('[SandboxService] create() - startContainers failed:', err);
        throw err;
      }
    } else {
      console.log('[SandboxService] create() - Docker disabled, skipping container creation');
    }

    return {
      session,
      urls: this.getServiceUrls(session.id, project, session.cui_auth_token),
    };
  }

  /**
   * Generates a branch name for a git-enabled session.
   * Format: {branchPrefix}{userId}/{artifactName}-{sessionIdPrefix}
   */
  private generateBranchName(
    project: Project,
    userId: string,
    artifactName: string,
    sessionId: string
  ): string {
    const prefix = project.branch_prefix || 'mg/';
    const sessionIdPrefix = sessionId.slice(0, 6);
    return `${prefix}${userId}/${artifactName}-${sessionIdPrefix}`;
  }

  /**
   * Creates a new sandbox session with git integration.
   * Verifies user permissions, creates a branch on GitHub, and starts containers.
   */
  async createWithGit(
    input: CreateSandboxWithGitInput,
    gitHubService: GitHubServiceCreateInterface
  ): Promise<CreateSandboxResult> {
    const { projectId, artifactName, environment, userId, claudeToken } = input;

    // Validate project exists
    const project = await this.projectsRepo.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Validate environment exists
    const env = await this.projectsRepo.findEnvironmentByName(projectId, environment);
    if (!env) {
      throw new EnvironmentNotFoundError(projectId, environment);
    }

    // Check for existing session
    const existingSession = await this.sessionsRepo.findByProjectAndName(projectId, artifactName);
    if (existingSession) {
      throw new SessionAlreadyExistsError(
        existingSession.id,
        `Session already exists for project ${projectId} with artifact name ${artifactName}`
      );
    }

    // Parse repo owner and name
    const [owner, repo] = project.github_repo.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid github_repo format: ${project.github_repo}`);
    }

    // Check user permissions (T043)
    const permissions = await gitHubService.checkUserPermissions(owner, repo, userId);
    if (!permissions.canWrite) {
      throw new InsufficientPermissionsError(userId, project.github_repo, 'write');
    }

    // Generate session ID first so we can use it in branch name
    const sessionId = randomUUID();

    // Generate branch name (T044)
    const branchName = this.generateBranchName(project, userId, artifactName, sessionId);

    // Get default branch SHA and create branch on GitHub (T045)
    const defaultSha = await gitHubService.getDefaultBranchSha(owner, repo, project.default_branch);
    await gitHubService.createBranch(owner, repo, branchName, defaultSha);

    // Generate workspace volume name
    const workspaceVolume = this.generateWorkspaceVolumeName(projectId, artifactName);

    // Generate CUI auth token
    const cuiAuthToken = randomUUID().replace(/-/g, '');

    // Create session in database with user_id and branch_name
    const session = await this.sessionsRepo.create({
      id: sessionId,
      project_id: projectId,
      artifact_name: artifactName,
      environment,
      workspace_volume: workspaceVolume,
      cui_auth_token: cuiAuthToken,
      user_id: userId,
      branch_name: branchName,
    });

    // Cache project for URL generation
    this.sessionProjectCache.set(session.id, project);

    // Start Docker containers if enabled (T046-T048)
    console.log(`[SandboxService] createWithGit() - dockerEnabled: ${this.dockerEnabled}`);
    if (this.dockerEnabled) {
      console.log('[SandboxService] createWithGit() - calling startContainers...');
      try {
        await this.startContainers(session, project, env.env_vars, claudeToken);
        console.log('[SandboxService] createWithGit() - startContainers completed');
      } catch (err) {
        console.error('[SandboxService] createWithGit() - startContainers failed:', err);
        throw err;
      }
    } else {
      console.log('[SandboxService] createWithGit() - Docker disabled, skipping container creation');
    }

    return {
      session,
      urls: this.getServiceUrls(session.id, project, session.cui_auth_token),
    };
  }

  /**
   * Gets service URLs for a session.
   */
  getServiceUrls(sessionId: string, project?: Project, cuiAuthToken?: string | null): ServiceUrls {
    const cachedProject = project ?? this.sessionProjectCache.get(sessionId);

    // Build cui URL with auth token if available
    const cuiBaseUrl = `http://localhost:${SandboxService.PORTS.cui}`;
    const cuiUrl = cuiAuthToken ? `${cuiBaseUrl}#token=${cuiAuthToken}` : cuiBaseUrl;

    return {
      cui: cuiUrl,
      mastra: `http://localhost:${SandboxService.PORTS.mastra}`,
      astro: cachedProject?.ui_sandbox_path
        ? `http://localhost:${SandboxService.PORTS.astro}`
        : null,
      vscode: `http://localhost:${SandboxService.PORTS.vscode}`,
    };
  }

  /**
   * Generates a consistent workspace volume name for a session.
   */
  generateWorkspaceVolumeName(projectId: string, artifactName: string): string {
    return `mastragen-${projectId}-${artifactName}`;
  }

  /**
   * Suspends an active session.
   */
  async suspend(sessionId: string): Promise<Session> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state !== 'active') {
      throw new SessionNotActiveError(sessionId);
    }

    // Stop Docker containers if enabled
    if (this.dockerEnabled) {
      await this.stopContainers(session);
    }

    // Update session state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'suspended');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    return updatedSession;
  }

  /**
   * Suspends an active session with git operations.
   * Commits any changes, pushes to remote, and stops containers.
   *
   * @param sessionId - The session ID to suspend
   * @param gitService - GitService instance for git operations
   * @param options - Optional suspend options (cuiHistoryService)
   * @returns The updated session
   */
  async suspendWithGit(
    sessionId: string,
    gitService: GitServiceInterface,
    options: SuspendWithGitOptions = {}
  ): Promise<Session> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state !== 'active') {
      throw new SessionNotActiveError(sessionId);
    }

    // Save CUI conversation history to workspace before committing (T038)
    if (options.cuiHistoryService) {
      await options.cuiHistoryService.saveCuiHistory();
    }

    // Check for changes
    const status = await gitService.getStatus();

    // If there are changes, commit and push
    if (status.hasChanges) {
      // Commit all changes
      const commitResult = await gitService.commitAll('Auto-commit on suspend');

      if (commitResult) {
        // Push with retry logic (T028 requirement)
        await this.pushWithRetry(gitService, session.branch_name ?? 'main');
      }
    }

    // Get current git state
    const currentSha = await gitService.getCurrentSha();
    const commitCount = await gitService.getCommitCount();

    // Stop Docker containers if enabled
    if (this.dockerEnabled) {
      await this.stopContainers(session);
    }

    // Update session state and git state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'suspended');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    // Update git state
    await this.sessionsRepo.updateGitState(sessionId, {
      lastCommitSha: currentSha,
      commitCount,
    });

    // Return the updated session with git state
    const finalSession = await this.sessionsRepo.findById(sessionId);
    if (!finalSession) {
      throw new SessionNotFoundError(sessionId);
    }

    return finalSession;
  }

  /**
   * Pushes to remote with retry logic (max 3 attempts).
   */
  private async pushWithRetry(
    gitService: GitServiceInterface,
    branch: string,
    maxRetries = 3,
    retryDelayMs = 100
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await gitService.push(branch, attempt === 1);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Resumes a suspended session.
   */
  async resume(sessionId: string, claudeToken?: string): Promise<ResumeSandboxResult> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state === 'active') {
      throw new SessionAlreadyActiveError(sessionId);
    }

    // Get project for container startup
    const project = await this.projectsRepo.findById(session.project_id);
    if (!project) {
      throw new ProjectNotFoundError(session.project_id);
    }

    // Get environment for container startup
    const env = await this.projectsRepo.findEnvironmentByName(
      session.project_id,
      session.environment
    );

    // Update session state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'active');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cache project for URL generation
    this.sessionProjectCache.set(sessionId, project);

    // Start Docker containers if enabled
    if (this.dockerEnabled && env) {
      await this.startContainers(updatedSession, project, env.env_vars, claudeToken);
    }

    return {
      session: updatedSession,
      urls: this.getServiceUrls(sessionId, project, updatedSession.cui_auth_token),
    };
  }

  /**
   * Resumes a suspended session with git operations.
   * Clones the branch, optionally checks out a specific commit, and starts containers.
   *
   * @param sessionId - The session ID to resume
   * @param gitService - GitService instance for git operations
   * @param options - Optional resume options (commitSha, checkLock)
   * @returns The updated session with URLs
   */
  async resumeWithGit(
    sessionId: string,
    gitService: GitServiceResumeInterface,
    options: ResumeWithGitOptions = {}
  ): Promise<ResumeSandboxResult> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state === 'active') {
      throw new SessionAlreadyActiveError(sessionId);
    }

    // Check for lock if requested (T035 requirement)
    if (options.checkLock && session.container_id) {
      throw new SessionLockError(sessionId);
    }

    // Get project for repository URL and container startup
    const project = await this.projectsRepo.findById(session.project_id);
    if (!project) {
      throw new ProjectNotFoundError(session.project_id);
    }

    // Clone the repository with the session branch
    const repoUrl = `https://github.com/${project.github_repo}.git`;
    await gitService.clone(repoUrl, session.branch_name ?? undefined);

    // If specific commit SHA provided, checkout that commit (T036 requirement)
    if (options.commitSha) {
      await gitService.checkout(options.commitSha);
    }

    // Get environment for container startup
    const env = await this.projectsRepo.findEnvironmentByName(
      session.project_id,
      session.environment
    );

    // Update session state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'active');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cache project for URL generation
    this.sessionProjectCache.set(sessionId, project);

    // Start Docker containers if enabled
    if (this.dockerEnabled && env) {
      await this.startContainers(updatedSession, project, env.env_vars, options.claudeToken);
    }

    // Restore CUI conversation history from workspace after containers start (T038)
    if (options.cuiHistoryService) {
      await options.cuiHistoryService.restoreCuiHistory();
    }

    return {
      session: updatedSession,
      urls: this.getServiceUrls(sessionId, project, updatedSession.cui_auth_token),
    };
  }

  /**
   * Creates a pull request from a session (T057-T059).
   * If session is active, commits and pushes changes, then stops containers.
   * Creates a GitHub PR targeting the project's default branch.
   * Session state changes directly to 'pr_open' (not through suspended).
   *
   * @param sessionId - The session ID to create PR from
   * @param gitService - GitService instance for git operations
   * @param gitHubService - GitHubService instance for PR creation
   * @param input - Optional PR title and description
   * @returns The updated session and PR info
   */
  async createPullRequest(
    sessionId: string,
    gitService: GitServiceInterface,
    gitHubService: GitHubServicePRInterface,
    input: CreatePRInput = {}
  ): Promise<{ session: Session; pr: PRResult }> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // If already has PR, return 409
    if (session.pr_number) {
      throw new PRAlreadyExistsError(sessionId, session.pr_number);
    }

    // If session has no commits, return 400
    if (!session.commit_count || session.commit_count === 0) {
      throw new NoCommitsError(sessionId);
    }

    const project = await this.projectsRepo.findById(session.project_id);
    if (!project) {
      throw new ProjectNotFoundError(session.project_id);
    }

    // If active, commit and push changes, stop containers (T058)
    if (session.state === 'active') {
      const status = await gitService.getStatus();
      if (status.hasChanges) {
        await gitService.commitAll('Auto-commit before PR creation');
        await gitService.push(session.branch_name ?? 'main', true);
      }

      if (this.dockerEnabled) {
        await this.stopContainers(session);
      }
    }

    // Parse repo owner and name
    const { owner, repo } = GitHubService.parseRepo(project.github_repo);

    // Generate PR title if not provided
    const title = input.title ?? `[${session.artifact_name}] Session work`;

    // Create PR targeting default branch
    const pr = await gitHubService.createPullRequest({
      owner,
      repo,
      title,
      head: session.branch_name!,
      base: project.default_branch ?? 'main',
      body: input.description,
    });

    // Update session state to pr_open (T059)
    const updatedSession = await this.sessionsRepo.updatePRState(sessionId, {
      prNumber: pr.number,
      prUrl: pr.url,
    });

    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    return { session: updatedSession, pr };
  }

  /**
   * Cleans up a session: stops containers, optionally removes volume, and deletes from database.
   */
  async cleanup(sessionId: string, options: CleanupOptions = {}): Promise<void> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Stop and remove containers
    if (this.dockerEnabled) {
      await this.cleanupContainers(sessionId, session.container_id);

      // Remove volume if requested (with retry logic for timing issues)
      if (options.removeVolume && session.workspace_volume) {
        const maxRetries = 3;
        const retryDelay = 500;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const volume = this.docker.getVolume(session.workspace_volume);
            await volume.remove({ force: true });
            break;
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('No such volume')) {
              break;
            }
            if (attempt === maxRetries) {
              console.warn(`Failed to remove volume ${session.workspace_volume}:`, err);
            } else {
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }
      }
    }

    // Remove from cache
    this.sessionProjectCache.delete(sessionId);

    // Delete session from database
    await this.sessionsRepo.delete(sessionId);
  }

  /**
   * Cleans up containers by session ID, including orphaned containers.
   */
  private async cleanupContainers(
    sessionId: string,
    containerIdsCsv: string | null
  ): Promise<void> {
    // First, try to stop/remove by stored container IDs
    if (containerIdsCsv) {
      const containerIds = containerIdsCsv.split(',');
      await Promise.all(
        containerIds.map(async (containerId) => {
          try {
            const container = this.docker.getContainer(containerId.trim());
            await container.remove({ force: true, v: true });
          } catch {
            // Container may already be stopped or removed
          }
        })
      );
    }

    // Also clean up by name pattern (catches orphaned containers)
    const containerNames = [
      `${sessionId}-cui`,
      `${sessionId}-mastra`,
      `${sessionId}-vscode`,
      `${sessionId}-astro`,
    ];

    await Promise.all(
      containerNames.map(async (name) => {
        try {
          const container = this.docker.getContainer(name);
          await container.remove({ force: true, v: true });
        } catch {
          // Container doesn't exist, which is fine
        }
      })
    );
  }

  /**
   * Cleans up any containers using the static ports (for single-session mode).
   */
  private async cleanupConflictingContainers(): Promise<void> {
    console.log('[SandboxService] Cleaning up any containers using static ports...');

    const containers = await this.docker.listContainers({ all: true });
    const targetPorts = Object.values(SandboxService.PORTS);

    for (const containerInfo of containers) {
      // Check if this container uses any of our static ports
      const usesOurPort = containerInfo.Ports?.some((p) => targetPorts.includes(p.PublicPort ?? 0));

      if (usesOurPort) {
        try {
          console.log(
            `[SandboxService] Removing conflicting container: ${containerInfo.Names?.[0]} (using port ${containerInfo.Ports?.map((p) => p.PublicPort).join(', ')})`
          );
          const container = this.docker.getContainer(containerInfo.Id);
          if (containerInfo.State === 'running') {
            await container.stop();
          }
          await container.remove();
        } catch (err) {
          console.warn(`[SandboxService] Failed to remove container ${containerInfo.Id}:`, err);
        }
      }
    }
  }

  /**
   * Runs the init container to clone the repository into the workspace volume.
   */
  private async runInitContainer(
    sessionId: string,
    volumeName: string,
    githubRepo: string,
    branch?: string
  ): Promise<void> {
    const containerName = `${sessionId}-init`;
    console.log(`[SandboxService] Running init container to clone ${githubRepo}${branch ? ` (branch: ${branch})` : ''}...`);

    try {
      const container = await this.docker.createContainer({
        name: containerName,
        Image: SandboxService.IMAGES.init,
        Env: [
          `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
          `GITHUB_REPO=${githubRepo}`,
          ...(branch ? [`BRANCH=${branch}`] : []),
        ],
        HostConfig: {
          Binds: [`${volumeName}:/workspace`],
        },
      });

      await container.start();
      console.log('[SandboxService] Init container started, waiting for completion...');

      // Wait for the container to finish
      const result = await container.wait();
      console.log(`[SandboxService] Init container exited with code ${result.StatusCode}`);

      // Get logs for debugging
      const logs = await container.logs({ stdout: true, stderr: true });
      console.log('[SandboxService] Init container logs:', logs.toString());

      // Remove the init container
      await container.remove();
      console.log('[SandboxService] Init container removed');

      if (result.StatusCode !== 0) {
        throw new Error(`Init container failed with exit code ${result.StatusCode}`);
      }
    } catch (err) {
      // Try to clean up the container if it exists
      try {
        const container = this.docker.getContainer(containerName);
        await container.remove({ force: true });
      } catch {
        // Container may not exist
      }
      throw err;
    }
  }

  /**
   * Starts Docker containers for a session.
   */
  private async startContainers(
    session: Session,
    project: Project,
    envVars: string,
    claudeToken?: string
  ): Promise<void> {
    console.log(`[SandboxService] startContainers called for session ${session.id}`);
    console.log(`[SandboxService] dockerEnabled: ${this.dockerEnabled}`);

    // Clean up any existing containers using our ports (single-session mode)
    await this.cleanupConflictingContainers();

    const volumeName =
      session.workspace_volume ??
      this.generateWorkspaceVolumeName(session.project_id, session.artifact_name);
    console.log(`[SandboxService] Using volume: ${volumeName}`);

    // Ensure volume exists
    try {
      console.log('[SandboxService] Creating volume...');
      await this.docker.createVolume({ Name: volumeName });
      console.log('[SandboxService] Volume created successfully');
    } catch (err: unknown) {
      console.log('[SandboxService] Volume creation error:', err);
      // Volume may already exist, which is fine
      if (!(err instanceof Error) || !err.message.includes('already exists')) {
        throw err;
      }
      console.log('[SandboxService] Volume already exists, continuing...');
    }

    // Run init container to clone the repo (using session branch if available)
    await this.runInitContainer(session.id, volumeName, project.github_repo, session.branch_name ?? undefined);

    // Parse environment variables from JSON string
    let parsedEnvVars: Record<string, string> = {};
    try {
      parsedEnvVars = JSON.parse(envVars || '{}');
    } catch {
      // If parsing fails, use empty object
    }

    // Build environment array for containers
    const baseEnv = [
      `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      ...Object.entries(parsedEnvVars).map(([k, v]) => `${k}=${v}`),
    ];

    // Container configurations
    // T048: Use project.mastra_path for Mastra working directory
    const mastraWorkDir = `/workspace${project.mastra_path && project.mastra_path !== '.' ? `/${project.mastra_path}` : ''}`;

    const containers: Array<{
      name: string;
      image: string;
      port: number;
      env: string[];
      workingDir?: string;
    }> = [
      {
        name: `${session.id}-cui`,
        image: SandboxService.IMAGES.cui,
        port: SandboxService.PORTS.cui,
        env: [
          ...baseEnv,
          `CUI_AUTH_TOKEN=${session.cui_auth_token || ''}`,
          ...(claudeToken ? [`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`] : []),
        ],
      },
      {
        name: `${session.id}-mastra`,
        image: SandboxService.IMAGES.mastra,
        port: SandboxService.PORTS.mastra,
        env: baseEnv,
        workingDir: mastraWorkDir,
      },
      {
        name: `${session.id}-vscode`,
        image: SandboxService.IMAGES.vscode,
        port: SandboxService.PORTS.vscode,
        env: [
          ...baseEnv,
          ...(claudeToken ? [`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`] : []),
        ],
      },
    ];

    // T047: Add astro container only if project has UI sandbox path
    if (project.ui_sandbox_path) {
      const astroWorkDir = `/workspace/${project.ui_sandbox_path}`;
      containers.push({
        name: `${session.id}-astro`,
        image: SandboxService.IMAGES.astro,
        port: SandboxService.PORTS.astro,
        env: baseEnv,
        workingDir: astroWorkDir,
      });
    }

    // Start containers in parallel
    console.log(`[SandboxService] Starting ${containers.length} containers...`);
    const containerIds: string[] = [];
    await Promise.all(
      containers.map(async (config) => {
        try {
          console.log(
            `[SandboxService] Creating container: ${config.name} (image: ${config.image}, port: ${config.port})`
          );
          const container = await this.docker.createContainer({
            name: config.name,
            Image: config.image,
            Env: config.env,
            WorkingDir: config.workingDir,
            HostConfig: {
              Binds: [`${volumeName}:/workspace`],
              PortBindings: {
                [`${config.port}/tcp`]: [{ HostPort: String(config.port) }],
              },
            },
            ExposedPorts: {
              [`${config.port}/tcp`]: {},
            },
          });
          console.log(`[SandboxService] Container created: ${container.id}, starting...`);
          await container.start();
          console.log(`[SandboxService] Container started: ${config.name}`);
          containerIds.push(container.id);
        } catch (err) {
          console.error(`[SandboxService] Error creating/starting container ${config.name}:`, err);
          throw err;
        }
      })
    );

    // Store container IDs in session (comma-separated)
    console.log(`[SandboxService] All containers started, IDs: ${containerIds.join(', ')}`);
    await this.sessionsRepo.update(session.id, {
      container_id: containerIds.join(','),
    });
    console.log('[SandboxService] Session updated with container IDs');
  }

  /**
   * Stops Docker containers for a session.
   */
  private async stopContainers(session: Session): Promise<void> {
    if (!session.container_id) {
      return;
    }

    const containerIds = session.container_id.split(',');

    await Promise.all(
      containerIds.map(async (containerId) => {
        try {
          const container = this.docker.getContainer(containerId.trim());
          await container.stop();
          await container.remove();
        } catch (err: unknown) {
          // Container may already be stopped or removed
          if (
            err instanceof Error &&
            !err.message.includes('not running') &&
            !err.message.includes('No such container')
          ) {
            throw err;
          }
        }
      })
    );
  }
}
