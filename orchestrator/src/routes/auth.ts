import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AuthService } from '../services/auth.ts';
import { requireAuth, getAuthUser } from '../middleware/auth.ts';
import { getAuditLogger } from '../services/audit-logger.ts';
import { getPublicKey } from '../lib/crypto.ts';
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
   * Also handles post-installation redirects from GitHub App installation.
   */
  app.get('/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const errorDescription = c.req.query('error_description');
    const setupAction = c.req.query('setup_action');

    // Handle GitHub App installation callback (no state parameter)
    // When a user installs the app from GitHub, they're redirected here with setup_action=install
    // but no state since they didn't go through our OAuth initiation flow.
    // Redirect them to start a proper login flow.
    if (setupAction === 'install' && !state) {
      return c.redirect('/api/auth/login', 302);
    }

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
      avatarUrl: user.avatar_url,
      githubId: user.github_id,
      githubLogin: user.github_login,
      encryptionPublicKey: getPublicKey(),
    });
  });

  /**
   * GET /auth/installations
   * Lists GitHub App installations accessible to the current user.
   */
  app.get('/installations', requireAuth(), async (c) => {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const result = await authService.getUserInstallations(authUser.id);

    if (result.error) {
      return c.json(
        {
          installations: [],
          error: result.error,
        },
        200
      );
    }

    return c.json({
      installations: result.installations.map((inst) => ({
        id: inst.id,
        installationId: inst.id,
        accountType: inst.account.type,
        accountLogin: inst.account.login,
        accountId: inst.account.id,
        repositorySelection: inst.repository_selection,
        permissions: inst.permissions,
      })),
    });
  });

  /**
   * GET /auth/installations/:installationId/repos
   * Lists repositories for a specific GitHub App installation.
   */
  app.get('/installations/:installationId/repos', requireAuth(), async (c) => {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const installationId = parseInt(c.req.param('installationId'), 10);
    if (isNaN(installationId)) {
      return c.json({ error: 'Invalid installation ID' }, 400);
    }

    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = Math.min(parseInt(c.req.query('per_page') || '30', 10), 100);

    const result = await authService.getInstallationRepositories(
      authUser.id,
      installationId,
      page,
      perPage
    );

    if (result.error) {
      if (result.error === 'Access denied to installation') {
        return c.json(
          {
            error: 'Forbidden',
            code: 'AUTH_INSTALLATION_ACCESS_DENIED',
            message: 'You do not have access to this installation',
          },
          403
        );
      }
      return c.json({ error: result.error }, 500);
    }

    return c.json({
      repositories: result.repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        permissions: repo.permissions,
      })),
      totalCount: result.totalCount,
      page,
      perPage,
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
