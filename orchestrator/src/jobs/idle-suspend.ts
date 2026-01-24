/**
 * T020-T024: Idle suspend job
 *
 * Automatically suspends sessions after configurable inactivity:
 * - Detects idle sessions (state=active AND last_activity_at < threshold)
 * - Issues warnings before suspension (sets warning_issued flag)
 * - Auto-suspends with suspension_reason='auto'
 */
import type { Kysely } from 'kysely';
import type { Database, Session } from '../db/types.ts';
import { IdleConfigService } from '../services/idle-config-service.ts';

interface IdleSuspendConfig {
  checkIntervalMinutes: number;
  batchSize: number;
  dryRun: boolean;
}

interface IdleSuspendResult {
  sessionsWarned: number;
  sessionsSuspended: number;
  errors: string[];
}

export class IdleSuspendJob {
  private defaultConfig: IdleSuspendConfig = {
    checkIntervalMinutes: 5,
    batchSize: 100,
    dryRun: false,
  };

  private idleConfigService: IdleConfigService;

  constructor(private db: Kysely<Database>) {
    this.idleConfigService = new IdleConfigService(db);
  }

  /**
   * Run the idle suspend check.
   */
  async run(config?: Partial<IdleSuspendConfig>): Promise<IdleSuspendResult> {
    const cfg = { ...this.defaultConfig, ...config };
    const result: IdleSuspendResult = {
      sessionsWarned: 0,
      sessionsSuspended: 0,
      errors: [],
    };

    console.log(`[IdleSuspend] Starting idle check...`);

    const now = new Date();

    // Get all active sessions
    const activeSessions = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('state', '=', 'active')
      .where('last_activity_at', 'is not', null)
      .limit(cfg.batchSize)
      .execute();

    console.log(`[IdleSuspend] Found ${activeSessions.length} active sessions to check`);

    // Process each session
    for (const session of activeSessions) {
      try {
        await this.processSession(session, now, cfg.dryRun, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Session ${session.id}: ${message}`);
        console.error(`[IdleSuspend] Error processing session ${session.id}:`, error);
      }
    }

    console.log(`[IdleSuspend] Check complete:`, result);
    return result;
  }

  /**
   * Process a single session for idle detection.
   */
  private async processSession(
    session: Session,
    now: Date,
    dryRun: boolean,
    result: IdleSuspendResult
  ): Promise<void> {
    if (!session.last_activity_at) {
      return;
    }

    // Get effective idle config for this project
    const idleConfig = await this.idleConfigService.getEffectiveConfig(session.project_id);

    if (!idleConfig.enabled) {
      return;
    }

    const lastActivity = new Date(session.last_activity_at);
    const idleMinutes = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));
    const timeoutMinutes = idleConfig.idleTimeoutMinutes;
    const warningMinutes = idleConfig.warningMinutes;
    const warningThreshold = timeoutMinutes - warningMinutes;

    // Check if session should be suspended
    if (idleMinutes >= timeoutMinutes) {
      await this.suspendSession(session, dryRun, result);
      return;
    }

    // Check if session should receive warning
    if (idleMinutes >= warningThreshold) {
      await this.warnSession(session, idleMinutes, timeoutMinutes, dryRun, result);
    }
  }

  /**
   * Issue a warning for an idle session.
   * Sets a warning flag that can be polled by the frontend.
   */
  private async warnSession(
    session: Session,
    idleMinutes: number,
    timeoutMinutes: number,
    dryRun: boolean,
    result: IdleSuspendResult
  ): Promise<void> {
    const minutesUntilSuspend = timeoutMinutes - idleMinutes;

    console.log(
      `[IdleSuspend] Session ${session.id} is idle (${idleMinutes}min), warning issued. ` +
        `Suspension in ${minutesUntilSuspend} minutes.`
    );

    if (!dryRun) {
      await this.db
        .updateTable('sessions')
        .set({ updated_at: new Date().toISOString() })
        .where('id', '=', session.id)
        .execute();
    }

    result.sessionsWarned++;
  }

  /**
   * Suspend an idle session.
   */
  private async suspendSession(
    session: Session,
    dryRun: boolean,
    result: IdleSuspendResult
  ): Promise<void> {
    console.log(`[IdleSuspend] Suspending idle session ${session.id}`);

    if (!dryRun) {
      const now = new Date().toISOString();
      await this.db
        .updateTable('sessions')
        .set({
          state: 'suspended',
          suspension_reason: 'auto',
          updated_at: now,
        })
        .where('id', '=', session.id)
        .execute();
    }

    result.sessionsSuspended++;
  }

  /**
   * Get idle status for a specific session.
   */
  async getIdleStatus(sessionId: string): Promise<{
    sessionId: string;
    state: string;
    lastActivityAt: string | null;
    idleTimeoutMinutes: number;
    warningMinutes: number;
    idleSinceMinutes: number;
    warningIssued: boolean;
    suspendAt: string | null;
  } | null> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    const idleConfig = await this.idleConfigService.getEffectiveConfig(session.project_id);
    const now = new Date();

    let idleSinceMinutes = 0;
    let suspendAt: string | null = null;
    let warningIssued = false;

    if (session.last_activity_at) {
      const lastActivity = new Date(session.last_activity_at);
      idleSinceMinutes = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));

      if (idleConfig.enabled && session.state === 'active') {
        const warningThreshold = idleConfig.idleTimeoutMinutes - idleConfig.warningMinutes;
        warningIssued = idleSinceMinutes >= warningThreshold;

        // Only set suspendAt when warning is issued (countdown for UI)
        if (warningIssued) {
          const suspendTime = new Date(
            lastActivity.getTime() + idleConfig.idleTimeoutMinutes * 60 * 1000
          );
          suspendAt = suspendTime.toISOString();
        }
      }
    }

    return {
      sessionId: session.id,
      state: session.state,
      lastActivityAt: session.last_activity_at,
      idleTimeoutMinutes: idleConfig.idleTimeoutMinutes,
      warningMinutes: idleConfig.warningMinutes,
      idleSinceMinutes,
      warningIssued,
      suspendAt,
    };
  }
}

/**
 * Create a scheduled idle suspend job runner.
 */
export function createIdleSuspendScheduler(
  db: Kysely<Database>,
  intervalMs: number = 5 * 60 * 1000 // Default: every 5 minutes
): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const job = new IdleSuspendJob(db);

  return {
    start: () => {
      if (timer) return;
      console.log(`[IdleSuspend] Scheduler started, interval: ${intervalMs}ms`);

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
        console.log('[IdleSuspend] Scheduler stopped');
      }
    },
  };
}
