/**
 * Valibot schema for .mastragen/config.yaml project configuration.
 *
 * This schema validates project-level configuration that controls
 * component enablement and settings, including Phoenix observability.
 */
import * as v from 'valibot';

/**
 * Phoenix retention settings.
 */
export const PhoenixRetentionSchema = v.object({
  /** Days to retain traces (default: 30) */
  traces_days: v.optional(v.number(), 30),
  /** Days to retain experiments (default: 90) */
  experiments_days: v.optional(v.number(), 90),
});
export type PhoenixRetention = v.InferOutput<typeof PhoenixRetentionSchema>;

/**
 * Phoenix component configuration.
 */
export const PhoenixComponentConfigSchema = v.object({
  /** Enable/disable Phoenix for this project */
  enabled: v.optional(v.boolean(), false),
  /** Data retention settings */
  retention: v.optional(PhoenixRetentionSchema),
});
export type PhoenixComponentConfig = v.InferOutput<typeof PhoenixComponentConfigSchema>;

/**
 * Astro component configuration.
 */
export const AstroComponentConfigSchema = v.object({
  /** Enable/disable Astro UI sandbox */
  enabled: v.optional(v.boolean(), false),
  /** Path to Astro project relative to workspace */
  path: v.optional(v.string()),
});
export type AstroComponentConfig = v.InferOutput<typeof AstroComponentConfigSchema>;

/**
 * Components configuration section.
 */
export const ComponentsConfigSchema = v.object({
  /** Phoenix observability settings */
  phoenix: v.optional(PhoenixComponentConfigSchema),
  /** Astro UI sandbox settings */
  astro: v.optional(AstroComponentConfigSchema),
});
export type ComponentsConfig = v.InferOutput<typeof ComponentsConfigSchema>;

/**
 * Paths configuration section.
 */
export const PathsConfigSchema = v.object({
  /** Path to Mastra directory relative to workspace */
  mastra: v.optional(v.string()),
  /** Custom workspace path */
  workspace: v.optional(v.string()),
});
export type PathsConfig = v.InferOutput<typeof PathsConfigSchema>;

/**
 * Root schema for .mastragen/config.yaml
 */
export const MastragenConfigFileSchema = v.object({
  /** Config file version - must be "1" */
  version: v.literal('1'),
  /** Component enablement settings */
  components: v.optional(ComponentsConfigSchema),
  /** Workspace paths */
  paths: v.optional(PathsConfigSchema),
});
export type MastragenConfigFile = v.InferOutput<typeof MastragenConfigFileSchema>;

/**
 * Default config when .mastragen/config.yaml is missing or empty.
 */
export const MASTRAGEN_CONFIG_DEFAULTS: MastragenConfigFile = {
  version: '1',
  components: {
    phoenix: {
      enabled: false,
      retention: {
        traces_days: 30,
        experiments_days: 90,
      },
    },
    astro: {
      enabled: false,
    },
  },
};
