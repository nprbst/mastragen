import { Octokit } from '@octokit/rest';

/**
 * Error thrown when a GitHub API operation fails.
 * Includes operation context and suggestions for resolution.
 */
export class GitHubAPIError extends Error {
  constructor(
    public operation: string,
    public statusCode: number | null,
    message: string,
    public context?: { owner?: string; repo?: string; branch?: string }
  ) {
    const contextInfo = context
      ? ` (${Object.entries(context)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')})`
      : '';
    super(`GitHub API ${operation} failed${contextInfo}: ${message}`);
    this.name = 'GitHubAPIError';
  }

  /**
   * Returns a user-friendly error message with suggestions.
   */
  getUserMessage(): string {
    const suggestions: Record<number, string> = {
      401: 'Check your GitHub authentication credentials.',
      403: 'You may have hit the rate limit or lack access. Try again later.',
      404: 'The repository or resource was not found. Check the repo name and your access.',
      422: 'The request was invalid. Check the parameters.',
    };

    if (this.statusCode && suggestions[this.statusCode]) {
      return `${this.message}. ${suggestions[this.statusCode]}`;
    }

    return this.message;
  }
}

/**
 * Error thrown when a user lacks required permissions.
 * Provides actionable information about what permission is needed.
 */
export class InsufficientPermissionsError extends Error {
  constructor(
    public username: string,
    public repo: string,
    public requiredPermission: string
  ) {
    super(
      `User '${username}' lacks '${requiredPermission}' permission for '${repo}'. Request access from the repository owner or use an account with write permissions.`
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
      if (match?.[1] && match[2]) {
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
   * Logs retry attempts and timing information.
   */
  private async withRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: { owner?: string; repo?: string; branch?: string }
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        const duration = Date.now() - startTime;
        if (attempt > 1) {
          console.log(
            `[GitHubService] ${operation} - succeeded on attempt ${attempt} (${duration}ms)`
          );
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        const status = (error as any).status;

        // Check if it's a rate limit error
        const isRateLimit =
          status === 403 || status === 429 || (error as any).message?.includes('rate limit');

        if (!isRateLimit || attempt === this.maxRetries) {
          const duration = Date.now() - startTime;
          console.error(
            `[GitHubService] ${operation} - failed after ${attempt} attempt(s) (${duration}ms):`,
            { status, message: lastError.message }
          );
          throw new GitHubAPIError(operation, status ?? null, lastError.message, context);
        }

        // Exponential backoff: delay * 2^(attempt-1)
        const delay = this.retryDelayMs * 2 ** (attempt - 1);
        console.warn(
          `[GitHubService] ${operation} - rate limited (status ${status}), retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new GitHubAPIError(operation, null, lastError?.message ?? 'Unknown error', context);
  }

  /**
   * Checks a user's permissions on a repository.
   */
  async checkUserPermissions(
    owner: string,
    repo: string,
    username: string
  ): Promise<RepoPermissions> {
    const startTime = Date.now();
    console.log(`[GitHubService] checkUserPermissions - checking ${username} on ${owner}/${repo}`);

    const result = await this.withRetry(
      'checkUserPermissions',
      async () => {
        const response = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username,
        });

        const permission = response.data.permission;

        return {
          canRead: ['read', 'triage', 'write', 'maintain', 'admin'].includes(permission),
          canWrite: ['write', 'maintain', 'admin'].includes(permission),
          canAdmin: permission === 'admin',
          permission,
        };
      },
      { owner, repo }
    );

    const duration = Date.now() - startTime;
    console.log(
      `[GitHubService] checkUserPermissions - ${username} has '${result.permission}' permission (canWrite: ${result.canWrite}) (${duration}ms)`
    );

    return result;
  }

  /**
   * Creates a pull request.
   */
  async createPullRequest(input: PRCreateInput): Promise<PRResult> {
    const startTime = Date.now();
    console.log(
      `[GitHubService] createPullRequest - creating PR '${input.title}' (${input.head} → ${input.base})`
    );

    const result = await this.withRetry(
      'createPullRequest',
      async () => {
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
      },
      { owner: input.owner, repo: input.repo, branch: input.head }
    );

    const duration = Date.now() - startTime;
    console.log(
      `[GitHubService] createPullRequest - created PR #${result.number} at ${result.url} (${duration}ms)`
    );

    return result;
  }

  /**
   * Gets pull request details.
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PRResult> {
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
        state: response.data.merged ? 'merged' : (response.data.state as 'open' | 'closed'),
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
    const startTime = Date.now();
    console.log(
      `[GitHubService] createBranch - creating '${branchName}' from ${fromSha.substring(0, 8)}`
    );

    await this.withRetry(
      'createBranch',
      async () => {
        await this.octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: fromSha,
        });
      },
      { owner, repo, branch: branchName }
    );

    const duration = Date.now() - startTime;
    console.log(`[GitHubService] createBranch - created '${branchName}' (${duration}ms)`);
  }

  /**
   * Gets the SHA for a branch. If branch is not provided, uses the repo's default branch.
   */
  async getDefaultBranchSha(owner: string, repo: string, branch?: string): Promise<string> {
    const startTime = Date.now();
    console.log(
      `[GitHubService] getDefaultBranchSha - fetching for ${owner}/${repo}${branch ? ` (branch: ${branch})` : ''}`
    );

    const result = await this.withRetry(
      'getDefaultBranchSha',
      async () => {
        let targetBranch = branch;

        if (!targetBranch) {
          const repoResponse = await this.octokit.rest.repos.get({
            owner,
            repo,
          });
          targetBranch = repoResponse.data.default_branch;
        }

        const branchResponse = await this.octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: targetBranch,
        });

        return branchResponse.data.commit.sha;
      },
      { owner, repo }
    );

    const duration = Date.now() - startTime;
    console.log(
      `[GitHubService] getDefaultBranchSha - SHA is ${result.substring(0, 8)} (${duration}ms)`
    );

    return result;
  }

  /**
   * Checks if a branch exists.
   */
  async branchExists(owner: string, repo: string, branchName: string): Promise<boolean> {
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

  /**
   * Checks if a file exists in a repository at a specific ref.
   */
  async fileExists(owner: string, repo: string, path: string, ref: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      return true;
    } catch (error) {
      if ((error as any).status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the content of a file from a repository at a specific ref.
   * Returns null if the file doesn't exist.
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      // getContent returns an array for directories, single object for files
      const data = response.data;
      if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
        return null;
      }

      // Content is base64 encoded
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
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
