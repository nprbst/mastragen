/**
 * Authentication service for GitHub App OAuth.
 *
 * This service handles:
 * - GitHub App OAuth login flow
 * - Token exchange from authorization code
 * - JWT generation and refresh
 * - User installation queries
 */

import * as jose from 'jose';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';
import { UsersRepository } from '../repositories/users.ts';
import { getAuditLogger } from './audit-logger.ts';

// JWT secret - should be configured via environment
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_EXPIRY_SECONDS = 86400; // 24 hours
const REFRESH_TOKEN_EXPIRY_SECONDS = 604800; // 7 days

// Convert secret string to Uint8Array for jose
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET);

// GitHub App OAuth configuration from environment
const GITHUB_CONFIG = {
  clientId: process.env.GITHUB_APP_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || '',
  redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:4000/api/auth/callback',
};

// GitHub API base URLs
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

/**
 * GitHub user info from API.
 */
export interface GitHubUserInfo {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

/**
 * GitHub installation from API.
 */
export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    type: string;
  };
  repository_selection: string;
  permissions: Record<string, string>;
}

/**
 * Auth state for CSRF protection.
 */
interface AuthState {
  redirectUri: string;
  nonce: string;
  createdAt: number;
}

// In-memory state store (should use Redis in production)
const stateStore = new Map<string, AuthState>();

/**
 * Generate a random string for state/nonce.
 */
function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i]! % chars.length];
  }
  return result;
}

/**
 * Create a JWT token using jose with proper HMAC-SHA256 signing.
 */
async function createJwt(
  payload: Record<string, unknown>,
  expirySeconds: number
): Promise<string> {
  const jwt = await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(getSecretKey());

  return jwt;
}

/**
 * Verify and decode a JWT token using jose.
 * Returns the payload if valid, throws if invalid.
 * Exported for use in auth middleware.
 */
export async function verifyJwt(token: string): Promise<jose.JWTPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey(), {
    algorithms: ['HS256'],
  });
  return payload;
}

/**
 * Re-export jose errors for use in middleware.
 */
export const JWTExpired = jose.errors.JWTExpired;

/**
 * Authentication service for GitHub App OAuth.
 */
export class AuthService {
  private usersRepo: UsersRepository;
  private auditLogger = getAuditLogger();

  constructor(db: Kysely<Database>) {
    this.usersRepo = new UsersRepository(db);
  }

  /**
   * Generate GitHub OAuth authorization URL.
   */
  async getLoginUrl(redirectUri?: string): Promise<string> {
    const state = generateRandomString();
    const nonce = generateRandomString();

    // Store state for CSRF protection
    stateStore.set(state, {
      redirectUri: redirectUri || '/',
      nonce,
      createdAt: Date.now(),
    });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 600000;
    for (const [key, value] of stateStore) {
      if (value.createdAt < tenMinutesAgo) {
        stateStore.delete(key);
      }
    }

    // Build GitHub OAuth authorization URL
    const params = new URLSearchParams({
      client_id: GITHUB_CONFIG.clientId,
      redirect_uri: GITHUB_CONFIG.redirectUri,
      scope: 'read:user user:email',
      state,
    });

    return `${GITHUB_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Validate state parameter from callback.
   */
  validateState(state: string): AuthState | null {
    const stored = stateStore.get(state);
    if (!stored) {
      return null;
    }

    // Delete used state
    stateStore.delete(state);

    // Check expiry (10 minutes)
    if (Date.now() - stored.createdAt > 600000) {
      return null;
    }

    return stored;
  }

  /**
   * Exchange authorization code for tokens and create/update user.
   */
  async exchangeCode(
    code: string,
    state: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
      github_id: number;
      github_login: string;
    };
    redirectUri: string;
  }> {
    // Validate state
    const storedState = this.validateState(state);
    if (!storedState) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for GitHub access token
    const githubAccessToken = await this.fetchGitHubToken(code);

    // Get user info from GitHub API
    const githubUser = await this.fetchGitHubUser(githubAccessToken);

    // Get user's primary email if not public
    let email = githubUser.email;
    if (!email) {
      email = await this.fetchGitHubPrimaryEmail(githubAccessToken);
    }

    if (!email) {
      throw new Error('Unable to retrieve email from GitHub');
    }

    // Find or create user in database (store GitHub access token for API calls)
    const user = await this.usersRepo.findOrCreate({
      email,
      name: githubUser.name,
      avatar_url: githubUser.avatar_url,
      github_id: githubUser.id,
      github_login: githubUser.login,
      github_access_token: githubAccessToken,
    });

    // Generate our own JWT tokens
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    // Log successful login
    this.auditLogger.logAuthEvent({
      action: 'login',
      userId: user.id,
      email: user.email,
      provider: 'github',
      success: true,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        github_id: user.github_id,
        github_login: user.github_login,
      },
      redirectUri: storedState.redirectUri,
    };
  }

  /**
   * Fetch GitHub access token from authorization code.
   */
  private async fetchGitHubToken(code: string): Promise<string> {
    // Development mode - return mock token
    if (!GITHUB_CONFIG.clientId) {
      return `mock_github_token_${code}`;
    }

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CONFIG.clientId,
        client_secret: GITHUB_CONFIG.clientSecret,
        code,
        redirect_uri: GITHUB_CONFIG.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange authorization code');
    }

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    return data.access_token as string;
  }

  /**
   * Fetch GitHub user info.
   */
  private async fetchGitHubUser(accessToken: string): Promise<GitHubUserInfo> {
    // Development mode - return mock user
    if (!GITHUB_CONFIG.clientId) {
      return {
        id: 12345678,
        login: 'dev-user',
        email: 'dev@example.com',
        name: 'Development User',
        avatar_url: null,
      };
    }

    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch GitHub user info');
    }

    return (await response.json()) as GitHubUserInfo;
  }

  /**
   * Fetch GitHub user's primary email.
   */
  private async fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
    // Development mode
    if (!GITHUB_CONFIG.clientId) {
      return 'dev@example.com';
    }

    const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const emails = (await response.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email || null;
  }

  /**
   * Get user's GitHub App installations.
   * Queries GitHub API using the user's stored access token.
   */
  async getUserInstallations(
    userId: string
  ): Promise<{ installations: GitHubInstallation[]; error?: string }> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      return { installations: [], error: 'User not found' };
    }

    if (!user.github_access_token) {
      return { installations: [], error: 'No GitHub access token stored' };
    }

    // Development mode
    if (!GITHUB_CONFIG.clientId) {
      return {
        installations: [
          {
            id: 99999,
            account: { login: 'mock-org', id: 11111, type: 'Organization' },
            repository_selection: 'all',
            permissions: { contents: 'write', metadata: 'read' },
          },
        ],
      };
    }

    try {
      const response = await fetch(`${GITHUB_API_URL}/user/installations`, {
        headers: {
          Authorization: `Bearer ${user.github_access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { installations: [], error: 'GitHub token expired or revoked' };
        }
        return { installations: [], error: 'Failed to fetch installations' };
      }

      const data = (await response.json()) as { installations?: GitHubInstallation[] };
      return { installations: data.installations || [] };
    } catch (error) {
      return {
        installations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get repositories for a specific installation.
   */
  async getInstallationRepositories(
    userId: string,
    installationId: number,
    page: number = 1,
    perPage: number = 30
  ): Promise<{
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      default_branch: string;
      permissions: { admin: boolean; push: boolean; pull: boolean };
    }>;
    totalCount: number;
    error?: string;
  }> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      return { repositories: [], totalCount: 0, error: 'User not found' };
    }

    if (!user.github_access_token) {
      return { repositories: [], totalCount: 0, error: 'No GitHub access token stored' };
    }

    // Development mode
    if (!GITHUB_CONFIG.clientId) {
      return {
        repositories: [
          {
            id: 123456,
            name: 'mock-repo',
            full_name: 'mock-org/mock-repo',
            private: true,
            default_branch: 'main',
            permissions: { admin: true, push: true, pull: true },
          },
        ],
        totalCount: 1,
      };
    }

    try {
      const response = await fetch(
        `${GITHUB_API_URL}/user/installations/${installationId}/repositories?page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Bearer ${user.github_access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          return { repositories: [], totalCount: 0, error: 'Access denied to installation' };
        }
        return { repositories: [], totalCount: 0, error: 'Failed to fetch repositories' };
      }

      const data = (await response.json()) as {
        repositories?: Array<{
          id: number;
          name: string;
          full_name: string;
          private: boolean;
          default_branch: string;
          permissions: { admin: boolean; push: boolean; pull: boolean };
        }>;
        total_count?: number;
      };
      return {
        repositories: data.repositories || [],
        totalCount: data.total_count || 0,
      };
    } catch (error) {
      return {
        repositories: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate access token JWT.
   */
  async generateAccessToken(user: {
    id: string;
    email: string;
    name: string | null;
    github_id: number;
    github_login: string;
  }): Promise<string> {
    return createJwt(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        github_id: user.github_id,
        github_login: user.github_login,
      },
      JWT_EXPIRY_SECONDS
    );
  }

  /**
   * Generate refresh token.
   */
  async generateRefreshToken(userId: string): Promise<string> {
    return createJwt(
      {
        sub: userId,
        type: 'refresh',
      },
      REFRESH_TOKEN_EXPIRY_SECONDS
    );
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Verify and decode the refresh token using jose
      const payload = await verifyJwt(refreshToken);

      // Check token type
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get user from database
      const userId = payload.sub as string;
      const user = await this.usersRepo.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const newAccessToken = await this.generateAccessToken(user);
      const newRefreshToken = await this.generateRefreshToken(user.id);

      // Log token refresh
      this.auditLogger.logAuthEvent({
        action: 'token_refresh',
        userId: user.id,
        email: user.email,
        success: true,
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new Error('Refresh token expired');
      }
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logout user (revoke refresh token).
   */
  async logout(userId: string): Promise<void> {
    const user = await this.usersRepo.findById(userId);

    this.auditLogger.logAuthEvent({
      action: 'logout',
      userId,
      email: user?.email,
      success: true,
    });

    // In production, add refresh token to a blocklist
    // For now, client-side token deletion is sufficient
  }

  /**
   * Get user by ID.
   */
  async getUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    github_id: number;
    github_login: string;
  } | null> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      github_id: user.github_id,
      github_login: user.github_login,
    };
  }

  /**
   * Generate a session-scoped JWT for sandbox-to-orchestrator API calls.
   * These tokens allow Claude (running in the sandbox) to call session endpoints.
   */
  async generateSessionToken(sessionId: string, userId: string): Promise<string> {
    return createJwt(
      {
        sub: sessionId,
        sessionId,
        userId,
        type: 'session',
      },
      REFRESH_TOKEN_EXPIRY_SECONDS // 7 days - match session lifetime
    );
  }

  /**
   * Verify a session-scoped JWT token.
   * Returns the session and user IDs if valid, null if invalid.
   */
  async verifySessionToken(
    token: string
  ): Promise<{ sessionId: string; userId: string } | null> {
    try {
      const payload = await verifyJwt(token);

      // Verify this is a session token
      if (payload.type !== 'session') {
        return null;
      }

      return {
        sessionId: payload.sessionId as string,
        userId: payload.userId as string,
      };
    } catch {
      return null;
    }
  }
}
