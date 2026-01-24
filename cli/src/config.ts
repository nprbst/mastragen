/**
 * CLI Configuration
 * Priority: CLI flags > Environment variables > Defaults
 */

export interface CliConfig {
  apiUrl: string;
}

const DEFAULT_API_URL = 'http://localhost:4000';

/**
 * Loads CLI configuration from environment variables.
 */
export function loadConfig(): CliConfig {
  return {
    apiUrl: process.env['MGEN_API_URL'] ?? DEFAULT_API_URL,
  };
}
