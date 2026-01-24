/**
 * Mastra telemetry configuration for Phoenix integration.
 *
 * This module provides helpers for configuring Mastra's observability
 * to export traces to Phoenix.
 */

/**
 * Configuration for the Arize exporter.
 */
export interface ArizeExporterConfig {
  /** Phoenix trace endpoint URL */
  endpoint: string;
  /** Optional API key for authenticated setups */
  apiKey?: string;
}

/**
 * Mastra observability configuration.
 */
export interface MastraObservabilityConfig {
  configs?: {
    arize?: {
      /** Service name for traces */
      serviceName: string;
      /** Exporter configuration */
      exporter: ArizeExporterConfig;
    };
  };
}

/**
 * Environment variables for Phoenix configuration.
 */
export interface PhoenixEnvVars {
  PHOENIX_ENABLED?: string;
  PHOENIX_ENDPOINT?: string;
  PHOENIX_API_KEY?: string;
  PHOENIX_PROJECT_NAME?: string;
}

/**
 * Default Phoenix environment variable values.
 */
export const PHOENIX_DEFAULTS = {
  endpoint: 'http://phoenix:6006/v1/traces',
  projectName: 'mastragen-experiments',
} as const;

/**
 * Check if Phoenix is enabled via environment variables.
 */
export function isPhoenixEnabled(env: PhoenixEnvVars = process.env as unknown as PhoenixEnvVars): boolean {
  return env.PHOENIX_ENABLED === 'true';
}

/**
 * Build Mastra observability config from environment variables.
 *
 * Returns undefined if Phoenix is not enabled, allowing Mastra
 * to run without any telemetry overhead.
 *
 * @example
 * ```typescript
 * import { Mastra } from '@mastra/core';
 * import { buildObservabilityConfig } from './mastra-telemetry';
 *
 * const mastra = new Mastra({
 *   // ... your config
 *   observability: buildObservabilityConfig(),
 * });
 * ```
 */
export function buildObservabilityConfig(
  env: PhoenixEnvVars = process.env as unknown as PhoenixEnvVars
): MastraObservabilityConfig | undefined {
  if (!isPhoenixEnabled(env)) {
    return undefined;
  }

  return {
    configs: {
      arize: {
        serviceName: env.PHOENIX_PROJECT_NAME ?? PHOENIX_DEFAULTS.projectName,
        exporter: {
          endpoint: env.PHOENIX_ENDPOINT ?? PHOENIX_DEFAULTS.endpoint,
          apiKey: env.PHOENIX_API_KEY,
        },
      },
    },
  };
}

/**
 * Get the Phoenix UI URL for viewing traces.
 *
 * @param endpoint - The Phoenix endpoint URL
 * @returns The Phoenix UI URL (without the /v1/traces path)
 */
export function getPhoenixUiUrl(endpoint: string = PHOENIX_DEFAULTS.endpoint): string {
  // Remove /v1/traces suffix if present
  return endpoint.replace(/\/v1\/traces$/, '');
}
