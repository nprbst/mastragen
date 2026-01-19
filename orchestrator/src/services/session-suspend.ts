/**
 * T094: Session suspend service
 *
 * Handles suspending and resuming sessions:
 * - Commit and push changes to branch
 * - Update session status
 * - Terminate/restart sandbox container
 */
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';

interface SandboxClient {
  exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  stop(): Promise<void>;
  start(): Promise<void>;
}

interface SuspendResult {
  commitSha: string;
  branch: string;
  message: string;
}

interface ResumeResult {
  sessionId: string;
  status: string;
}

export class SessionSuspendService {
  constructor(
    private db: Kysely<Database>,
    private sandboxClient: SandboxClient
  ) {}

  /**
   * Suspend a session by committing, pushing, and stopping the container.
   */
  async suspend(sessionId: string, message: string): Promise<SuspendResult> {
    // Get current branch
    const branchResult = await this.sandboxClient.exec('git branch --show-current');
    const branch = branchResult.stdout.trim();

    // Stage all changes
    await this.sandboxClient.exec('git add -A');

    // Commit changes
    const commitResult = await this.sandboxClient.exec(
      `git commit -m "${message.replace(/"/g, '\\"')}" --allow-empty`
    );
    if (commitResult.exitCode !== 0 && !commitResult.stderr.includes('nothing to commit')) {
      throw new Error(`Failed to commit: ${commitResult.stderr}`);
    }

    // Get commit SHA
    const shaResult = await this.sandboxClient.exec('git rev-parse HEAD');
    const commitSha = shaResult.stdout.trim();

    // Push to remote
    const pushResult = await this.sandboxClient.exec(`git push -u origin ${branch}`);
    if (pushResult.exitCode !== 0) {
      throw new Error(`Failed to push: ${pushResult.stderr}`);
    }

    // Update session status
    await this.db
      .updateTable('sessions')
      .set({
        state: 'suspended',
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', sessionId)
      .execute();

    // Stop the container
    await this.sandboxClient.stop();

    return {
      commitSha,
      branch,
      message,
    };
  }

  /**
   * Resume a suspended session by starting the container.
   */
  async resume(sessionId: string, _branch: string): Promise<ResumeResult> {
    // Start the container
    await this.sandboxClient.start();

    // Pull latest changes
    await this.sandboxClient.exec('git pull --rebase');

    // Update session status
    await this.db
      .updateTable('sessions')
      .set({
        state: 'active',
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', sessionId)
      .execute();

    return {
      sessionId,
      status: 'active',
    };
  }
}
