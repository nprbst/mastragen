/**
 * Schema for config scaffolding API request/response.
 */
import * as v from 'valibot';

/**
 * Phoenix component configuration for scaffolding.
 */
export const ScaffoldPhoenixConfigSchema = v.object({
  enabled: v.boolean(),
});
export type ScaffoldPhoenixConfig = v.InferOutput<typeof ScaffoldPhoenixConfigSchema>;

/**
 * Astro component configuration for scaffolding.
 */
export const ScaffoldAstroConfigSchema = v.object({
  enabled: v.boolean(),
  path: v.optional(v.string()),
});
export type ScaffoldAstroConfig = v.InferOutput<typeof ScaffoldAstroConfigSchema>;

/**
 * Request body for POST /sessions/:id/scaffold-config.
 */
export const ScaffoldConfigRequestSchema = v.object({
  phoenix: v.optional(ScaffoldPhoenixConfigSchema),
  astro: v.optional(ScaffoldAstroConfigSchema),
});
export type ScaffoldConfigRequest = v.InferOutput<typeof ScaffoldConfigRequestSchema>;

/**
 * Response for POST /sessions/:id/scaffold-config.
 */
export const ScaffoldConfigResponseSchema = v.object({
  success: v.boolean(),
  commitSha: v.optional(v.string()),
  branch: v.optional(v.string()),
  configPath: v.string(),
});
export type ScaffoldConfigResponse = v.InferOutput<typeof ScaffoldConfigResponseSchema>;
