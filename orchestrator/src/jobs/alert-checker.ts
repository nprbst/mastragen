/**
 * T059-T060: Alert checker job
 *
 * Background job that periodically checks alert conditions:
 * - Polls enabled alert rules
 * - Checks condition for each rule
 * - Fires alerts when conditions are met
 * - Attempts delivery to configured destinations
 */
import type { Kysely } from 'kysely';
import type { AlertConditionType, Database } from '../db/types.ts';
import { AlertService } from '../services/alert-service.ts';
import { MetricsService } from '../services/metrics-service.ts';

type ContextProvider = () => Promise<Record<string, unknown>>;

interface AlertCheckerConfig {
  /**
   * Custom context providers for each condition type.
   * Override default providers for testing or custom checks.
   */
  contextProviders?: Partial<Record<AlertConditionType, ContextProvider>>;

  /**
   * Whether to attempt delivery after firing.
   * Set to false in tests to avoid network calls.
   */
  deliverAlerts?: boolean;
}

interface AlertCheckerResult {
  rulesChecked: number;
  alertsFired: number;
  errors: string[];
}

export class AlertCheckerJob {
  private config: Required<AlertCheckerConfig>;

  constructor(
    private db: Kysely<Database>,
    private alertService: AlertService,
    _metricsService: MetricsService,
    config?: AlertCheckerConfig
  ) {
    this.config = {
      contextProviders: config?.contextProviders ?? {},
      deliverAlerts: config?.deliverAlerts ?? true,
    };
  }

  /**
   * Run the alert checker job.
   */
  async run(): Promise<AlertCheckerResult> {
    const result: AlertCheckerResult = {
      rulesChecked: 0,
      alertsFired: 0,
      errors: [],
    };

    console.log('[AlertChecker] Starting alert check...');

    // Get all enabled rules
    const rules = await this.alertService.listEnabledRules();
    result.rulesChecked = rules.length;

    console.log(`[AlertChecker] Found ${rules.length} enabled rules to check`);

    // Check each rule
    for (const rule of rules) {
      try {
        const fired = await this.checkRule(rule.id, rule.conditionType);
        if (fired) {
          result.alertsFired++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Rule ${rule.id}: ${message}`);
        console.error(`[AlertChecker] Error checking rule ${rule.id}:`, error);
      }
    }

    console.log('[AlertChecker] Check complete:', result);
    return result;
  }

  /**
   * Check a single rule and fire alert if condition is met.
   */
  private async checkRule(ruleId: string, conditionType: AlertConditionType): Promise<boolean> {
    // Get context for this condition type
    const context = await this.getContext(conditionType);

    // Check if condition is met
    const conditionMet = await this.alertService.checkCondition(conditionType, context);

    if (!conditionMet) {
      return false;
    }

    console.log(`[AlertChecker] Condition met for rule ${ruleId}, firing alert`);

    // Fire the alert
    const event = await this.alertService.fireAlert(ruleId, context);
    if (!event) {
      return false;
    }

    // Attempt delivery if configured
    if (this.config.deliverAlerts) {
      try {
        await this.alertService.deliverAlert(event.id);
      } catch (error) {
        console.error(`[AlertChecker] Failed to deliver alert ${event.id}:`, error);
        // Don't fail the job if delivery fails - it will be retried
      }
    }

    return true;
  }

  /**
   * Get context for a condition type using default or custom provider.
   */
  private async getContext(conditionType: AlertConditionType): Promise<Record<string, unknown>> {
    // Check for custom provider first
    const customProvider = this.config.contextProviders[conditionType];
    if (customProvider) {
      return customProvider();
    }

    // Use default providers
    switch (conditionType) {
      case 'pod_creation_failed':
        return this.getDefaultPodCreationContext();
      case 'tailscale_timeout':
        return this.getDefaultTailscaleContext();
      case 'database_failed':
        return this.getDefaultDatabaseContext();
      case 'orphaned_pod':
        return this.getDefaultOrphanedPodContext();
      default:
        return {};
    }
  }

  // ============================================================================
  // Default Context Providers
  // ============================================================================

  /**
   * Default context for pod_creation_failed.
   * In production, this would check for recent pod creation errors.
   */
  private async getDefaultPodCreationContext(): Promise<Record<string, unknown>> {
    // In a real implementation, check Kubernetes API or logs
    // For now, return empty context (no error)
    return {};
  }

  /**
   * Default context for tailscale_timeout.
   * In production, this would check for sessions stuck in connecting state.
   */
  private async getDefaultTailscaleContext(): Promise<Record<string, unknown>> {
    // In a real implementation, query sessions with tailscale_status
    // For now, return empty context (no timeout)
    return {};
  }

  /**
   * Default context for database_failed.
   * Performs a health check query on the database.
   */
  private async getDefaultDatabaseContext(): Promise<Record<string, unknown>> {
    try {
      // Simple health check query
      await this.db.selectFrom('alert_rules').select('id').limit(1).execute();
      return { healthy: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }

  /**
   * Default context for orphaned_pod.
   * In production, this would check for pods without matching sessions.
   */
  private async getDefaultOrphanedPodContext(): Promise<Record<string, unknown>> {
    // In a real implementation, compare Kubernetes pods with session records
    // For now, return empty context (no orphans)
    return {};
  }
}

/**
 * Create a scheduled alert checker job runner.
 */
export function createAlertCheckerScheduler(
  db: Kysely<Database>,
  intervalMs: number = 60 * 1000 // Default: every 1 minute
): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const metricsService = new MetricsService(db);
  const alertService = new AlertService(db, metricsService);
  const job = new AlertCheckerJob(db, alertService, metricsService);

  return {
    start: () => {
      if (timer) return;
      console.log(`[AlertChecker] Scheduler started, interval: ${intervalMs}ms`);

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
        console.log('[AlertChecker] Scheduler stopped');
      }
    },
  };
}
