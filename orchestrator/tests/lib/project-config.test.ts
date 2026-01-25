import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadProjectConfig,
  MASTRAGEN_CONFIG_DEFAULTS,
} from '../../src/lib/project-config.ts';

describe('loadProjectConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `mastragen-config-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('returns defaults when config file does not exist', async () => {
    const config = await loadProjectConfig(testDir);

    expect(config).toEqual(MASTRAGEN_CONFIG_DEFAULTS);
    expect(config.version).toBe('1');
    expect(config.phoenix?.enabled).toBe(false);
  });

  test('returns defaults when .mastragen directory does not exist', async () => {
    const config = await loadProjectConfig(testDir);

    expect(config).toEqual(MASTRAGEN_CONFIG_DEFAULTS);
  });

  test('parses valid config file with Phoenix enabled', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "1"

[phoenix]
enabled = true

[phoenix.retention]
traces_days = 60
experiments_days = 120
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    const config = await loadProjectConfig(testDir);

    expect(config.version).toBe('1');
    expect(config.phoenix?.enabled).toBe(true);
    expect(config.phoenix?.retention?.traces_days).toBe(60);
    expect(config.phoenix?.retention?.experiments_days).toBe(120);
  });

  test('merges partial config with defaults', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "1"

[phoenix]
enabled = true
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    const config = await loadProjectConfig(testDir);

    expect(config.version).toBe('1');
    expect(config.phoenix?.enabled).toBe(true);
    // Retention should have defaults
    expect(config.phoenix?.retention?.traces_days).toBe(30);
    expect(config.phoenix?.retention?.experiments_days).toBe(90);
  });

  test('parses config with Astro settings', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "1"

[astro]
enabled = true
path = "./my-ui"
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    const config = await loadProjectConfig(testDir);

    expect(config.astro?.enabled).toBe(true);
    expect(config.astro?.path).toBe('./my-ui');
    // Phoenix should have defaults
    expect(config.phoenix?.enabled).toBe(false);
  });

  test('parses config with paths settings', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "1"

[paths]
mastra = "./src/mastra"
workspace = "/custom/workspace"
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    const config = await loadProjectConfig(testDir);

    expect(config.paths?.mastra).toBe('./src/mastra');
    expect(config.paths?.workspace).toBe('/custom/workspace');
  });

  test('throws error for invalid TOML syntax', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const invalidToml = `
version = "1"

[phoenix
enabled = true
`;
    await writeFile(join(configDir, 'config.toml'), invalidToml);

    await expect(loadProjectConfig(testDir)).rejects.toThrow('Invalid TOML syntax');
  });

  test('throws error for invalid version', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "2"

[phoenix]
enabled = true
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    await expect(loadProjectConfig(testDir)).rejects.toThrow();
  });

  test('throws error for invalid retention value', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `
version = "1"

[phoenix]
enabled = true

[phoenix.retention]
traces_days = "not-a-number"
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    await expect(loadProjectConfig(testDir)).rejects.toThrow();
  });

  test('handles empty config file', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    await writeFile(join(configDir, 'config.toml'), '');

    const config = await loadProjectConfig(testDir);
    expect(config).toEqual(MASTRAGEN_CONFIG_DEFAULTS);
  });

  test('handles config file with only version', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    const configToml = `version = "1"`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    const config = await loadProjectConfig(testDir);

    expect(config.version).toBe('1');
    expect(config.phoenix?.enabled).toBe(false);
    expect(config.phoenix?.retention?.traces_days).toBe(30);
  });

  test('isPhoenixEnabled helper returns correct value', async () => {
    const configDir = join(testDir, '.mastragen');
    await mkdir(configDir, { recursive: true });

    // Test with Phoenix enabled
    let configToml = `
version = "1"

[phoenix]
enabled = true
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    let config = await loadProjectConfig(testDir);
    expect(config.phoenix?.enabled).toBe(true);

    // Test with Phoenix disabled
    configToml = `
version = "1"

[phoenix]
enabled = false
`;
    await writeFile(join(configDir, 'config.toml'), configToml);

    config = await loadProjectConfig(testDir);
    expect(config.phoenix?.enabled).toBe(false);
  });
});
