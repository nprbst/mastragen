import Docker from 'dockerode';

/**
 * Service for persisting and restoring Claude Code conversation history.
 *
 * Claude Code stores conversation history in /home/coder/.claude/projects/-workspace/*.jsonl
 * This service copies history to/from the workspace's .claude-history/ directory so it
 * can be versioned with git.
 */
export class ClaudeHistoryService {
  private docker: Docker;
  private containerId: string;
  private workspacePath: string;

  // Claude Code stores history in this directory inside the container
  private static readonly CLAUDE_HISTORY_PATH = '/home/coder/.claude/projects/-workspace';
  // Directory in workspace where history is persisted for git
  private static readonly WORKSPACE_HISTORY_DIR = '.claude-history';

  constructor(options: { docker: Docker; containerId: string; workspacePath: string }) {
    this.docker = options.docker;
    this.containerId = options.containerId;
    this.workspacePath = options.workspacePath;
  }

  /**
   * Executes a shell command inside the vscode container.
   */
  private async execShell(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(this.containerId);

    const exec = await container.exec({
      Cmd: ['sh', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        if (!stream) {
          reject(new Error('No stream returned'));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk: Buffer) => {
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
          } catch {
            resolve({ stdout, stderr, exitCode: 0 });
          }
        });

        stream.on('error', (streamErr: Error) => {
          reject(streamErr);
        });
      });
    });
  }

  /**
   * Saves Claude Code conversation history from the container to the workspace.
   * Copies /home/coder/.claude/projects/-workspace/*.jsonl to {workspace}/.claude-history/
   *
   * This should be called before git commit during suspend.
   */
  async saveClaudeHistory(): Promise<void> {
    const destDir = `${this.workspacePath}/${ClaudeHistoryService.WORKSPACE_HISTORY_DIR}`;

    // Create the .claude-history directory in workspace if it doesn't exist
    await this.execShell(`mkdir -p ${destDir}`);

    // Check if there are any history files to copy
    const checkResult = await this.execShell(
      `ls -1 ${ClaudeHistoryService.CLAUDE_HISTORY_PATH}/*.jsonl 2>/dev/null || true`
    );

    if (!checkResult.stdout.trim()) {
      // No history files exist, nothing to copy
      return;
    }

    // Copy all .jsonl files from Claude history to workspace .claude-history/
    // Using cp with -f to overwrite existing files
    await this.execShell(
      `cp -f ${ClaudeHistoryService.CLAUDE_HISTORY_PATH}/*.jsonl ${destDir}/ 2>/dev/null || true`
    );
  }

  /**
   * Restores Claude Code conversation history from the workspace to the container.
   * Copies {workspace}/.claude-history/*.jsonl to /home/coder/.claude/projects/-workspace/
   *
   * This should be called after containers start during resume.
   */
  async restoreClaudeHistory(): Promise<void> {
    const srcDir = `${this.workspacePath}/${ClaudeHistoryService.WORKSPACE_HISTORY_DIR}`;

    // Check if .claude-history directory exists in workspace
    const checkResult = await this.execShell(`ls -1 ${srcDir}/*.jsonl 2>/dev/null || true`);

    if (!checkResult.stdout.trim()) {
      // No history files to restore
      return;
    }

    // Ensure Claude history directory exists
    await this.execShell(`mkdir -p ${ClaudeHistoryService.CLAUDE_HISTORY_PATH}`);

    // Copy all .jsonl files from workspace .claude-history/ to Claude history location
    // Using cp with -f to overwrite existing files
    await this.execShell(
      `cp -f ${srcDir}/*.jsonl ${ClaudeHistoryService.CLAUDE_HISTORY_PATH}/ 2>/dev/null || true`
    );
  }
}
