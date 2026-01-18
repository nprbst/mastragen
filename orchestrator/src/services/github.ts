import { Octokit } from '@octokit/rest';

/**
 * Error thrown when a GitHub API operation fails.
 */
export class GitHubAPIError extends Error {
  constructor(
    public operation: string,
    public statusCode: number | null,
    message: string
  ) {
    super(`GitHub API ${operation} failed: ${message}`);
    this.name = 'GitHubAPIError';
  }
}

/**
 * Error thrown when a user lacks required permissions.
 */
export class InsufficientPermissionsError extends Error {
  constructor(
    public username: string,
    public repo: string,
    public requiredPermission: string
  ) {
    super(
      `User ${username} lacks ${requiredPermission} permission for ${repo}`
    );
    this.name = 'InsufficientPermissionsError';
  }
}

/**
 * Repository permissions for a user.
 */
export interface RepoPermissions {
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  permission: string;
}

/**
 * Input for creating a pull request.
 */
export interface PRCreateInput {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
}

/**
 * Result of a pull request operation.
 */
export interface PRResult {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
}

export interface GitHubServiceOptions {
  octokit: Octokit;
  getInstallationToken?: () => Promise<string>;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Service for GitHub API operations using Octokit.
 */
export class GitHubService {
  private octokit: Octokit;
  private getInstallationToken?: () => Promise<string>;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: GitHubServiceOptions) {
    this.octokit = options.octokit;
    this.getInstallationToken = options.getInstallationToken;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 10000; // 10 seconds default
  }

  /**
   * Parses a GitHub repository string into owner and repo.
   * Supports formats: "owner/repo", "https://github.com/owner/repo", "https://github.com/owner/repo.git"
   */
  static parseRepo(githubRepo: string): { owner: string; repo: string } {
    // Remove .git suffix if present
    const cleaned = githubRepo.replace(/\.git$/, '');

    // Handle full URL
    if (cleaned.includes('github.com')) {
      const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/);
      if (match && match[1] && match[2]) {
        return { owner: match[1], repo: match[2] };
      }
    }

    // Handle owner/repo format
    const parts = cleaned.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }

    throw new Error(`Invalid GitHub repository format: ${githubRepo}`);
  }

  /**
   * Executes an operation with retry logic for rate limiting.
   */
  private async withRetry<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        const isRateLimit =
          (error as any).status === 403 ||
          (error as any).status === 429 ||
          (error as any).message?.includes('rate limit');

        if (!isRateLimit || attempt === this.maxRetries) {
          throw new GitHubAPIError(
            operation,
            (error as any).status ?? null,
            lastError.message
          );
        }

        // Exponential backoff: delay * 2^(attempt-1)
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new GitHubAPIError(
      operation,
      null,
      lastError?.message ?? 'Unknown error'
    );
  }

  /**
   * Checks a user's permissions on a repository.
   */
  async checkUserPermissions(
    owner: string,
    repo: string,
    username: string
  ): Promise<RepoPermissions> {
    return this.withRetry('checkUserPermissions', async () => {
      const response = await this.octokit.rest.repos.getCollaboratorPermissionLevel(
        {
          owner,
          repo,
          username,
        }
      );

      const permission = response.data.permission;

      return {
        canRead: ['read', 'triage', 'write', 'maintain', 'admin'].includes(
          permission
        ),
        canWrite: ['write', 'maintain', 'admin'].includes(permission),
        canAdmin: permission === 'admin',
        permission,
      };
    });
  }

  /**
   * Creates a pull request.
   */
  async createPullRequest(input: PRCreateInput): Promise<PRResult> {
    return this.withRetry('createPullRequest', async () => {
      const response = await this.octokit.rest.pulls.create({
        owner: input.owner,
        repo: input.repo,
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
      });

      return {
        number: response.data.number,
        url: response.data.html_url,
        title: response.data.title,
        state: response.data.state as 'open' | 'closed' | 'merged',
      };
    });
  }

  /**
   * Gets pull request details.
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRResult> {
    return this.withRetry('getPullRequest', async () => {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        number: response.data.number,
        url: response.data.html_url,
        title: response.data.title,
        state: response.data.merged
          ? 'merged'
          : (response.data.state as 'open' | 'closed'),
      };
    });
  }

  /**
   * Gets a clone URL with an authentication token embedded.
   */
  async getCloneUrl(owner: string, repo: string): Promise<string> {
    if (this.getInstallationToken) {
      const token = await this.getInstallationToken();
      return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    }

    // Fall back to regular HTTPS URL
    return `https://github.com/${owner}/${repo}.git`;
  }

  /**
   * Creates a branch on the remote repository.
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string
  ): Promise<void> {
    return this.withRetry('createBranch', async () => {
      await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: fromSha,
      });
    });
  }

  /**
   * Gets the default branch SHA for a repository.
   */
  async getDefaultBranchSha(owner: string, repo: string): Promise<string> {
    return this.withRetry('getDefaultBranchSha', async () => {
      const repoResponse = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      const defaultBranch = repoResponse.data.default_branch;

      const branchResponse = await this.octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: defaultBranch,
      });

      return branchResponse.data.commit.sha;
    });
  }

  /**
   * Checks if a branch exists.
   */
  async branchExists(
    owner: string,
    repo: string,
    branchName: string
  ): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      return true;
    } catch (error) {
      if ((error as any).status === 404) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Creates a GitHubService instance with GitHub App authentication.
 */
export function createGitHubServiceWithAppAuth(options: {
  appId: string;
  privateKey: string;
  installationId: string;
  maxRetries?: number;
  retryDelayMs?: number;
}): GitHubService {
  // Import dynamically to avoid issues if not using App auth
  const { createAppAuth } = require('@octokit/auth-app');

  const auth = createAppAuth({
    appId: options.appId,
    privateKey: options.privateKey,
    installationId: options.installationId,
  });

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: options.appId,
      privateKey: options.privateKey,
      installationId: options.installationId,
    },
  });

  return new GitHubService({
    octokit,
    getInstallationToken: async () => {
      const authResult = await auth({ type: 'installation' });
      return authResult.token;
    },
    maxRetries: options.maxRetries,
    retryDelayMs: options.retryDelayMs,
  });
}
