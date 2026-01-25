import { randomUUID } from 'node:crypto';
import path from 'node:path';
import Docker from 'dockerode';
import type { Kysely } from 'kysely';
import { parse as parseToml } from 'smol-toml';
import { pack } from 'tar-stream';
import type { Database, Project, Session } from '../db/types.ts';
import type { ProjectsRepository } from '../repositories/projects.ts';
import type { SessionsRepository } from '../repositories/sessions.ts';
import { AuthService } from './auth.ts';
import { ClaudeInjectionService } from './claude-injection.ts';
import type { CommitResult, GitStatus } from './git.ts';
import {
  GitHubService,
  InsufficientPermissionsError,
  type PRCreateInput,
  type PRResult,
} from './github.ts';
import {
  type K8sSandboxService,
  type SessionStatus,
  createK8sSandboxService,
} from './k8s-sandbox.ts';

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
 * Interface for Claude history service to persist/restore conversation history.
 * On suspend: Copies history from vscode container to workspace's .claude-history/ directory
 * On resume: Copies history from workspace's .claude-history/ to vscode container
 */
export interface ClaudeHistoryServiceInterface {
  saveClaudeHistory(): Promise<void>;
  restoreClaudeHistory(): Promise<void>;
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
  claudeHistoryService?: ClaudeHistoryServiceInterface;
}

/**
 * Options for resumeWithGit method.
 */
export interface ResumeWithGitOptions {
  commitSha?: string;
  checkLock?: boolean;
  claudeHistoryService?: ClaudeHistoryServiceInterface;
  claudeToken?: string;
  userGithubToken?: string;
  userGitName?: string;
  userGitEmail?: string;
}

export interface ServiceUrls {
  mastra: string;
  astro: string | null;
  vscode: string;
  phoenix: string | null;
}

export interface CreateSandboxInput {
  projectId: string;
  artifactName: string;
  environment: string;
  claudeToken?: string;
  userId?: string;
  userGithubToken?: string;
  userGitName?: string;
  userGitEmail?: string;
}

export interface CreateSandboxWithGitInput extends CreateSandboxInput {
  userId: string;
}

export interface CreateSandboxResult {
  session: Session;
  urls: ServiceUrls;
  sessionToken?: string;
  configMissing?: boolean;
}

export interface ResumeSandboxResult {
  session: Session;
  urls: ServiceUrls;
  sessionToken?: string;
  configMissing?: boolean;
}

export interface ResumeOptions {
  userGithubToken?: string;
  userGitName?: string;
  userGitEmail?: string;
}

export interface SandboxServiceOptions {
  projectsRepo: ProjectsRepository;
  sessionsRepo: SessionsRepository;
  dockerEnabled?: boolean;
  db?: Kysely<Database>;
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
  private claudeInjectionService: ClaudeInjectionService | null = null;
  private db: Kysely<Database> | null = null;
  private k8sSandboxService: K8sSandboxService | null = null;

  // Default ports for services
  private static readonly PORTS = {
    mastra: 4111,
    astro: 4321,
    vscode: 8080,
    chrome: 9222,
    phoenix: 6006,
  };

  // Container image names (built from sandbox/ Dockerfiles)
  private static readonly IMAGES = {
    init: 'mastragen-init',
    mastra: 'mastragen-mastra',
    astro: 'mastragen-astro',
    vscode: 'mastragen-vscode',
    chrome: 'ghcr.io/browserless/chromium:latest',
    phoenix: 'arizephoenix/phoenix:latest',
  };

  // Cache for session -> project mapping (for URL generation)
  private sessionProjectCache: Map<string, Project> = new Map();

  // Cache for session -> Phoenix enablement (for URL generation)
  private sessionPhoenixCache: Map<string, boolean> = new Map();

  // Cache for session -> config missing status (for API response)
  private sessionConfigMissingCache: Map<string, boolean> = new Map();

  constructor(options: SandboxServiceOptions) {
    this.projectsRepo = options.projectsRepo;
    this.sessionsRepo = options.sessionsRepo;
    this.dockerEnabled = options.dockerEnabled ?? true;
    this.docker = new Docker();
    if (options.db) {
      this.db = options.db;
      this.claudeInjectionService = new ClaudeInjectionService(options.db);
    }
    // Try to create K8s sandbox service if running in K8s environment
    this.k8sSandboxService = createK8sSandboxService();
    if (this.k8sSandboxService) {
      console.log('[SandboxService] K8s sandbox service initialized - running in K8s mode');
    }
  }

  /**
   * Check if running in K8s mode.
   */
  isK8sMode(): boolean {
    return this.k8sSandboxService !== null;
  }

  /**
   * Creates a new sandbox session.
   */
  async create(input: CreateSandboxInput): Promise<CreateSandboxResult> {
    const {
      projectId,
      artifactName,
      environment,
      claudeToken,
      userId,
      userGithubToken,
      userGitName,
      userGitEmail,
    } = input;

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

    // Create session in database
    const session = await this.sessionsRepo.create({
      project_id: projectId,
      artifact_name: artifactName,
      environment,
      workspace_volume: workspaceVolume,
      // container_id will be set when Docker containers are started
    });

    // Cache project for URL generation
    this.sessionProjectCache.set(session.id, project);

    // Generate session-scoped token for API authentication
    let sessionToken: string | undefined;
    if (this.db) {
      const authService = new AuthService(this.db);
      sessionToken = await authService.generateSessionToken(session.id, userId ?? '');
    }

    // Start Docker containers if enabled
    console.log(`[SandboxService] create() - dockerEnabled: ${this.dockerEnabled}`);
    if (this.dockerEnabled) {
      console.log('[SandboxService] create() - calling startContainers...');
      try {
        await this.startContainers(
          session,
          project,
          env.env_vars,
          claudeToken,
          userId,
          userGithubToken,
          userGitName,
          userGitEmail,
          sessionToken
        );
        console.log('[SandboxService] create() - startContainers completed');
      } catch (err) {
        console.error('[SandboxService] create() - startContainers failed:', err);
        throw err;
      }
    } else {
      console.log('[SandboxService] create() - Docker disabled, skipping container creation');
      // When Docker is disabled, we can't check config - assume missing
      this.sessionConfigMissingCache.set(session.id, true);
    }

    return {
      session,
      urls: this.getServiceUrls(session.id, project),
      sessionToken,
      configMissing: this.sessionConfigMissingCache.get(session.id) ?? true,
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
    const {
      projectId,
      artifactName,
      environment,
      userId,
      claudeToken,
      userGithubToken,
      userGitName,
      userGitEmail,
    } = input;

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

    // Create session in database with user_id and branch_name
    const session = await this.sessionsRepo.create({
      id: sessionId,
      project_id: projectId,
      artifact_name: artifactName,
      environment,
      workspace_volume: workspaceVolume,
      user_id: userId,
      branch_name: branchName,
    });

    // Cache project for URL generation
    this.sessionProjectCache.set(session.id, project);

    // Generate session-scoped token for API authentication
    let sessionToken: string | undefined;
    if (this.db) {
      const authService = new AuthService(this.db);
      sessionToken = await authService.generateSessionToken(session.id, userId);
    }

    // Start Docker containers if enabled (T046-T048)
    console.log(`[SandboxService] createWithGit() - dockerEnabled: ${this.dockerEnabled}`);
    if (this.dockerEnabled) {
      console.log('[SandboxService] createWithGit() - calling startContainers...');
      try {
        await this.startContainers(
          session,
          project,
          env.env_vars,
          claudeToken,
          userId,
          userGithubToken,
          userGitName,
          userGitEmail,
          sessionToken
        );
        console.log('[SandboxService] createWithGit() - startContainers completed');
      } catch (err) {
        console.error('[SandboxService] createWithGit() - startContainers failed:', err);
        throw err;
      }
    } else {
      console.log(
        '[SandboxService] createWithGit() - Docker disabled, skipping container creation'
      );
      // When Docker is disabled, we can't check config - assume missing
      this.sessionConfigMissingCache.set(session.id, true);
    }

    return {
      session,
      urls: this.getServiceUrls(session.id, project),
      sessionToken,
      configMissing: this.sessionConfigMissingCache.get(session.id) ?? true,
    };
  }

  /**
   * Gets service URLs for a session.
   */
  getServiceUrls(sessionId: string, project?: Project): ServiceUrls {
    // K8s mode: use K8sSandboxService URLs (HTTPS via Tailscale)
    if (this.k8sSandboxService) {
      const k8sUrls = this.k8sSandboxService.getServiceUrls(sessionId);
      const cachedProject = project ?? this.sessionProjectCache.get(sessionId);
      return {
        mastra: k8sUrls.mastra,
        astro: cachedProject?.ui_sandbox_path ? k8sUrls.astro : null,
        vscode: k8sUrls.vscode,
        phoenix: k8sUrls.phoenix,
      };
    }

    // Docker mode: localhost URLs
    const cachedProject = project ?? this.sessionProjectCache.get(sessionId);
    const phoenixEnabled = this.sessionPhoenixCache.get(sessionId) ?? false;

    return {
      mastra: `http://localhost:${SandboxService.PORTS.mastra}`,
      astro: cachedProject?.ui_sandbox_path
        ? `http://localhost:${SandboxService.PORTS.astro}`
        : null,
      vscode: `http://localhost:${SandboxService.PORTS.vscode}`,
      phoenix: phoenixEnabled ? `http://localhost:${SandboxService.PORTS.phoenix}` : null,
    };
  }

  /**
   * Gets detailed session status for CLI progress display.
   * Returns null if session not found or status unavailable.
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
    // K8s mode: get detailed pod status
    if (this.k8sSandboxService) {
      return this.k8sSandboxService.getSessionStatus(sessionId);
    }

    // Docker mode: return simplified status (containers start quickly)
    // For now, return a basic "ready" status since Docker containers are typically
    // ready by the time the API returns. The CLI can fall back to port checking.
    return {
      phase: 'ready',
      message: 'Containers started',
      containers: [
        { name: 'mastra', ready: true, status: 'running' },
        { name: 'astro', ready: true, status: 'running' },
        { name: 'vscode', ready: true, status: 'running' },
      ],
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
   * @param options - Optional suspend options (claudeHistoryService)
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

    // Save Claude conversation history to workspace before committing (T038)
    if (options.claudeHistoryService) {
      await options.claudeHistoryService.saveClaudeHistory();
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
  async resume(
    sessionId: string,
    claudeToken?: string,
    options?: ResumeOptions
  ): Promise<ResumeSandboxResult> {
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

    // Generate session-scoped token for API authentication
    let sessionToken: string | undefined;
    if (this.db) {
      const authService = new AuthService(this.db);
      sessionToken = await authService.generateSessionToken(sessionId, session.user_id ?? '');
    }

    // Start Docker containers if enabled
    if (this.dockerEnabled && env) {
      await this.startContainers(
        updatedSession,
        project,
        env.env_vars,
        claudeToken,
        session.user_id ?? undefined,
        options?.userGithubToken,
        options?.userGitName,
        options?.userGitEmail,
        sessionToken
      );
    } else {
      // When Docker is disabled, we can't check config - assume missing
      this.sessionConfigMissingCache.set(sessionId, true);
    }

    return {
      session: updatedSession,
      urls: this.getServiceUrls(sessionId, project),
      sessionToken,
      configMissing: this.sessionConfigMissingCache.get(sessionId) ?? true,
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

    // Generate session-scoped token for API authentication
    let sessionToken: string | undefined;
    if (this.db) {
      const authService = new AuthService(this.db);
      sessionToken = await authService.generateSessionToken(sessionId, session.user_id ?? '');
    }

    // Start Docker containers if enabled
    if (this.dockerEnabled && env) {
      await this.startContainers(
        updatedSession,
        project,
        env.env_vars,
        options.claudeToken,
        session.user_id ?? undefined,
        options.userGithubToken,
        options.userGitName,
        options.userGitEmail,
        sessionToken
      );
    } else {
      // When Docker is disabled, we can't check config - assume missing
      this.sessionConfigMissingCache.set(sessionId, true);
    }

    // Restore Claude conversation history to container after containers start (T038)
    if (options.claudeHistoryService) {
      await options.claudeHistoryService.restoreClaudeHistory();
    }

    return {
      session: updatedSession,
      urls: this.getServiceUrls(sessionId, project),
      sessionToken,
      configMissing: this.sessionConfigMissingCache.get(sessionId) ?? true,
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
   * Scaffolds a .mastragen/config.toml file in the session's workspace.
   * Writes the config file and creates a git commit on the session's branch.
   *
   * @param sessionId - The session ID
   * @param components - The component configuration to write
   * @returns The commit SHA and branch name
   */
  async scaffoldConfig(
    sessionId: string,
    components: { phoenix?: { enabled: boolean }; astro?: { enabled: boolean; path?: string } }
  ): Promise<{ success: boolean; commitSha?: string; branch?: string; configPath: string }> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state !== 'active') {
      throw new SessionNotActiveError(sessionId);
    }

    const configPath = '.mastragen/config.toml';

    // Build the config TOML content
    const configLines = ['# Mastragen Project Configuration', 'version = "1"'];

    if (components.phoenix) {
      configLines.push('');
      configLines.push('[phoenix]');
      configLines.push(`enabled = ${components.phoenix.enabled}`);
    }

    if (components.astro) {
      configLines.push('');
      configLines.push('[astro]');
      configLines.push(`enabled = ${components.astro.enabled}`);
      if (components.astro.path) {
        configLines.push(`path = "${components.astro.path}"`);
      }
    }

    const configContent = `${configLines.join('\n')}\n`;

    // Docker mode: write to container and commit
    if (this.dockerEnabled) {
      // Find the vscode container (used for git operations)
      const vscodeContainerName = `${sessionId}-vscode`;
      const container = this.docker.getContainer(vscodeContainerName);

      try {
        // Create .mastragen directory if it doesn't exist
        const mkdirExec = await container.exec({
          Cmd: ['mkdir', '-p', '/workspace/.mastragen'],
          AttachStdout: true,
          AttachStderr: true,
        });
        await mkdirExec.start({});

        // Write the config file
        await this.writeFileToContainer(container, `/workspace/${configPath}`, configContent);

        // Stage and commit the file
        const addExec = await container.exec({
          Cmd: ['git', '-C', '/workspace', 'add', configPath],
          AttachStdout: true,
          AttachStderr: true,
        });
        await addExec.start({});

        const commitExec = await container.exec({
          Cmd: ['git', '-C', '/workspace', 'commit', '-m', 'chore: add mastragen config'],
          AttachStdout: true,
          AttachStderr: true,
        });
        const commitStream = await commitExec.start({});

        // Wait for commit to complete and get output
        await new Promise<void>((resolve) => {
          commitStream.on('end', resolve);
          commitStream.on('error', resolve);
        });

        // Get the commit SHA
        const shaExec = await container.exec({
          Cmd: ['git', '-C', '/workspace', 'rev-parse', 'HEAD'],
          AttachStdout: true,
          AttachStderr: true,
        });
        const shaStream = await shaExec.start({});
        let sha = '';
        await new Promise<void>((resolve) => {
          shaStream.on('data', (chunk: Buffer) => {
            sha += chunk.slice(8).toString().trim();
          });
          shaStream.on('end', resolve);
          shaStream.on('error', resolve);
        });

        // Get the current branch
        const branchExec = await container.exec({
          Cmd: ['git', '-C', '/workspace', 'rev-parse', '--abbrev-ref', 'HEAD'],
          AttachStdout: true,
          AttachStderr: true,
        });
        const branchStream = await branchExec.start({});
        let branch = '';
        await new Promise<void>((resolve) => {
          branchStream.on('data', (chunk: Buffer) => {
            branch += chunk.slice(8).toString().trim();
          });
          branchStream.on('end', resolve);
          branchStream.on('error', resolve);
        });

        // Update cache to reflect config now exists
        this.sessionConfigMissingCache.set(sessionId, false);

        return {
          success: true,
          commitSha: sha || undefined,
          branch: branch || session.branch_name || undefined,
          configPath,
        };
      } catch (err) {
        console.error('[SandboxService] Failed to scaffold config:', err);
        return { success: false, configPath };
      }
    }

    // Non-Docker mode (tests): just return success without actual file operations
    return { success: true, configPath };
  }

  /**
   * Cleans up a session: stops containers, optionally removes volume, and deletes from database.
   */
  async cleanup(sessionId: string, options: CleanupOptions = {}): Promise<void> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // K8s mode: cleanup via K8sSandboxService
    if (this.k8sSandboxService) {
      console.log(`[SandboxService] K8s mode: cleaning up session ${sessionId}`);

      // Deregister Tailscale device BEFORE deleting the pod to prevent orphaned devices
      await this.k8sSandboxService.deregisterTailscaleDevice(sessionId);

      // deleteSandboxPod handles pod, ConfigMap, and optionally PVC
      await this.k8sSandboxService.deleteSandboxPod(sessionId, { keepPVC: !options.removeVolume });
    } else if (this.dockerEnabled) {
      // Docker mode: original implementation
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
      `${sessionId}-mastra`,
      `${sessionId}-vscode`,
      `${sessionId}-astro`,
      `${sessionId}-chrome`,
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
    branch?: string,
    userGithubToken?: string
  ): Promise<void> {
    const containerName = `${sessionId}-init`;
    console.log(
      `[SandboxService] Running init container to clone ${githubRepo}${branch ? ` (branch: ${branch})` : ''}...`
    );

    try {
      const container = await this.docker.createContainer({
        name: containerName,
        Image: SandboxService.IMAGES.init,
        Env: [
          `GH_TOKEN=${userGithubToken || ''}`,
          `GITHUB_REPO=${githubRepo}`,
          ...(branch ? [`BRANCH=${branch}`] : []),
        ],
        HostConfig: {
          Binds: [`${volumeName}:/workspace`],
          NetworkMode: 'mastragen',
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
    claudeToken?: string,
    userId?: string,
    userGithubToken?: string,
    userGitName?: string,
    userGitEmail?: string,
    sessionToken?: string
  ): Promise<void> {
    console.log(`[SandboxService] startContainers called for session ${session.id}`);
    console.log(`[SandboxService] dockerEnabled: ${this.dockerEnabled}`);
    console.log(`[SandboxService] k8sMode: ${this.isK8sMode()}`);

    // K8s mode: delegate to K8sSandboxService
    if (this.k8sSandboxService) {
      console.log('[SandboxService] Using K8s sandbox service');

      // Parse environment variables from JSON string
      let parsedEnvVars: Record<string, string> = {};
      try {
        parsedEnvVars = JSON.parse(envVars || '{}');
      } catch {
        // If parsing fails, use empty object
      }

      // Add git credentials to env vars
      if (userGithubToken) parsedEnvVars.GH_TOKEN = userGithubToken;
      if (userGitName) parsedEnvVars.GIT_USER_NAME = userGitName;
      if (userGitEmail) parsedEnvVars.GIT_USER_EMAIL = userGitEmail;

      // Create PVC (idempotent for resume)
      await this.k8sSandboxService.createWorkspacePVC(session.id);

      // Create Claude ConfigMap BEFORE pod (K8s mode uses ConfigMap instead of exec)
      let claudeConfigMapName: string | undefined;
      if (this.claudeInjectionService) {
        claudeConfigMapName = await this.k8sSandboxService.createClaudeConfigMap(
          session,
          project,
          this.claudeInjectionService,
          {
            projectId: project.id,
            environment: session.environment,
            sessionId: session.id,
            userId,
            sessionToken,
            chromeMode: session.chrome_mode ?? undefined,
            userTailscaleHostname: session.user_tailscale_hostname ?? undefined,
          }
        );
      }

      // Create the sandbox pod with Claude ConfigMap reference
      // Note: Don't wait for pod ready here - CLI polls /status endpoint for progress
      await this.k8sSandboxService.createSandboxPod(
        session,
        project,
        parsedEnvVars,
        claudeToken,
        claudeConfigMapName
      );

      console.log('[SandboxService] K8s sandbox pod created, CLI will poll for ready status');
      return;
    }

    // Docker mode: original implementation
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
    await this.runInitContainer(
      session.id,
      volumeName,
      project.github_repo,
      session.branch_name ?? undefined,
      userGithubToken
    );

    // Read project config from workspace to check if Phoenix should be enabled
    const projectConfig = await this.readProjectConfigFromVolume(volumeName);
    console.log(
      `[SandboxService] Project config: Phoenix enabled=${projectConfig.phoenixEnabled}, configExists=${projectConfig.configExists}`
    );

    // Cache Phoenix enablement for URL generation
    this.sessionPhoenixCache.set(session.id, projectConfig.phoenixEnabled);

    // Cache config missing status for API response
    this.sessionConfigMissingCache.set(session.id, !projectConfig.configExists);

    // Parse environment variables from JSON string
    let parsedEnvVars: Record<string, string> = {};
    try {
      parsedEnvVars = JSON.parse(envVars || '{}');
    } catch {
      // If parsing fails, use empty object
    }

    // Build environment array for containers
    // Note: Only user's token (GH_TOKEN) is passed - orchestrator's GITHUB_TOKEN is never exposed to containers
    const baseEnv = [
      `GH_TOKEN=${userGithubToken || ''}`,
      `GIT_USER_NAME=${userGitName || ''}`,
      `GIT_USER_EMAIL=${userGitEmail || ''}`,
      // ANTHROPIC_API_KEY is set per-container (mastra uses server API key, vscode uses OAuth token)
      ...Object.entries(parsedEnvVars).map(([k, v]) => `${k}=${v}`),
    ];

    // Phoenix environment variables for Mastra container
    const phoenixEnv = projectConfig.phoenixEnabled
      ? [
          'PHOENIX_ENABLED=true',
          `PHOENIX_ENDPOINT=http://${session.id}-phoenix:6006/v1/traces`,
          'PHOENIX_PROJECT_NAME=mastragen-experiments',
        ]
      : ['PHOENIX_ENABLED=false'];

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
        name: `${session.id}-mastra`,
        image: SandboxService.IMAGES.mastra,
        port: SandboxService.PORTS.mastra,
        env: [
          ...baseEnv,
          ...phoenixEnv,
          `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`, // Mastra SDK needs actual API key
          ...(claudeToken ? [`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`] : []),
        ],
        workingDir: mastraWorkDir,
      },
      {
        name: `${session.id}-vscode`,
        image: SandboxService.IMAGES.vscode,
        port: SandboxService.PORTS.vscode,
        env: [
          ...baseEnv,
          // Claude Code extension uses OAuth token for authentication
          ...(claudeToken
            ? [`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`, `ANTHROPIC_API_KEY=${claudeToken}`]
            : []),
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

    // Add Chrome DevTools container for browser automation (sidecar mode)
    // This runs browserless/chromium which exposes Chrome DevTools Protocol
    containers.push({
      name: `${session.id}-chrome`,
      image: SandboxService.IMAGES.chrome,
      port: SandboxService.PORTS.chrome,
      env: [
        'CONNECTION_TIMEOUT=300000',
        'MAX_CONCURRENT_SESSIONS=2',
        'PREBOOT_CHROME=true',
        'DEFAULT_LAUNCH_ARGS=["--disable-dev-shm-usage"]',
      ],
    });

    // Add Phoenix container when enabled via project config
    if (projectConfig.phoenixEnabled) {
      containers.push({
        name: `${session.id}-phoenix`,
        image: SandboxService.IMAGES.phoenix,
        port: SandboxService.PORTS.phoenix,
        env: [
          'PHOENIX_SQL_DATABASE_URL=sqlite:////data/phoenix/phoenix.db',
          'PHOENIX_WORKING_DIR=/data/phoenix',
          `PHOENIX_TRACE_RETENTION_DAYS=${projectConfig.phoenixRetentionDays}`,
        ],
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
              NetworkMode: 'mastragen',
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

    // T048: Inject Claude configuration into the vscode container
    const vscodeContainerName = `${session.id}-vscode`;
    await this.injectClaudeConfig(session.id, vscodeContainerName, {
      projectId: project.id,
      environment: session.environment,
      userId: userId ?? session.user_id ?? undefined,
      chromeMode: session.chrome_mode ?? undefined,
      userTailscaleHostname: session.user_tailscale_hostname ?? undefined,
    });
  }

  /**
   * Stops Docker containers for a session (used for suspend).
   * In K8s mode, keeps PVC for resume.
   */
  private async stopContainers(session: Session): Promise<void> {
    // K8s mode: delete pod but keep PVC for resume
    if (this.k8sSandboxService) {
      console.log(
        `[SandboxService] K8s mode: deleting pod for session ${session.id} (keeping PVC)`
      );
      await this.k8sSandboxService.deleteSandboxPod(session.id, { keepPVC: true });
      return;
    }

    // Docker mode: original implementation
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

  /**
   * Injects Claude configuration files into the VS Code container.
   * Writes settings.json, CLAUDE.md, and custom commands to the container.
   *
   * @param sessionId - The session ID
   * @param containerName - Name of the VS Code container (e.g., "{sessionId}-vscode")
   * @param config - Configuration for Claude settings generation
   */
  private async injectClaudeConfig(
    sessionId: string,
    containerName: string,
    config: {
      projectId: string;
      environment: string;
      userId?: string;
      chromeMode?: 'sidecar' | 'local';
      userTailscaleHostname?: string;
    }
  ): Promise<void> {
    if (!this.claudeInjectionService) {
      console.log(
        '[SandboxService] Claude injection service not available, skipping config injection'
      );
      return;
    }

    console.log(`[SandboxService] Injecting Claude config into container ${containerName}...`);

    const container = this.docker.getContainer(containerName);

    try {
      // Generate settings.json with chrome mode configuration
      const settings = await this.claudeInjectionService.generateSettings({
        projectId: config.projectId,
        environment: config.environment,
        sessionId,
        chromeMode: config.chromeMode,
        userTailscaleHostname: config.userTailscaleHostname,
      });

      // Generate CLAUDE.md
      const claudeMd = await this.claudeInjectionService.generateClaudeMd({
        projectId: config.projectId,
        environment: config.environment,
        sessionId,
        chromeMode: config.chromeMode,
        userTailscaleHostname: config.userTailscaleHostname,
      });

      // Get built-in and project-specific commands
      const builtinCommands = await this.claudeInjectionService.getBuiltinCommands();
      const projectCommands = await this.claudeInjectionService.getCommands({
        projectId: config.projectId,
        environment: config.environment,
      });
      const allCommands = [...builtinCommands, ...projectCommands];

      // Get built-in skills
      const builtinSkills = await this.claudeInjectionService.getBuiltinSkills();

      // Create directories in the container
      await this.execInContainer(container, ['mkdir', '-p', '/home/coder/.claude/commands']);
      await this.execInContainer(container, ['mkdir', '-p', '/home/coder/.claude/skills']);

      // Write settings.json (without mcpServers - those go in ~/.claude.json)
      const { mcpServers, ...settingsWithoutMcp } = settings;
      const settingsJsonClean = JSON.stringify(settingsWithoutMcp, null, 2);
      await this.writeFileToContainer(
        container,
        '/home/coder/.claude/settings.json',
        settingsJsonClean
      );
      console.log('[SandboxService] Wrote settings.json to container');

      // Write MCP servers to ~/.claude.json (the correct location for MCP config)
      const claudeJsonConfig = { mcpServers };
      await this.writeFileToContainer(
        container,
        '/home/coder/.claude.json',
        JSON.stringify(claudeJsonConfig, null, 2)
      );
      console.log('[SandboxService] Wrote MCP config to ~/.claude.json');

      // Write CLAUDE.md to .claude directory (global instructions)
      await this.writeFileToContainer(container, '/home/coder/.claude/CLAUDE.md', claudeMd);
      console.log('[SandboxService] Wrote CLAUDE.md to .claude directory');

      // Write all commands (built-in + project-specific)
      for (const command of allCommands) {
        const commandPath = `/home/coder/.claude/commands/${command.name}.md`;
        await this.writeFileToContainer(container, commandPath, command.content);
        console.log(`[SandboxService] Wrote command ${command.name}.md`);
      }

      // Write built-in skills (each skill is a folder with SKILL.md inside)
      for (const skill of builtinSkills) {
        const skillDir = `/home/coder/.claude/skills/${skill.name}`;
        await this.execInContainer(container, ['mkdir', '-p', skillDir]);
        await this.writeFileToContainer(container, `${skillDir}/SKILL.md`, skill.content);
        console.log(`[SandboxService] Wrote skill ${skill.name}/SKILL.md`);
      }

      // Generate session-scoped JWT for API authentication
      let sessionToken: string | undefined;
      if (this.db) {
        const authService = new AuthService(this.db);
        sessionToken = await authService.generateSessionToken(sessionId, config.userId ?? '');
      }

      // Get and set session-specific environment variables
      const envVars = await this.claudeInjectionService.getSessionEnvVars({
        projectId: config.projectId,
        environment: config.environment,
        sessionId,
        userId: config.userId ?? '',
        sessionToken,
      });

      // Write environment variables to a file that can be sourced
      const envContent = Object.entries(envVars)
        .map(([k, v]) => `export ${k}="${v}"`)
        .join('\n');
      await this.writeFileToContainer(container, '/home/coder/.claude/env.sh', envContent);
      console.log('[SandboxService] Wrote env.sh with session variables');

      console.log('[SandboxService] Claude config injection complete');
    } catch (err) {
      console.error('[SandboxService] Failed to inject Claude config:', err);
      // Don't throw - Claude config injection failure shouldn't prevent session creation
    }
  }

  /**
   * Executes a command in a container.
   */
  private async execInContainer(container: Docker.Container, cmd: string[]): Promise<void> {
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({ Detach: true });
  }

  /**
   * Writes content to a file in a container using Docker's putArchive API.
   */
  private async writeFileToContainer(
    container: Docker.Container,
    filePath: string,
    content: string
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const dirPath = path.dirname(filePath);

    const tarStream = pack();
    tarStream.entry({ name: fileName }, content);
    tarStream.finalize();

    await container.putArchive(tarStream, { path: dirPath });
  }

  /**
   * Reads the project config from a Docker volume.
   *
   * Uses a temporary Alpine container to read the file from the workspace volume.
   * Returns configExists: false if the config file doesn't exist or can't be read.
   */
  private async readProjectConfigFromVolume(volumeName: string): Promise<{
    phoenixEnabled: boolean;
    phoenixRetentionDays: number;
    configExists: boolean;
  }> {
    const defaults = { phoenixEnabled: false, phoenixRetentionDays: 30, configExists: false };

    try {
      // Create temporary container to read the config file
      const container = await this.docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['cat', '/workspace/.mastragen/config.toml'],
        HostConfig: {
          Binds: [`${volumeName}:/workspace:ro`],
          AutoRemove: true,
        },
      });

      await container.start();
      const stream = await container.logs({ stdout: true, stderr: true, follow: true });

      // Collect output
      let output = '';
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          // Docker log format includes 8-byte header, skip it
          output += chunk.slice(8).toString();
        });
        stream.on('end', () => resolve());
        stream.on('error', () => resolve());
      });

      await container.wait();

      if (!output.trim()) {
        console.log('[SandboxService] No project config found, using defaults');
        return defaults;
      }

      // Parse TOML properly
      try {
        const config = parseToml(output) as {
          phoenix?: { enabled?: boolean; retention?: { traces_days?: number } };
        };

        return {
          phoenixEnabled: config.phoenix?.enabled ?? false,
          phoenixRetentionDays: config.phoenix?.retention?.traces_days ?? 30,
          configExists: true,
        };
      } catch (parseErr) {
        console.log('[SandboxService] Failed to parse config TOML:', parseErr);
        return { ...defaults, configExists: true };
      }
    } catch (err) {
      console.log('[SandboxService] Error reading project config:', err);
      return defaults;
    }
  }
}
