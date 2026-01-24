/**
 * Project configuration file parser.
 *
 * Reads and parses .mastragen/config.yaml from a workspace directory,
 * merging with defaults for missing values.
 */
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import * as v from 'valibot';
import {
  MastragenConfigFileSchema,
  MASTRAGEN_CONFIG_DEFAULTS,
  type MastragenConfigFile,
} from './project-config.schema.ts';

// Re-export types and defaults for convenience
export { type MastragenConfigFile, MASTRAGEN_CONFIG_DEFAULTS } from './project-config.schema.ts';

/**
 * Path to config file relative to workspace root.
 */
const CONFIG_PATH = '.mastragen/config.yaml';

/**
 * Load and parse project configuration from workspace.
 *
 * Reads .mastragen/config.yaml if it exists, validates against schema,
 * and merges with defaults for any missing values.
 *
 * @param workspacePath - Root directory of the workspace
 * @returns Parsed and validated configuration with defaults applied
 * @throws Error if config file exists but contains invalid YAML or fails validation
 */
export async function loadProjectConfig(workspacePath: string): Promise<MastragenConfigFile> {
  const configPath = join(workspacePath, CONFIG_PATH);

  // Check if config file exists
  try {
    await access(configPath);
  } catch {
    // File doesn't exist, return defaults
    return MASTRAGEN_CONFIG_DEFAULTS;
  }

  // Read and parse the config file
  const content = await readFile(configPath, 'utf-8');

  // Handle empty file
  if (!content.trim()) {
    return MASTRAGEN_CONFIG_DEFAULTS;
  }

  // Parse YAML
  const parsed = yaml.load(content) as unknown;

  // Handle null/undefined from YAML parse
  if (parsed === null || parsed === undefined) {
    return MASTRAGEN_CONFIG_DEFAULTS;
  }

  // Validate against schema
  const result = v.safeParse(MastragenConfigFileSchema, parsed);

  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join(', ');
    throw new Error(`Invalid config file: ${issues}`);
  }

  // Merge with defaults for missing values
  return mergeWithDefaults(result.output);
}

/**
 * Deep merge parsed config with defaults.
 *
 * Ensures all nested defaults are applied when partial config is provided.
 */
function mergeWithDefaults(config: MastragenConfigFile): MastragenConfigFile {
  const defaults = MASTRAGEN_CONFIG_DEFAULTS;

  return {
    version: config.version,
    components: {
      phoenix: {
        enabled: config.components?.phoenix?.enabled ?? defaults.components?.phoenix?.enabled ?? false,
        retention: {
          traces_days:
            config.components?.phoenix?.retention?.traces_days ??
            defaults.components?.phoenix?.retention?.traces_days ??
            30,
          experiments_days:
            config.components?.phoenix?.retention?.experiments_days ??
            defaults.components?.phoenix?.retention?.experiments_days ??
            90,
        },
      },
      astro: {
        enabled: config.components?.astro?.enabled ?? defaults.components?.astro?.enabled ?? false,
        path: config.components?.astro?.path,
      },
    },
    paths: config.paths,
  };
}

/**
 * Check if Phoenix is enabled for a workspace.
 *
 * Convenience function to check Phoenix enablement without loading full config.
 *
 * @param workspacePath - Root directory of the workspace
 * @returns true if Phoenix is enabled, false otherwise
 */
export async function isPhoenixEnabled(workspacePath: string): Promise<boolean> {
  const config = await loadProjectConfig(workspacePath);
  return config.components?.phoenix?.enabled ?? false;
}
