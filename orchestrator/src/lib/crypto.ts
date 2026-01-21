import crypto from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Key pair stored in memory, generated at startup or loaded from env
let keyPair: { publicKey: string; privateKey: string } | null = null;

// File paths for persistent key storage in development
const DATA_DIR = '/app/data';
const PUBLIC_KEY_PATH = join(DATA_DIR, 'encryption.public.pem');
const PRIVATE_KEY_PATH = join(DATA_DIR, 'encryption.private.pem');

export function initializeKeyPair(): void {
  const envPublicKey = process.env.ENCRYPTION_PUBLIC_KEY;
  const envPrivateKey = process.env.ENCRYPTION_PRIVATE_KEY;

  if (envPublicKey && envPrivateKey) {
    // Load from environment (production)
    keyPair = {
      publicKey: envPublicKey,
      privateKey: envPrivateKey,
    };
    console.log('Loaded RSA key pair from environment variables');
  } else if (existsSync(PUBLIC_KEY_PATH) && existsSync(PRIVATE_KEY_PATH)) {
    // Load from persistent files (development)
    keyPair = {
      publicKey: readFileSync(PUBLIC_KEY_PATH, 'utf8'),
      privateKey: readFileSync(PRIVATE_KEY_PATH, 'utf8'),
    };
    console.log('Loaded RSA key pair from persistent files');
  } else {
    // Generate and persist key pair (first-time development setup)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyPair = { publicKey, privateKey };

    // Persist to disk for future restarts
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
    writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
    console.log(`Generated and persisted RSA key pair to ${DATA_DIR}/`);
  }
}

export function getPublicKey(): string {
  if (!keyPair) throw new Error('Key pair not initialized. Call initializeKeyPair() first.');
  return keyPair.publicKey;
}

export function decryptToken(encryptedBase64: string): string {
  if (!keyPair) throw new Error('Key pair not initialized. Call initializeKeyPair() first.');

  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: keyPair.privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encrypted
  );

  return decrypted.toString('utf8');
}
