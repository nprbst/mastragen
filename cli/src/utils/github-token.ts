/**
 * GitHub token utilities for CLI.
 *
 * Gets GitHub token from `gh` CLI if available for pre-flight config checks
 * and git operations in sandboxes.
 */
import { execSync } from 'node:child_process';

/**
 * Gets GitHub token from `gh` CLI if available.
 * Returns null if gh CLI is not installed or not authenticated.
 */
export function getGitHubToken(): string | null {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}
