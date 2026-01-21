/**
 * Browser-side encryption utilities for encrypting tokens with orchestrator's public key.
 */

const PUBLIC_KEY_STORAGE_KEY = 'mastragen_encryption_public_key';

let cachedPublicKey: CryptoKey | null = null;
let cachedPemKey: string | null = null;

/**
 * Import a PEM key into a CryptoKey.
 */
async function importPemKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'spki',
    binaryDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

/**
 * Set the public key from the auth response.
 * Persists to localStorage for use across page loads.
 */
export async function setPublicKey(pemKey: string): Promise<void> {
  if (cachedPemKey === pemKey) return; // Already cached

  cachedPublicKey = await importPemKey(pemKey);
  cachedPemKey = pemKey;

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, pemKey);
  }
}

/**
 * Restore the public key from localStorage if available.
 * Call this on page load before attempting encryption.
 */
export async function restorePublicKey(): Promise<boolean> {
  if (cachedPublicKey) return true; // Already have it

  if (typeof window === 'undefined') return false;

  const storedPemKey = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  if (!storedPemKey) return false;

  try {
    cachedPublicKey = await importPemKey(storedPemKey);
    cachedPemKey = storedPemKey;
    return true;
  } catch {
    // Invalid stored key, clear it
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
    return false;
  }
}

/**
 * Check if the public key has been set.
 */
export function hasPublicKey(): boolean {
  return cachedPublicKey !== null;
}

/**
 * Ensure the public key is available, fetching from server if needed.
 * This handles existing users who logged in before this feature.
 */
export async function ensurePublicKey(accessToken: string): Promise<boolean> {
  // Already have it in memory
  if (cachedPublicKey) return true;

  // Try localStorage first
  if (await restorePublicKey()) return true;

  // Fetch from server
  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    if (!response.ok) return false;

    const data = await response.json();
    if (data.encryptionPublicKey) {
      await setPublicKey(data.encryptionPublicKey);
      return true;
    }
  } catch {
    // Fetch failed
  }

  return false;
}

/**
 * Encrypt a token with the orchestrator's public key.
 * Returns base64-encoded ciphertext.
 * Attempts to restore from localStorage if key not in memory.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  // Try to restore from localStorage if not in memory
  if (!cachedPublicKey) {
    await restorePublicKey();
  }

  if (!cachedPublicKey) {
    throw new Error('Public key not available. User may need to re-authenticate.');
  }

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cachedPublicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

/**
 * Clear cached public key from memory and localStorage.
 */
export function clearCachedPublicKey(): void {
  cachedPublicKey = null;
  cachedPemKey = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
  }
}
