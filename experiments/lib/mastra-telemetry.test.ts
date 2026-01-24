import { describe, expect, test } from 'bun:test';
import {
  isPhoenixEnabled,
  buildObservabilityConfig,
  getPhoenixUiUrl,
  PHOENIX_DEFAULTS,
} from './mastra-telemetry';

describe('isPhoenixEnabled', () => {
  test('returns false when PHOENIX_ENABLED is not set', () => {
    expect(isPhoenixEnabled({})).toBe(false);
  });

  test('returns false when PHOENIX_ENABLED is "false"', () => {
    expect(isPhoenixEnabled({ PHOENIX_ENABLED: 'false' })).toBe(false);
  });

  test('returns true when PHOENIX_ENABLED is "true"', () => {
    expect(isPhoenixEnabled({ PHOENIX_ENABLED: 'true' })).toBe(true);
  });

  test('returns false for other values', () => {
    expect(isPhoenixEnabled({ PHOENIX_ENABLED: 'yes' })).toBe(false);
    expect(isPhoenixEnabled({ PHOENIX_ENABLED: '1' })).toBe(false);
  });
});

describe('buildObservabilityConfig', () => {
  test('returns undefined when Phoenix is not enabled', () => {
    const config = buildObservabilityConfig({});
    expect(config).toBeUndefined();
  });

  test('returns undefined when PHOENIX_ENABLED is "false"', () => {
    const config = buildObservabilityConfig({ PHOENIX_ENABLED: 'false' });
    expect(config).toBeUndefined();
  });

  test('returns config with defaults when Phoenix is enabled', () => {
    const config = buildObservabilityConfig({ PHOENIX_ENABLED: 'true' });

    expect(config).toBeDefined();
    expect(config?.configs?.arize?.serviceName).toBe(PHOENIX_DEFAULTS.projectName);
    expect(config?.configs?.arize?.exporter.endpoint).toBe(PHOENIX_DEFAULTS.endpoint);
    expect(config?.configs?.arize?.exporter.apiKey).toBeUndefined();
  });

  test('uses custom values from environment', () => {
    const config = buildObservabilityConfig({
      PHOENIX_ENABLED: 'true',
      PHOENIX_ENDPOINT: 'http://custom:8080/v1/traces',
      PHOENIX_PROJECT_NAME: 'my-project',
      PHOENIX_API_KEY: 'secret-key',
    });

    expect(config?.configs?.arize?.serviceName).toBe('my-project');
    expect(config?.configs?.arize?.exporter.endpoint).toBe('http://custom:8080/v1/traces');
    expect(config?.configs?.arize?.exporter.apiKey).toBe('secret-key');
  });
});

describe('getPhoenixUiUrl', () => {
  test('returns default UI URL', () => {
    expect(getPhoenixUiUrl()).toBe('http://phoenix:6006');
  });

  test('strips /v1/traces suffix', () => {
    expect(getPhoenixUiUrl('http://localhost:6006/v1/traces')).toBe('http://localhost:6006');
  });

  test('returns URL unchanged if no suffix', () => {
    expect(getPhoenixUiUrl('http://localhost:6006')).toBe('http://localhost:6006');
  });
});
