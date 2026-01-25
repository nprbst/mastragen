/**
 * Alert schemas for API request/response validation.
 * Per specs/004-production-readiness/contracts/alerts.md
 */
import * as v from 'valibot';
import { TimestampSchema } from './common.ts';

/**
 * Alert condition types.
 */
export const AlertConditionTypeSchema = v.picklist([
  'pod_creation_failed',
  'tailscale_timeout',
  'database_failed',
  'orphaned_pod',
]);
export type AlertConditionType = v.InferOutput<typeof AlertConditionTypeSchema>;

/**
 * Alert severity levels.
 */
export const AlertSeveritySchema = v.picklist(['warning', 'error', 'critical']);
export type AlertSeverity = v.InferOutput<typeof AlertSeveritySchema>;

/**
 * Alert event status.
 */
export const AlertEventStatusSchema = v.picklist([
  'pending',
  'delivered',
  'failed',
  'acknowledged',
]);
export type AlertEventStatus = v.InferOutput<typeof AlertEventStatusSchema>;

/**
 * Webhook destination configuration.
 */
export const WebhookDestinationSchema = v.object({
  type: v.literal('webhook'),
  url: v.pipe(v.string(), v.url('Invalid webhook URL')),
  headers: v.optional(v.record(v.string(), v.string())),
});
export type WebhookDestination = v.InferOutput<typeof WebhookDestinationSchema>;

/**
 * Email destination configuration.
 */
export const EmailDestinationSchema = v.object({
  type: v.literal('email'),
  email: v.pipe(v.string(), v.email('Invalid email address')),
});
export type EmailDestination = v.InferOutput<typeof EmailDestinationSchema>;

/**
 * Alert destination (webhook or email).
 */
export const AlertDestinationSchema = v.union([WebhookDestinationSchema, EmailDestinationSchema]);
export type AlertDestination = v.InferOutput<typeof AlertDestinationSchema>;

/**
 * Create alert rule request (POST /api/alerts/rules).
 */
export const CreateAlertRuleRequestSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  conditionType: AlertConditionTypeSchema,
  threshold: v.optional(v.nullable(v.number())),
  severity: AlertSeveritySchema,
  enabled: v.optional(v.boolean(), true),
  destinations: v.array(AlertDestinationSchema),
});
export type CreateAlertRuleRequest = v.InferOutput<typeof CreateAlertRuleRequestSchema>;

/**
 * Update alert rule request (PATCH /api/alerts/rules/:id).
 */
export const UpdateAlertRuleRequestSchema = v.partial(CreateAlertRuleRequestSchema);
export type UpdateAlertRuleRequest = v.InferOutput<typeof UpdateAlertRuleRequestSchema>;

/**
 * Alert rule response.
 */
export const AlertRuleResponseSchema = v.object({
  id: v.string(),
  name: v.string(),
  conditionType: AlertConditionTypeSchema,
  threshold: v.nullable(v.number()),
  severity: AlertSeveritySchema,
  enabled: v.boolean(),
  destinations: v.array(AlertDestinationSchema),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type AlertRuleResponse = v.InferOutput<typeof AlertRuleResponseSchema>;

/**
 * List alert rules response.
 */
export const ListAlertRulesResponseSchema = v.object({
  rules: v.array(AlertRuleResponseSchema),
});
export type ListAlertRulesResponse = v.InferOutput<typeof ListAlertRulesResponseSchema>;

/**
 * Alert event context (varies by condition type).
 */
export const AlertEventContextSchema = v.record(v.string(), v.unknown());
export type AlertEventContext = v.InferOutput<typeof AlertEventContextSchema>;

/**
 * Alert event response.
 */
export const AlertEventResponseSchema = v.object({
  id: v.string(),
  ruleId: v.string(),
  ruleName: v.optional(v.string()),
  triggeredAt: TimestampSchema,
  context: AlertEventContextSchema,
  status: AlertEventStatusSchema,
  deliveryAttempts: v.number(),
  lastDeliveryAt: v.nullable(TimestampSchema),
  deliveredAt: v.nullable(TimestampSchema),
  acknowledgedAt: v.nullable(TimestampSchema),
  acknowledgedBy: v.nullable(v.string()),
});
export type AlertEventResponse = v.InferOutput<typeof AlertEventResponseSchema>;

/**
 * List alert events query filter.
 */
export const ListAlertEventsFilterSchema = v.object({
  status: v.optional(AlertEventStatusSchema),
  ruleId: v.optional(v.string()),
  since: v.optional(TimestampSchema),
  limit: v.optional(
    v.pipe(
      v.string(),
      v.transform((s) => Number.parseInt(s, 10))
    )
  ),
});
export type ListAlertEventsFilter = v.InferOutput<typeof ListAlertEventsFilterSchema>;

/**
 * List alert events response.
 */
export const ListAlertEventsResponseSchema = v.object({
  events: v.array(AlertEventResponseSchema),
  total: v.number(),
});
export type ListAlertEventsResponse = v.InferOutput<typeof ListAlertEventsResponseSchema>;

/**
 * Acknowledge alert event request.
 */
export const AcknowledgeAlertEventRequestSchema = v.object({
  note: v.optional(v.string()),
});
export type AcknowledgeAlertEventRequest = v.InferOutput<typeof AcknowledgeAlertEventRequestSchema>;

/**
 * Acknowledge alert event response.
 */
export const AcknowledgeAlertEventResponseSchema = v.object({
  id: v.string(),
  status: v.literal('acknowledged'),
  acknowledgedAt: TimestampSchema,
  acknowledgedBy: v.string(),
});
export type AcknowledgeAlertEventResponse = v.InferOutput<
  typeof AcknowledgeAlertEventResponseSchema
>;

/**
 * Webhook payload for alert delivery.
 */
export const AlertWebhookPayloadSchema = v.object({
  alertId: v.string(),
  ruleName: v.string(),
  severity: AlertSeveritySchema,
  triggeredAt: TimestampSchema,
  context: AlertEventContextSchema,
  dashboardUrl: v.optional(v.string()),
});
export type AlertWebhookPayload = v.InferOutput<typeof AlertWebhookPayloadSchema>;
