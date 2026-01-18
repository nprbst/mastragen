/**
 * Claude OAuth token caching utilities.
 *
 * Tokens from `claude setup-token` are cached in ~/.claude/.token
 * for convenience across session create/resume operations.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const CLAUDE_DIR = join(homedir(), '.claude');
const TOKEN_PATH = join(CLAUDE_DIR, '.token');

/**
 * Retrieves the cached Claude OAuth token if it exists.
 */
export function getCachedToken(): string | null {
  if (!existsSync(TOKEN_PATH)) {
    return null;
  }
  try {
    return readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Saves a Claude OAuth token to the cache file.
 * Creates the ~/.claude directory if it doesn't exist.
 * File is created with 600 permissions (owner read/write only).
 */
export function saveCachedToken(token: string): void {
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

/**
 * Truncates a token for display purposes.
 * Shows first 15 chars and last 4 chars: "sk-ant-oat01-Uq...XXXX"
 */
export function truncateToken(token: string): string {
  if (token.length <= 20) {
    return token;
  }
  return `${token.slice(0, 15)}...${token.slice(-4)}`;
}
