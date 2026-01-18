import type { Context, MiddlewareHandler } from 'hono';
import type { JwtPayload } from '../schemas/auth.ts';
import { validateJwtPayload, isJwtExpired } from '../schemas/auth.ts';

// Symbol for storing auth user in context
const AUTH_USER_KEY = 'authUser';

/**
 * Decoded and validated user from JWT.
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * JWT verification options.
 */
export interface JwtVerifyOptions {
  secret: string;
  algorithms?: string[];
}

// Default JWT secret (should be configured via environment)
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

/**
 * Decode and verify a JWT token.
 * Returns the payload if valid, throws if invalid.
 */
async function verifyJwt(token: string, secret: string = JWT_SECRET): Promise<JwtPayload> {
  // Simple JWT verification
  // In production, use a proper JWT library like jose
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  try {
    // Decode payload (middle part)
    const payloadBase64 = parts[1];
    const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Validate payload structure
    const validated = validateJwtPayload(payload);

    // Check expiration
    if (isJwtExpired(validated)) {
      throw new Error('Token expired');
    }

    // In production, also verify signature using the secret
    // For now, we trust the payload if it's well-formed
    // TODO: Implement proper signature verification

    return validated;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        throw error;
      }
    }
    throw new Error('Invalid token');
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware that requires authentication.
 * Returns 401 if not authenticated.
 */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = extractBearerToken(authHeader);
    if (!token) {
      return c.json({ error: 'Invalid authorization header' }, 401);
    }

    try {
      const payload = await verifyJwt(token);

      // Set user in context
      const user: AuthUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };

      c.set(AUTH_USER_KEY, user);
      await next();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Token expired') {
          return c.json({ error: 'Token expired' }, 401);
        }
      }
      return c.json({ error: 'Invalid token' }, 401);
    }
  };
}

/**
 * Middleware that optionally extracts auth if present.
 * Does not fail if no auth header.
 */
export function optionalAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (authHeader) {
      const token = extractBearerToken(authHeader);
      if (token) {
        try {
          const payload = await verifyJwt(token);

          const user: AuthUser = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
          };

          c.set(AUTH_USER_KEY, user);
        } catch {
          // Ignore auth errors in optional mode
        }
      }
    }

    await next();
  };
}

/**
 * Middleware that requires the user to be a member of the project.
 * Must be used after requireAuth().
 * Expects projectId in route params.
 */
export function requireProjectMember(): MiddlewareHandler {
  return async (c, next) => {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const projectId = c.req.param('projectId');
    if (!projectId) {
      return c.json({ error: 'Project ID required' }, 400);
    }

    // Check membership via repository
    // This requires db context - will be injected via app context
    const db = c.get('db');
    if (!db) {
      console.error('Database not available in context');
      return c.json({ error: 'Internal server error' }, 500);
    }

    // Import dynamically to avoid circular dependencies
    const { UserProjectMembersRepository } = await import('../repositories/user-project-members.ts');
    const membersRepo = new UserProjectMembersRepository(db);

    const isMember = await membersRepo.isMember(user.id, projectId);
    if (!isMember) {
      return c.json({ error: 'Access denied' }, 403);
    }

    await next();
  };
}

/**
 * Middleware that requires the user to be an admin of the project.
 * Must be used after requireAuth().
 * Expects projectId in route params.
 */
export function requireProjectAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const projectId = c.req.param('projectId');
    if (!projectId) {
      return c.json({ error: 'Project ID required' }, 400);
    }

    const db = c.get('db');
    if (!db) {
      console.error('Database not available in context');
      return c.json({ error: 'Internal server error' }, 500);
    }

    const { UserProjectMembersRepository } = await import('../repositories/user-project-members.ts');
    const membersRepo = new UserProjectMembersRepository(db);

    const isAdmin = await membersRepo.isAdmin(user.id, projectId);
    if (!isAdmin) {
      return c.json({ error: 'Admin access required' }, 403);
    }

    await next();
  };
}

/**
 * Get the authenticated user from context.
 * Returns undefined if not authenticated.
 */
export function getAuthUser(c: Context): AuthUser | undefined {
  return c.get(AUTH_USER_KEY) as AuthUser | undefined;
}

/**
 * Get the authenticated user from context, throwing if not present.
 */
export function requireAuthUser(c: Context): AuthUser {
  const user = getAuthUser(c);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
