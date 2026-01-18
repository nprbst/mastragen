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
async function verifyJwt(token: string, _secret: string = JWT_SECRET): Promise<JwtPayload> {
  // Simple JWT verification
  // In production, use a proper JWT library like jose
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  try {
    // Decode payload (middle part)
    const payloadBase64 = parts[1]!;
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
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
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
 * Middleware that requires the user to have access to a project.
 * Access is determined by GitHub App installation:
 * - User must have access to the installation linked to the project
 * - Installation must not be suspended
 *
 * Must be used after requireAuth().
 * Expects projectId in route params.
 */
export function requireProjectAccess(): MiddlewareHandler {
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

    // Get project with installation info
    const project = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId)
      .executeTakeFirst();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    if (!project.installation_id) {
      return c.json({ error: 'Project not linked to GitHub installation' }, 403);
    }

    // Get the installation
    const installation = await db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('id', '=', project.installation_id)
      .executeTakeFirst();

    if (!installation) {
      return c.json({ error: 'Installation not found' }, 403);
    }

    if (installation.suspended_at) {
      return c.json({ error: 'GitHub App installation is suspended' }, 403);
    }

    // Get user's GitHub access token to verify they have access to this installation
    const dbUser = await db
      .selectFrom('users')
      .select(['github_access_token'])
      .where('id', '=', user.id)
      .executeTakeFirst();

    if (!dbUser?.github_access_token) {
      return c.json({ error: 'GitHub access token not available' }, 403);
    }

    // Verify user has access to this installation via GitHub API
    const hasAccess = await verifyInstallationAccess(
      dbUser.github_access_token,
      installation.installation_id
    );

    if (!hasAccess) {
      return c.json({ error: 'Access denied to this project' }, 403);
    }

    // Store installation info in context for downstream use
    c.set('installation', installation);
    c.set('project', project);

    await next();
  };
}

/**
 * Middleware that requires the user to have admin access to a project.
 * Admin access is determined by GitHub repository permissions.
 *
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

    // Get project with installation and repo info
    const project = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId)
      .executeTakeFirst();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    if (!project.installation_id) {
      return c.json({ error: 'Project not linked to GitHub installation' }, 403);
    }

    if (!project.github_repo) {
      return c.json({ error: 'Project not linked to GitHub repository' }, 403);
    }

    // Get the installation
    const installation = await db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('id', '=', project.installation_id)
      .executeTakeFirst();

    if (!installation) {
      return c.json({ error: 'Installation not found' }, 403);
    }

    if (installation.suspended_at) {
      return c.json({ error: 'GitHub App installation is suspended' }, 403);
    }

    // Get user's GitHub access token
    const dbUser = await db
      .selectFrom('users')
      .select(['github_access_token'])
      .where('id', '=', user.id)
      .executeTakeFirst();

    if (!dbUser?.github_access_token) {
      return c.json({ error: 'GitHub access token not available' }, 403);
    }

    // Check if user has admin permissions on the repository
    const isAdmin = await verifyRepositoryAdmin(
      dbUser.github_access_token,
      project.github_repo
    );

    if (!isAdmin) {
      return c.json({ error: 'Admin access required' }, 403);
    }

    // Store installation info in context for downstream use
    c.set('installation', installation);
    c.set('project', project);

    await next();
  };
}

/**
 * Verify that a user has access to a GitHub App installation.
 */
async function verifyInstallationAccess(
  accessToken: string,
  installationId: number
): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user/installations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch user installations:', response.status);
      return false;
    }

    const data = (await response.json()) as {
      installations: Array<{ id: number }>;
    };

    return data.installations.some((inst) => inst.id === installationId);
  } catch (error) {
    console.error('Error verifying installation access:', error);
    return false;
  }
}

/**
 * Verify that a user has admin permissions on a GitHub repository.
 */
async function verifyRepositoryAdmin(
  accessToken: string,
  repoFullName: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch repository:', response.status);
      return false;
    }

    const data = (await response.json()) as {
      permissions?: { admin?: boolean };
    };

    return data.permissions?.admin === true;
  } catch (error) {
    console.error('Error verifying repository admin:', error);
    return false;
  }
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
