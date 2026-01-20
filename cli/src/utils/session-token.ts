/**
 * Session token caching utilities.
 *
 * Session tokens from the orchestrator are cached in ~/.mgen/sessions/{sessionId}
 * for use with session-scoped API calls (suspend, resume, etc.).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';

const MGEN_DIR = join(homedir(), '.mgen');
const SESSIONS_DIR = join(MGEN_DIR, 'sessions');

/**
 * Retrieves the cached session token for a specific session.
 */
export function getSessionToken(sessionId: string): string | null {
  const tokenPath = join(SESSIONS_DIR, sessionId);
  if (!existsSync(tokenPath)) {
    return null;
  }
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Saves a session token to the cache file.
 * Creates the ~/.mgen/sessions directory if it doesn't exist.
 * File is created with 600 permissions (owner read/write only).
 */
export function saveSessionToken(sessionId: string, token: string): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  }
  const tokenPath = join(SESSIONS_DIR, sessionId);
  writeFileSync(tokenPath, token, { mode: 0o600 });
}

/**
 * Removes a cached session token.
 */
export function removeSessionToken(sessionId: string): void {
  const tokenPath = join(SESSIONS_DIR, sessionId);
  if (existsSync(tokenPath)) {
    try {
      unlinkSync(tokenPath);
    } catch {
      // Ignore errors when removing
    }
  }
}
