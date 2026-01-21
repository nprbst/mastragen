/**
 * Browser-side encryption utilities for encrypting tokens with orchestrator's public key.
 */

const API_BASE = '/api';
let cachedPublicKey: CryptoKey | null = null;

/**
 * Fetch and cache the orchestrator's public key.
 */
async function getPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey;

  const res = await fetch(`${API_BASE}/encryption/public-key`);
  if (!res.ok) throw new Error('Failed to fetch public key');

  const { publicKey: pemKey } = await res.json();

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

  return cachedPublicKey;
}

/**
 * Encrypt a token with the orchestrator's public key.
 * Returns base64-encoded ciphertext.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const publicKey = await getPublicKey();
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, encoded);
  // Return as base64 for transport/storage
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

/**
 * Clear cached public key (useful if key rotation happens).
 */
export function clearCachedPublicKey(): void {
  cachedPublicKey = null;
}
