/**
 * Interactive prompts for scaffolding .mastragen/config.toml
 */
import { confirm, text, spinner, isCancel } from '@clack/prompts';
import type { MgenClient, ScaffoldConfigRequest } from './client.ts';
import { error, success, warning } from './output.ts';

/**
 * Config settings from user prompts.
 */
export interface ConfigSettings {
  phoenix: { enabled: boolean };
  astro: { enabled: boolean; path?: string };
}

/**
 * Prompts user for config settings.
 * Returns null if user cancels or skips.
 */
export async function promptForConfig(): Promise<ConfigSettings | null> {
  // Initial opt-in prompt
  const shouldSetup = await confirm({
    message: 'No config found. Set up .mastragen/config.toml now?',
    initialValue: true,
  });

  if (isCancel(shouldSetup) || !shouldSetup) {
    return null; // User skipped
  }

  // Phoenix prompt
  const phoenixEnabled = await confirm({
    message: 'Enable Phoenix observability?',
    initialValue: true,
  });
  if (isCancel(phoenixEnabled)) return null;

  // Astro prompt
  const astroEnabled = await confirm({
    message: 'Enable Astro UI sandbox?',
    initialValue: false,
  });
  if (isCancel(astroEnabled)) return null;

  // Astro path (only if enabled)
  let astroPath: string | undefined;
  if (astroEnabled) {
    const pathInput = await text({
      message: 'Path to Astro project:',
      initialValue: './ui',
    });
    if (isCancel(pathInput)) return null;
    astroPath = pathInput;
  }

  return {
    phoenix: { enabled: phoenixEnabled },
    astro: { enabled: astroEnabled, path: astroPath },
  };
}

/**
 * Prompts user for config and scaffolds if they opt in.
 * Called after session creation when configMissing is true.
 * @deprecated Use promptForConfig() and pass config to createSession instead.
 */
export async function promptAndScaffoldConfig(
  client: MgenClient,
  sessionId: string,
  sessionToken: string
): Promise<void> {
  const config = await promptForConfig();
  if (!config) {
    return; // User skipped
  }

  // Convert to ScaffoldConfigRequest
  const scaffoldConfig: ScaffoldConfigRequest = {
    phoenix: config.phoenix,
    astro: config.astro,
  };

  // Call API with spinner
  const s = spinner();
  s.start('Creating config...');

  try {
    const result = await client.scaffoldConfig(sessionId, sessionToken, scaffoldConfig);
    s.stop('Config created');
    console.log(success(`Created ${result.configPath}`));
    if (result.branch) {
      console.log(`  Committed to branch: ${result.branch}`);
      console.log('  Run `git push` to persist');
    }
  } catch (err) {
    s.stop('Failed to create config');
    console.error(error(err instanceof Error ? err.message : 'Unknown error'));
    // Don't exit - session was created successfully
  }
}
