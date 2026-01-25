/**
 * Idle configuration schemas for API request/response validation.
 * Per specs/004-production-readiness/contracts/idle-config.md
 */
import * as v from 'valibot';
import { TimestampSchema } from './common.ts';

/**
 * Idle timeout minutes validation: 5-480 minutes (8 hours max).
 */
export const IdleTimeoutMinutesSchema = v.pipe(
  v.number(),
  v.minValue(5, 'Idle timeout must be at least 5 minutes'),
  v.maxValue(480, 'Idle timeout must be at most 480 minutes (8 hours)')
);
export type IdleTimeoutMinutes = v.InferOutput<typeof IdleTimeoutMinutesSchema>;

/**
 * Warning minutes validation: 1 minute minimum.
 * Must be less than idle timeout (validated at application layer).
 */
export const WarningMinutesSchema = v.pipe(
  v.number(),
  v.minValue(1, 'Warning time must be at least 1 minute')
);
export type WarningMinutes = v.InferOutput<typeof WarningMinutesSchema>;

/**
 * Idle config response schema.
 */
export const IdleConfigResponseSchema = v.object({
  id: v.string(),
  projectId: v.nullable(v.string()),
  idleTimeoutMinutes: v.number(),
  warningMinutes: v.number(),
  enabled: v.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type IdleConfigResponse = v.InferOutput<typeof IdleConfigResponseSchema>;

/**
 * Update global idle config request (PATCH /api/config/idle).
 */
export const UpdateGlobalIdleConfigRequestSchema = v.object({
  idleTimeoutMinutes: v.optional(IdleTimeoutMinutesSchema),
  warningMinutes: v.optional(WarningMinutesSchema),
  enabled: v.optional(v.boolean()),
});
export type UpdateGlobalIdleConfigRequest = v.InferOutput<
  typeof UpdateGlobalIdleConfigRequestSchema
>;

/**
 * Create/update project idle config request (PUT /api/projects/:id/idle-config).
 */
export const SetProjectIdleConfigRequestSchema = v.object({
  idleTimeoutMinutes: IdleTimeoutMinutesSchema,
  warningMinutes: WarningMinutesSchema,
  enabled: v.optional(v.boolean(), true),
});
export type SetProjectIdleConfigRequest = v.InferOutput<typeof SetProjectIdleConfigRequestSchema>;

/**
 * Idle status response for sessions (GET /api/sessions/:id/idle-status).
 */
export const IdleStatusResponseSchema = v.object({
  sessionId: v.string(),
  state: v.string(),
  lastActivityAt: v.nullable(TimestampSchema),
  idleTimeoutMinutes: v.number(),
  warningMinutes: v.number(),
  idleSinceMinutes: v.number(),
  warningIssued: v.boolean(),
  suspendAt: v.nullable(TimestampSchema),
});
export type IdleStatusResponse = v.InferOutput<typeof IdleStatusResponseSchema>;
