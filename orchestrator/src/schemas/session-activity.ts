/**
 * Session activity schemas for API request/response validation.
 * Per specs/004-production-readiness/contracts/session-activity.md
 */
import * as v from 'valibot';
import { TimestampSchema } from './common.ts';

/**
 * Activity types for session tracking.
 */
export const ActivityTypeSchema = v.picklist([
  'heartbeat',
  'keyboard',
  'mouse',
  'terminal',
  'file_save',
  'git_commit',
  'api_call',
]);
export type ActivityType = v.InferOutput<typeof ActivityTypeSchema>;

/**
 * Record activity request (POST /api/sessions/:id/activity).
 */
export const RecordActivityRequestSchema = v.object({
  type: ActivityTypeSchema,
  metadata: v.optional(v.record(v.string(), v.unknown())),
});
export type RecordActivityRequest = v.InferOutput<typeof RecordActivityRequestSchema>;

/**
 * Record activity response.
 */
export const RecordActivityResponseSchema = v.object({
  sessionId: v.string(),
  lastActivityAt: TimestampSchema,
  activityType: ActivityTypeSchema,
});
export type RecordActivityResponse = v.InferOutput<typeof RecordActivityResponseSchema>;

/**
 * Suspension reason types.
 */
export const SuspensionReasonSchema = v.picklist(['manual', 'auto', 'share_revoke']);
export type SuspensionReason = v.InferOutput<typeof SuspensionReasonSchema>;
