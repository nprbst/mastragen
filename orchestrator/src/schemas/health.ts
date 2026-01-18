/**
 * Health endpoint schema.
 */
import * as v from 'valibot';

/**
 * Health status response.
 */
export const HealthStatusSchema = v.object({
  status: v.picklist(['ok', 'unhealthy']),
  database: v.picklist(['connected', 'disconnected']),
  docker: v.picklist(['connected', 'disconnected']),
  version: v.string(),
  error: v.optional(v.string()),
});
export type HealthStatus = v.InferOutput<typeof HealthStatusSchema>;
