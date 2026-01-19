/**
 * Shared JWT test utilities.
 * Creates properly signed JWTs for testing using jose.
 */
import * as jose from 'jose';

// JWT secret must match the one used in auth service
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET);

/**
 * Create a properly signed test JWT token.
 * Supports creating expired tokens by passing exp in the past.
 */
export async function createTestJwt(payload: {
  sub: string;
  email: string;
  name?: string | null;
  exp?: number;
  iat?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiryTime = payload.exp ?? now + 3600;

  // For expired tokens, set exp directly in payload
  if (expiryTime <= now) {
    const jwt = await new jose.SignJWT({
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      exp: expiryTime,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(payload.iat ?? now)
      .sign(getSecretKey());
    return jwt;
  }

  // For valid tokens, use setExpirationTime
  const jwt = await new jose.SignJWT({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(payload.iat ?? now)
    .setExpirationTime(expiryTime)
    .sign(getSecretKey());

  return jwt;
}
