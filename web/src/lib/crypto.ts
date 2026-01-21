/**
 * Browser-side encryption utilities for encrypting tokens with orchestrator's public key.
 */

let cachedPublicKey: CryptoKey | null = null;
let cachedPemKey: string | null = null;

/**
 * Set the public key from the auth response.
 * Call this after fetching /auth/me.
 */
export async function setPublicKey(pemKey: string): Promise<void> {
  if (cachedPemKey === pemKey) return; // Already cached

  // Convert PEM to ArrayBuffer for Web Crypto
  const pemContents = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  cachedPublicKey = await crypto.subtle.importKey(
    'spki',
    binaryDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  cachedPemKey = pemKey;
}

/**
 * Check if the public key has been set.
 */
export function hasPublicKey(): boolean {
  return cachedPublicKey !== null;
}

/**
 * Encrypt a token with the orchestrator's public key.
 * Returns base64-encoded ciphertext.
 * Throws if setPublicKey() hasn't been called.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  if (!cachedPublicKey) {
    throw new Error('Public key not set. Call setPublicKey() first.');
  }
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cachedPublicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

/**
 * Clear cached public key.
 */
export function clearCachedPublicKey(): void {
  cachedPublicKey = null;
  cachedPemKey = null;
}
