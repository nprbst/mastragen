import { Hono } from 'hono';
import { getPublicKey } from '../lib/crypto.ts';

/**
 * Creates encryption routes for public key distribution.
 */
export function encryptionRoutes(): Hono {
  const app = new Hono();

  // Public endpoint - no auth required
  // Browser fetches this to encrypt tokens before storage/transmission
  app.get('/public-key', (c) => {
    try {
      const publicKey = getPublicKey();
      return c.json({ publicKey });
    } catch (err) {
      console.error('Failed to get public key:', err);
      return c.json({ error: 'Encryption not available' }, 500);
    }
  });

  return app;
}
