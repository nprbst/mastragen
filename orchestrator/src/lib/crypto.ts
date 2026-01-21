import crypto from 'crypto';

// Key pair stored in memory, generated at startup or loaded from env
let keyPair: { publicKey: string; privateKey: string } | null = null;

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
  } else {
    // Generate new key pair (development)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyPair = { publicKey, privateKey };
    console.warn(
      'Generated ephemeral RSA key pair. Set ENCRYPTION_PUBLIC_KEY and ENCRYPTION_PRIVATE_KEY for persistence.'
    );
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
