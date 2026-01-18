import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AuthService } from '../services/auth.ts';
import { requireAuth, getAuthUser } from '../middleware/auth.ts';
import { getAuditLogger } from '../services/audit-logger.ts';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_MAX_AGE = 604800; // 7 days in seconds

/**
 * Create auth routes.
 */
export function createAuthRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const authService = new AuthService(db);
  const auditLogger = getAuditLogger();

  /**
   * GET /auth/login
   * Initiates OIDC login flow.
   */
  app.get('/login', async (c) => {
    const redirectUri = c.req.query('redirect_uri');

    try {
      const loginUrl = await authService.getLoginUrl(redirectUri);
      return c.redirect(loginUrl, 302);
    } catch (error) {
      console.error('Login error:', error);
      return c.json({ error: 'Failed to initiate login' }, 500);
    }
  });

  /**
   * GET /auth/callback
   * Handles OIDC callback with authorization code.
   */
  app.get('/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const errorDescription = c.req.query('error_description');

    // Handle OIDC errors
    if (error) {
      auditLogger.logAuthEvent({
        action: 'login',
        success: false,
        reason: errorDescription || error,
      });
      return c.json({ error, error_description: errorDescription }, 400);
    }

    // Validate required parameters
    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    if (!state) {
      return c.json({ error: 'Missing state parameter' }, 400);
    }

    try {
      const result = await authService.exchangeCode(code, state);

      // Set refresh token in HTTP-only cookie
      setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      // Redirect to the original destination with access token
      const redirectUrl = new URL(result.redirectUri, c.req.url);
      redirectUrl.searchParams.set('access_token', result.accessToken);

      return c.redirect(redirectUrl.toString(), 302);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid state parameter') {
          auditLogger.logAuthEvent({
            action: 'login',
            success: false,
            reason: 'Invalid state parameter - possible CSRF attack',
          });
          return c.json({ error: 'Invalid state parameter' }, 400);
        }
      }

      console.error('Callback error:', error);
      auditLogger.logAuthEvent({
        action: 'login',
        success: false,
        reason: 'Token exchange failed',
      });
      return c.json({ error: 'Authentication failed' }, 500);
    }
  });

  /**
   * POST /auth/logout
   * Logs out the user and clears session.
   */
  app.post('/logout', requireAuth(), async (c) => {
    const user = getAuthUser(c);

    if (user) {
      await authService.logout(user.id);
    }

    // Clear refresh token cookie
    deleteCookie(c, REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);

    return c.json({ success: true }, 200);
  });

  /**
   * GET /auth/me
   * Returns the current authenticated user.
   */
  app.get('/me', requireAuth(), async (c) => {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const user = await authService.getUser(authUser.id);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    });
  });

  /**
   * POST /auth/refresh
   * Refreshes the access token using the refresh token cookie.
   */
  app.post('/refresh', async (c) => {
    const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);

    if (!refreshToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const result = await authService.refreshAccessToken(refreshToken);

      // Update refresh token cookie with new token
      setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return c.json({
        accessToken: result.accessToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Refresh token expired') {
        // Clear the expired refresh token
        deleteCookie(c, REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
        return c.json({ error: 'Refresh token expired' }, 401);
      }

      console.error('Refresh error:', error);
      return c.json({ error: 'Invalid refresh token' }, 401);
    }
  });

  return app;
}

// Export for backwards compatibility
export const authRoutes = new Hono();
// Note: authRoutes needs db injection - use createAuthRoutes(db) in main app
