/**
 * Project configuration file parser.
 *
 * Reads and parses .mastragen/config.toml from a workspace directory,
 * merging with defaults for missing values.
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import * as v from 'valibot';
import {
  MASTRAGEN_CONFIG_DEFAULTS,
  type MastragenConfigFile,
  MastragenConfigFileSchema,
} from './project-config.schema.ts';

// Re-export types and defaults for convenience
export { type MastragenConfigFile, MASTRAGEN_CONFIG_DEFAULTS } from './project-config.schema.ts';

/**
 * Path to config file relative to workspace root.
 */
const CONFIG_PATH = '.mastragen/config.toml';

/**
 * Load and parse project configuration from workspace.
 *
 * Reads .mastragen/config.toml if it exists, validates against schema,
 * and merges with defaults for any missing values.
 *
 * @param workspacePath - Root directory of the workspace
 * @returns Parsed and validated configuration with defaults applied
 * @throws Error if config file exists but contains invalid TOML or fails validation
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

  // Parse TOML
  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch (err) {
    throw new Error(`Invalid TOML syntax: ${err instanceof Error ? err.message : 'parse error'}`);
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
    phoenix: {
      enabled: config.phoenix?.enabled ?? defaults.phoenix?.enabled ?? false,
      retention: {
        traces_days:
          config.phoenix?.retention?.traces_days ?? defaults.phoenix?.retention?.traces_days ?? 30,
        experiments_days:
          config.phoenix?.retention?.experiments_days ??
          defaults.phoenix?.retention?.experiments_days ??
          90,
      },
    },
    astro: {
      enabled: config.astro?.enabled ?? defaults.astro?.enabled ?? false,
      path: config.astro?.path,
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
  return config.phoenix?.enabled ?? false;
}
