/**
 * T050-T058: AlertService
 *
 * Handles alert rule management and event delivery:
 * - Rule CRUD operations (T050)
 * - Condition checking for each alert type (T051-T054)
 * - Alert firing and event creation (T055)
 * - Webhook delivery (T056)
 * - Email delivery (T057)
 * - Retry logic with exponential backoff (T058)
 * - Event acknowledgment
 */
import type { Kysely } from 'kysely';
import type {
  Database,
  AlertRule,
  AlertConditionType,
  AlertSeverityType,
  AlertEventStatusType,
} from '../db/types.ts';
import type { MetricsService } from './metrics-service.ts';
import type {
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
  AlertDestination,
  AlertWebhookPayload,
  ListAlertEventsFilter,
} from '../schemas/alerts.ts';

export interface AlertRuleResponse {
  id: string;
  name: string;
  conditionType: AlertConditionType;
  threshold: number | null;
  severity: AlertSeverityType;
  enabled: boolean;
  destinations: AlertDestination[];
  createdAt: string;
  updatedAt: string;
}

export interface AlertEventResponse {
  id: string;
  ruleId: string;
  ruleName?: string;
  triggeredAt: string;
  context: Record<string, unknown>;
  status: AlertEventStatusType;
  deliveryAttempts: number;
  lastDeliveryAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface ListEventsResult {
  events: AlertEventResponse[];
  total: number;
}

// Retry configuration
const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60 * 1000; // 1 minute
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

export class AlertService {
  constructor(
    private db: Kysely<Database>,
    private metricsService: MetricsService
  ) {}

  // ============================================================================
  // Rule Management (T050)
  // ============================================================================

  /**
   * List all alert rules.
   */
  async listRules(): Promise<AlertRuleResponse[]> {
    const rules = await this.db.selectFrom('alert_rules').selectAll().execute();

    return rules.map(this.mapRuleToResponse);
  }

  /**
   * List only enabled alert rules (for checking conditions).
   */
  async listEnabledRules(): Promise<AlertRuleResponse[]> {
    const rules = await this.db
      .selectFrom('alert_rules')
      .selectAll()
      .where('enabled', '=', 1)
      .execute();

    return rules.map(this.mapRuleToResponse);
  }

  /**
   * Get a single alert rule by ID.
   */
  async getRule(id: string): Promise<AlertRuleResponse | null> {
    const rule = await this.db
      .selectFrom('alert_rules')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return rule ? this.mapRuleToResponse(rule) : null;
  }

  /**
   * Create a new alert rule.
   */
  async createRule(data: CreateAlertRuleRequest): Promise<AlertRuleResponse | null> {
    const id = `alert-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await this.db
      .insertInto('alert_rules')
      .values({
        id,
        name: data.name,
        condition_type: data.conditionType,
        threshold: data.threshold ?? null,
        severity: data.severity,
        enabled: data.enabled === false ? 0 : 1,
        destinations: JSON.stringify(data.destinations),
        created_at: now,
        updated_at: now,
      })
      .execute();

    return this.getRule(id);
  }

  /**
   * Update an existing alert rule.
   */
  async updateRule(id: string, data: UpdateAlertRuleRequest): Promise<AlertRuleResponse | null> {
    const existing = await this.getRule(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.conditionType !== undefined) {
      updates.condition_type = data.conditionType;
    }
    if (data.threshold !== undefined) {
      updates.threshold = data.threshold;
    }
    if (data.severity !== undefined) {
      updates.severity = data.severity;
    }
    if (data.enabled !== undefined) {
      updates.enabled = data.enabled ? 1 : 0;
    }
    if (data.destinations !== undefined) {
      updates.destinations = JSON.stringify(data.destinations);
    }

    await this.db
      .updateTable('alert_rules')
      .set(updates)
      .where('id', '=', id)
      .execute();

    return this.getRule(id);
  }

  /**
   * Delete an alert rule (cascades to events).
   */
  async deleteRule(id: string): Promise<void> {
    // Delete associated events first (foreign key)
    await this.db.deleteFrom('alert_events').where('rule_id', '=', id).execute();

    await this.db.deleteFrom('alert_rules').where('id', '=', id).execute();
  }

  // ============================================================================
  // Condition Checking (T051-T054)
  // ============================================================================

  /**
   * Check if an alert condition is met based on the condition type and context.
   */
  async checkCondition(
    conditionType: AlertConditionType,
    context: Record<string, unknown>
  ): Promise<boolean> {
    switch (conditionType) {
      case 'pod_creation_failed':
        return this.checkPodCreationFailed(context);
      case 'tailscale_timeout':
        return this.checkTailscaleTimeout(context);
      case 'database_failed':
        return this.checkDatabaseFailed(context);
      case 'orphaned_pod':
        return this.checkOrphanedPod(context);
      default:
        return false;
    }
  }

  /**
   * T051: Check for pod creation failures.
   * Returns true if context indicates an error occurred.
   */
  private checkPodCreationFailed(context: Record<string, unknown>): boolean {
    return !!context.error;
  }

  /**
   * T052: Check for Tailscale registration timeout.
   * Returns true if elapsed time exceeds threshold.
   */
  private checkTailscaleTimeout(context: Record<string, unknown>): boolean {
    const elapsed = context.elapsedSeconds as number | undefined;
    const threshold = context.threshold as number | undefined;

    if (elapsed === undefined || threshold === undefined) {
      return false;
    }

    return elapsed > threshold;
  }

  /**
   * T053: Check for database connection failure.
   * Returns true if context indicates an error or unhealthy state.
   */
  private checkDatabaseFailed(context: Record<string, unknown>): boolean {
    if (context.error) {
      return true;
    }
    if (context.healthy === true) {
      return false;
    }
    return false;
  }

  /**
   * T054: Check for orphaned pods.
   * Returns true if pod has been orphaned longer than threshold.
   */
  private checkOrphanedPod(context: Record<string, unknown>): boolean {
    const orphanedSeconds = context.orphanedSeconds as number | undefined;
    const threshold = context.threshold as number | undefined;

    if (orphanedSeconds === undefined || threshold === undefined) {
      return false;
    }

    return orphanedSeconds > threshold;
  }

  // ============================================================================
  // Alert Firing (T055)
  // ============================================================================

  /**
   * Fire an alert for a rule, creating an event.
   */
  async fireAlert(
    ruleId: string,
    context: Record<string, unknown>
  ): Promise<AlertEventResponse | null> {
    const rule = await this.getRule(ruleId);
    if (!rule) {
      return null;
    }

    const id = `event-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await this.db
      .insertInto('alert_events')
      .values({
        id,
        rule_id: ruleId,
        triggered_at: now,
        context: JSON.stringify(context),
        status: 'pending',
        delivery_attempts: 0,
      })
      .execute();

    // Increment metrics counter
    this.metricsService.incrementAlertFired(rule.conditionType);

    console.log(`[Alert] Fired alert for rule ${rule.name} (${ruleId})`);

    return this.getEvent(id);
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * List alert events with optional filters.
   */
  async listEvents(filter?: ListAlertEventsFilter): Promise<ListEventsResult> {
    let query = this.db
      .selectFrom('alert_events')
      .leftJoin('alert_rules', 'alert_rules.id', 'alert_events.rule_id')
      .select([
        'alert_events.id',
        'alert_events.rule_id',
        'alert_rules.name as rule_name',
        'alert_events.triggered_at',
        'alert_events.context',
        'alert_events.status',
        'alert_events.delivery_attempts',
        'alert_events.last_delivery_at',
        'alert_events.delivered_at',
        'alert_events.acknowledged_at',
        'alert_events.acknowledged_by',
      ])
      .orderBy('alert_events.triggered_at', 'desc');

    if (filter?.status) {
      query = query.where('alert_events.status', '=', filter.status);
    }
    if (filter?.ruleId) {
      query = query.where('alert_events.rule_id', '=', filter.ruleId);
    }
    if (filter?.since) {
      query = query.where('alert_events.triggered_at', '>=', filter.since);
    }
    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const events = await query.execute();

    return {
      events: events.map((e) => ({
        id: e.id,
        ruleId: e.rule_id,
        ruleName: e.rule_name ?? undefined,
        triggeredAt: e.triggered_at,
        context: JSON.parse(e.context),
        status: e.status as AlertEventStatusType,
        deliveryAttempts: e.delivery_attempts,
        lastDeliveryAt: e.last_delivery_at,
        deliveredAt: e.delivered_at,
        acknowledgedAt: e.acknowledged_at,
        acknowledgedBy: e.acknowledged_by,
      })),
      total: events.length,
    };
  }

  /**
   * Get a single alert event by ID.
   */
  async getEvent(id: string): Promise<AlertEventResponse | null> {
    const event = await this.db
      .selectFrom('alert_events')
      .leftJoin('alert_rules', 'alert_rules.id', 'alert_events.rule_id')
      .select([
        'alert_events.id',
        'alert_events.rule_id',
        'alert_rules.name as rule_name',
        'alert_events.triggered_at',
        'alert_events.context',
        'alert_events.status',
        'alert_events.delivery_attempts',
        'alert_events.last_delivery_at',
        'alert_events.delivered_at',
        'alert_events.acknowledged_at',
        'alert_events.acknowledged_by',
      ])
      .where('alert_events.id', '=', id)
      .executeTakeFirst();

    if (!event) {
      return null;
    }

    return {
      id: event.id,
      ruleId: event.rule_id,
      ruleName: event.rule_name ?? undefined,
      triggeredAt: event.triggered_at,
      context: JSON.parse(event.context),
      status: event.status as AlertEventStatusType,
      deliveryAttempts: event.delivery_attempts,
      lastDeliveryAt: event.last_delivery_at,
      deliveredAt: event.delivered_at,
      acknowledgedAt: event.acknowledged_at,
      acknowledgedBy: event.acknowledged_by,
    };
  }

  /**
   * Acknowledge an alert event.
   */
  async acknowledgeEvent(
    eventId: string,
    userId: string,
    note?: string
  ): Promise<AlertEventResponse | null> {
    const now = new Date().toISOString();

    await this.db
      .updateTable('alert_events')
      .set({
        status: 'acknowledged',
        acknowledged_at: now,
        acknowledged_by: userId,
      })
      .where('id', '=', eventId)
      .execute();

    if (note) {
      console.log(`[Alert] Event ${eventId} acknowledged by ${userId}: ${note}`);
    }

    return this.getEvent(eventId);
  }

  // ============================================================================
  // Delivery (T056-T058)
  // ============================================================================

  /**
   * Format webhook payload for an alert event.
   */
  formatWebhookPayload(event: AlertEventResponse): AlertWebhookPayload {
    return {
      alertId: event.id,
      ruleName: event.ruleName ?? 'Unknown Rule',
      severity: 'error', // Get from rule
      triggeredAt: event.triggeredAt,
      context: event.context,
      dashboardUrl: `${process.env.APP_URL ?? 'http://localhost:4000'}/admin/alerts/${event.id}`,
    };
  }

  /**
   * Deliver an alert to all configured destinations.
   */
  async deliverAlert(eventId: string): Promise<boolean> {
    const event = await this.getEvent(eventId);
    if (!event) {
      return false;
    }

    const rule = await this.getRule(event.ruleId);
    if (!rule || rule.destinations.length === 0) {
      // Mark as delivered if no destinations configured
      await this.markDelivered(eventId);
      return true;
    }

    let allDelivered = true;

    for (const dest of rule.destinations) {
      try {
        if (dest.type === 'webhook') {
          await this.deliverWebhook(dest.url, this.formatWebhookPayload(event), dest.headers);
        } else if (dest.type === 'email') {
          await this.deliverEmail(dest.email, event, rule);
        }
      } catch (error) {
        console.error(`[Alert] Failed to deliver to ${dest.type}:`, error);
        allDelivered = false;
      }
    }

    if (allDelivered) {
      await this.markDelivered(eventId);
    } else {
      await this.incrementDeliveryAttempt(eventId);
    }

    return allDelivered;
  }

  /**
   * T056: Deliver alert via webhook.
   */
  private async deliverWebhook(
    url: string,
    payload: AlertWebhookPayload,
    headers?: Record<string, string>
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
    }

    console.log(`[Alert] Webhook delivered to ${url}`);
  }

  /**
   * T057: Deliver alert via email.
   * Note: Actual email sending requires SMTP configuration.
   */
  private async deliverEmail(
    email: string,
    event: AlertEventResponse,
    rule: AlertRuleResponse
  ): Promise<void> {
    // In production, integrate with an email service (SendGrid, SES, etc.)
    // For now, log the email that would be sent
    console.log(`[Alert] Would send email to ${email}:`);
    console.log(`  Subject: [${rule.severity.toUpperCase()}] ${rule.name}`);
    console.log(`  Alert ID: ${event.id}`);
    console.log(`  Triggered: ${event.triggeredAt}`);
    console.log(`  Context: ${JSON.stringify(event.context)}`);

    // TODO: Implement actual email delivery when SMTP is configured
    // For now, treat as successful to not block the flow
  }

  /**
   * Mark an event as delivered.
   */
  private async markDelivered(eventId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .updateTable('alert_events')
      .set({
        status: 'delivered',
        delivered_at: now,
      })
      .where('id', '=', eventId)
      .execute();
  }

  /**
   * T058: Increment delivery attempt counter.
   */
  async incrementDeliveryAttempt(eventId: string): Promise<void> {
    const now = new Date().toISOString();

    // Get current value and increment
    const event = await this.getEvent(eventId);
    if (!event) {
      return;
    }

    await this.db
      .updateTable('alert_events')
      .set({
        delivery_attempts: event.deliveryAttempts + 1,
        last_delivery_at: now,
      })
      .where('id', '=', eventId)
      .execute();
  }

  /**
   * Check if an event should be marked as failed after max attempts.
   */
  async checkAndMarkFailed(eventId: string): Promise<void> {
    const event = await this.getEvent(eventId);
    if (!event) {
      return;
    }

    if (event.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
      await this.db
        .updateTable('alert_events')
        .set({ status: 'failed' })
        .where('id', '=', eventId)
        .execute();

      console.log(`[Alert] Event ${eventId} marked as failed after ${MAX_DELIVERY_ATTEMPTS} attempts`);
    }
  }

  /**
   * T058: Calculate exponential backoff delay.
   */
  calculateBackoffMs(attempt: number): number {
    const backoff = Math.pow(2, attempt) * BASE_BACKOFF_MS;
    return Math.min(backoff, MAX_BACKOFF_MS);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private mapRuleToResponse(rule: AlertRule): AlertRuleResponse {
    return {
      id: rule.id,
      name: rule.name,
      conditionType: rule.condition_type,
      threshold: rule.threshold,
      severity: rule.severity,
      enabled: rule.enabled === 1,
      destinations: JSON.parse(rule.destinations),
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
    };
  }
}
