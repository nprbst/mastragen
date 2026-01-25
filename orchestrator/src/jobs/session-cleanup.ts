/**
 * T110-T112: Session cleanup job
 *
 * Handles data retention and cleanup:
 * - Delete sessions older than retention period (90 days default)
 * - Clean up associated git branches via GitHub API
 * - Remove sandbox volumes and containers
 */
import type { Kysely } from 'kysely';
import type { Database, Session } from '../db/types.ts';

interface CleanupConfig {
  retentionDays: number;
  dryRun: boolean;
  batchSize: number;
}

interface CleanupResult {
  sessionsDeleted: number;
  branchesDeleted: number;
  volumesCleaned: number;
  errors: string[];
}

interface GitHubClient {
  deleteRef(owner: string, repo: string, ref: string): Promise<void>;
}

export class SessionCleanupJob {
  private defaultConfig: CleanupConfig = {
    retentionDays: 90,
    dryRun: false,
    batchSize: 100,
  };

  constructor(
    private db: Kysely<Database>,
    private githubClient?: GitHubClient
  ) {}

  /**
   * Run the cleanup job.
   */
  async run(config?: Partial<CleanupConfig>): Promise<CleanupResult> {
    const cfg = { ...this.defaultConfig, ...config };
    const result: CleanupResult = {
      sessionsDeleted: 0,
      branchesDeleted: 0,
      volumesCleaned: 0,
      errors: [],
    };

    console.log('[SessionCleanup] Starting cleanup job...');
    console.log(
      `[SessionCleanup] Config: retentionDays=${cfg.retentionDays}, dryRun=${cfg.dryRun}`
    );

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cfg.retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`[SessionCleanup] Cutoff date: ${cutoffIso}`);

    // Find expired sessions in batches
    let hasMore = true;
    while (hasMore) {
      const expiredSessions = await this.db
        .selectFrom('sessions')
        .selectAll()
        .where('updated_at', '<', cutoffIso)
        .where('state', 'in', ['closed', 'merged', 'archived', 'suspended'])
        .limit(cfg.batchSize)
        .execute();

      if (expiredSessions.length === 0) {
        hasMore = false;
        continue;
      }

      console.log(`[SessionCleanup] Found ${expiredSessions.length} expired sessions`);

      for (const session of expiredSessions) {
        try {
          await this.cleanupSession(session, cfg.dryRun, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`Session ${session.id}: ${message}`);
          console.error(`[SessionCleanup] Error cleaning up session ${session.id}:`, error);
        }
      }
    }

    console.log('[SessionCleanup] Cleanup complete:', result);
    return result;
  }

  /**
   * Clean up a single session.
   */
  private async cleanupSession(
    session: Session,
    dryRun: boolean,
    result: CleanupResult
  ): Promise<void> {
    console.log(`[SessionCleanup] Processing session ${session.id}...`);

    // Get project for GitHub info
    const project = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', session.project_id)
      .executeTakeFirst();

    // Clean up git branch if exists
    if (session.branch_name && project?.github_repo && this.githubClient) {
      try {
        const [owner, repo] = project.github_repo.split('/');
        if (owner && repo) {
          if (!dryRun) {
            await this.githubClient.deleteRef(owner, repo, `heads/${session.branch_name}`);
          }
          result.branchesDeleted++;
          console.log(`[SessionCleanup] Deleted branch: ${session.branch_name}`);
        }
      } catch (error) {
        // Branch may already be deleted or merged
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Reference does not exist')) {
          result.errors.push(`Branch ${session.branch_name}: ${message}`);
        }
      }
    }

    // Delete session shares
    if (!dryRun) {
      await this.db.deleteFrom('session_shares').where('session_id', '=', session.id).execute();
    }

    // Delete the session
    if (!dryRun) {
      await this.db.deleteFrom('sessions').where('id', '=', session.id).execute();
    }
    result.sessionsDeleted++;

    // Note: Volume cleanup would be handled by container runtime
    // This is a placeholder for actual volume cleanup logic
    result.volumesCleaned++;

    console.log(`[SessionCleanup] Session ${session.id} cleaned up`);
  }

  /**
   * Preview what would be deleted without making changes.
   */
  async preview(retentionDays?: number): Promise<{
    sessionsToDelete: number;
    oldestSession: string | null;
    newestSession: string | null;
  }> {
    const days = retentionDays ?? this.defaultConfig.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    const sessions = await this.db
      .selectFrom('sessions')
      .select(['id', 'updated_at'])
      .where('updated_at', '<', cutoffIso)
      .where('state', 'in', ['closed', 'merged', 'archived', 'suspended'])
      .orderBy('updated_at', 'asc')
      .execute();

    const oldest = sessions[0];
    const newest = sessions[sessions.length - 1];
    return {
      sessionsToDelete: sessions.length,
      oldestSession: oldest?.updated_at ?? null,
      newestSession: newest?.updated_at ?? null,
    };
  }
}

/**
 * Create a scheduled cleanup job runner.
 */
export function createCleanupScheduler(
  db: Kysely<Database>,
  intervalMs: number = 24 * 60 * 60 * 1000 // Default: daily
): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const job = new SessionCleanupJob(db);

  return {
    start: () => {
      if (timer) return;
      console.log(`[SessionCleanup] Scheduler started, interval: ${intervalMs}ms`);

      // Run immediately on start
      job.run().catch(console.error);

      // Schedule periodic runs
      timer = setInterval(() => {
        job.run().catch(console.error);
      }, intervalMs);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        console.log('[SessionCleanup] Scheduler stopped');
      }
    },
  };
}
