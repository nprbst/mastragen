import Docker from 'dockerode';

/**
 * Error thrown when a git operation fails.
 */
export class GitOperationError extends Error {
  constructor(
    public operation: string,
    public exitCode: number | null,
    message: string
  ) {
    super(`Git ${operation} failed: ${message}`);
    this.name = 'GitOperationError';
  }
}

/**
 * Result of git status command.
 */
export interface GitStatus {
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Result of git commit command.
 */
export interface CommitResult {
  sha: string;
  message: string;
}

export interface GitServiceOptions {
  docker: Docker;
  containerId: string;
  workspacePath: string;
}

/**
 * Service for executing git operations inside Docker containers.
 * Uses Docker exec to run git commands in the workspace.
 */
export class GitService {
  private docker: Docker;
  private containerId: string;
  private workspacePath: string;

  constructor(options: GitServiceOptions) {
    this.docker = options.docker;
    this.containerId = options.containerId;
    this.workspacePath = options.workspacePath;
  }

  /**
   * Executes a git command inside the container.
   */
  private async execGit(
    args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(this.containerId);

    const exec = await container.exec({
      Cmd: ['git', '-C', this.workspacePath, ...args],
      AttachStdout: true,
      AttachStderr: true,
    });

    const operation = args[0] ?? 'unknown';

    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          reject(new GitOperationError(operation, null, err.message));
          return;
        }

        if (!stream) {
          reject(new GitOperationError(operation, null, 'No stream returned'));
          return;
        }

        let stdout = '';
        let stderr = '';

        // Docker multiplexes stdout/stderr into a single stream
        // Each frame has an 8-byte header: [type (1), 0, 0, 0, size (4)]
        stream.on('data', (chunk: Buffer) => {
          // Simple approach: treat all output as stdout for now
          // A more robust implementation would parse the multiplexed stream
          stdout += chunk.toString();
        });

        stream.on('end', async () => {
          try {
            const inspectResult = await exec.inspect();
            resolve({
              stdout,
              stderr,
              exitCode: inspectResult.ExitCode ?? 0,
            });
          } catch (inspectErr) {
            // If inspect fails, assume success if we got output
            resolve({
              stdout,
              stderr,
              exitCode: 0,
            });
          }
        });

        stream.on('error', (streamErr: Error) => {
          reject(new GitOperationError(operation, null, streamErr.message));
        });
      });
    });
  }

  /**
   * Checks the git status for uncommitted changes.
   */
  async getStatus(): Promise<GitStatus> {
    try {
      const result = await this.execGit(['status', '--porcelain']);

      if (!result.stdout) {
        return {
          hasChanges: false,
          staged: [],
          unstaged: [],
          untracked: [],
        };
      }

      const lines = result.stdout.split('\n').filter((line) => line.length > 0);
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        // Git status --porcelain format: XY filename
        // X = status in staging area, Y = status in work tree
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filename = line.slice(3);

        if (indexStatus === '?') {
          untracked.push(filename);
        } else if (indexStatus !== ' ') {
          staged.push(filename);
        }

        if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
          unstaged.push(filename);
        }
      }

      return {
        hasChanges: lines.length > 0,
        staged,
        unstaged,
        untracked,
      };
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'status',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Stages all changes and creates a commit.
   * Returns null if there are no changes to commit.
   */
  async commitAll(message: string): Promise<CommitResult | null> {
    try {
      // Stage all changes
      await this.execGit(['add', '-A']);

      // Create commit
      const commitResult = await this.execGit(['commit', '-m', message]);

      // Check if there was nothing to commit
      if (
        commitResult.stdout.includes('nothing to commit') ||
        commitResult.exitCode !== 0
      ) {
        return null;
      }

      // Get the commit SHA
      const shaResult = await this.execGit(['rev-parse', 'HEAD']);

      return {
        sha: shaResult.stdout.trim(),
        message,
      };
    } catch (error) {
      // "nothing to commit" is not an error
      if (
        error instanceof Error &&
        error.message.includes('nothing to commit')
      ) {
        return null;
      }
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'commit',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Creates a new branch from a base branch or commit.
   */
  async createBranch(name: string, base: string): Promise<void> {
    try {
      const result = await this.execGit(['checkout', '-b', name, base]);

      if (result.exitCode !== 0 && result.stderr) {
        throw new GitOperationError('createBranch', result.exitCode, result.stderr);
      }
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'createBranch',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Pushes a branch to origin.
   */
  async push(branch: string, setUpstream = true): Promise<void> {
    try {
      const args = setUpstream
        ? ['push', '-u', 'origin', branch]
        : ['push', 'origin', branch];

      const result = await this.execGit(args);

      if (result.exitCode !== 0 && result.stderr?.includes('fatal:')) {
        throw new GitOperationError('push', result.exitCode, result.stderr);
      }
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'push',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Clones a repository into the workspace.
   */
  async clone(repoUrl: string, branch?: string): Promise<void> {
    try {
      const args = branch
        ? ['clone', '-b', branch, repoUrl, this.workspacePath]
        : ['clone', repoUrl, this.workspacePath];

      const result = await this.execGit(args);

      if (result.exitCode !== 0 && result.stderr?.includes('fatal:')) {
        throw new GitOperationError('clone', result.exitCode, result.stderr);
      }
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'clone',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Checks out a branch or commit.
   */
  async checkout(ref: string): Promise<void> {
    try {
      const result = await this.execGit(['checkout', ref]);

      if (result.exitCode !== 0 && result.stderr?.includes('error:')) {
        throw new GitOperationError('checkout', result.exitCode, result.stderr);
      }
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'checkout',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Ensures .gitattributes has .cui/ export-ignore entry.
   * This excludes the .cui/ directory from git archive exports.
   */
  async ensureGitAttributes(): Promise<void> {
    try {
      const gitattributesPath = `${this.workspacePath}/.gitattributes`;
      const exportIgnoreEntry = '.cui/ export-ignore';

      // Check if .gitattributes exists and read it
      const catResult = await this.execGit(['show', `HEAD:.gitattributes`]).catch(
        () => ({ stdout: '', exitCode: 1, stderr: '' })
      );

      // Check if the entry already exists
      if (catResult.stdout.includes(exportIgnoreEntry)) {
        return;
      }

      // Append the entry to .gitattributes
      // We need to use shell commands for file operations
      const container = this.docker.getContainer(this.containerId);

      const exec = await container.exec({
        Cmd: [
          'sh',
          '-c',
          `echo '${exportIgnoreEntry}' >> ${gitattributesPath}`,
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      await new Promise<void>((resolve, reject) => {
        exec.start({ hijack: true, stdin: false }, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          if (stream) {
            stream.on('end', () => resolve());
            stream.on('error', reject);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'ensureGitAttributes',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
      return result.stdout.trim();
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'getCurrentBranch',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets the current commit SHA.
   */
  async getCurrentSha(): Promise<string> {
    try {
      const result = await this.execGit(['rev-parse', 'HEAD']);
      return result.stdout.trim();
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'getCurrentSha',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets the commit count on the current branch.
   */
  async getCommitCount(): Promise<number> {
    try {
      const result = await this.execGit(['rev-list', '--count', 'HEAD']);
      return Number.parseInt(result.stdout.trim(), 10);
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'getCommitCount',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Configures git user for commits.
   */
  async configureUser(name: string, email: string): Promise<void> {
    try {
      await this.execGit(['config', 'user.name', name]);
      await this.execGit(['config', 'user.email', email]);
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw error;
      }
      throw new GitOperationError(
        'configureUser',
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
