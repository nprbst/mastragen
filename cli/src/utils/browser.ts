/**
 * Browser utilities for opening URLs in Chrome incognito mode.
 */
import { existsSync } from 'node:fs';

export type ServiceName = 'mastra' | 'astro' | 'vscode';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  `${process.env.HOME}/Applications/Chromium.app/Contents/MacOS/Chromium`,
];

/**
 * Finds Chrome binary path, checking common locations and falling back to mdfind.
 */
export function findChromePath(): string | null {
  // Check known paths first
  for (const path of CHROME_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fall back to mdfind (Spotlight) to locate Chrome
  try {
    const proc = Bun.spawnSync(['mdfind', 'kMDItemCFBundleIdentifier == com.google.Chrome']);
    const result = proc.stdout.toString().trim();
    if (result) {
      const appPath = result.split('\n')[0];
      const binaryPath = `${appPath}/Contents/MacOS/Google Chrome`;
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  } catch {
    // mdfind failed, continue
  }

  return null;
}

/**
 * Opens URLs in Chrome incognito mode.
 * Calls Chrome binary directly to ensure flags work even when Chrome is already running.
 */
export function openInChrome(urls: string[]): void {
  if (urls.length === 0) return;

  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('Could not find Google Chrome. Please install it or open URLs manually.');
    return;
  }

  // Call Chrome binary directly (open --args doesn't work when Chrome is already running)
  // Use Bun.spawn with unref so CLI exits immediately without waiting for Chrome
  const proc = Bun.spawn([chromePath, '--incognito', ...urls], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  proc.unref();
}

/**
 * Resolves service names to URLs based on the --open flag value.
 * @param flag - 'all' or comma-separated service names (e.g., 'vscode,mastra')
 * @param availableUrls - The URLs object from session response
 * @returns Array of URLs to open
 */
export function resolveServices(
  flag: string,
  availableUrls: { mastra: string; astro?: string | null; vscode: string }
): string[] {
  const all: ServiceName[] = ['mastra', 'vscode'];
  if (availableUrls.astro) all.splice(1, 0, 'astro');

  const requested = flag === 'all' ? all : (flag.split(',') as ServiceName[]);

  return requested
    .filter((name) => name in availableUrls || (name === 'astro' && availableUrls.astro))
    .map((name) => availableUrls[name as keyof typeof availableUrls])
    .filter((url): url is string => !!url);
}
