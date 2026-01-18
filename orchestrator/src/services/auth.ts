/**
 * Authentication service using better-auth for OIDC/SSO.
 *
 * This service handles:
 * - OIDC login flow initiation
 * - Token exchange from authorization code
 * - JWT generation and refresh
 * - Session management
 */

import type { Kysely } from 'kysely';
import type { Database, AuthProvider } from '../db/types.ts';
import { UsersRepository } from '../repositories/users.ts';
import { getAuditLogger } from './audit-logger.ts';

// JWT secret - should be configured via environment
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_EXPIRY_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY_SECONDS = 604800; // 7 days

// OIDC configuration from environment
const OIDC_CONFIG = {
  clientId: process.env.OIDC_CLIENT_ID || '',
  clientSecret: process.env.OIDC_CLIENT_SECRET || '',
  issuer: process.env.OIDC_ISSUER || '',
  redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:4000/auth/callback',
};

/**
 * OIDC provider configuration.
 */
export interface OIDCProviderConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  redirectUri: string;
}

/**
 * OIDC user info from provider.
 */
export interface OIDCUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
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
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Base64url encode a string.
 */
function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create a simple JWT token.
 * In production, use a proper JWT library with signature verification.
 */
function createJwt(payload: Record<string, unknown>, secret: string, expirySeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expirySeconds,
  };

  const headerBase64 = base64urlEncode(JSON.stringify(header));
  const payloadBase64 = base64urlEncode(JSON.stringify(fullPayload));

  // Simple signature (in production, use proper HMAC-SHA256)
  const signature = base64urlEncode(`${headerBase64}.${payloadBase64}.${secret}`);

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * Authentication service.
 */
export class AuthService {
  private usersRepo: UsersRepository;
  private auditLogger = getAuditLogger();

  constructor(private db: Kysely<Database>) {
    this.usersRepo = new UsersRepository(db);
  }

  /**
   * Generate login URL for OIDC provider.
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

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: OIDC_CONFIG.clientId,
      redirect_uri: OIDC_CONFIG.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
    });

    // Default to generic OIDC endpoint (configure based on issuer)
    const authEndpoint = `${OIDC_CONFIG.issuer}/authorize`;
    return `${authEndpoint}?${params.toString()}`;
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
   * Exchange authorization code for tokens.
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
    };
    redirectUri: string;
  }> {
    // Validate state
    const storedState = this.validateState(state);
    if (!storedState) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for tokens (mock implementation)
    // In production, call the OIDC token endpoint
    const tokenResponse = await this.fetchTokens(code);

    // Get user info from OIDC provider
    const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

    // Find or create user in database
    const user = await this.usersRepo.findOrCreate({
      email: userInfo.email,
      name: userInfo.name || null,
      avatar_url: userInfo.picture || null,
      provider: this.getProviderFromIssuer(OIDC_CONFIG.issuer),
      provider_id: userInfo.sub,
    });

    // Generate our own JWT tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);

    // Log successful login
    this.auditLogger.logAuthEvent({
      action: 'login',
      userId: user.id,
      email: user.email,
      provider: user.provider,
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
      },
      redirectUri: storedState.redirectUri,
    };
  }

  /**
   * Fetch tokens from OIDC provider.
   * Mock implementation - replace with actual HTTP call.
   */
  private async fetchTokens(code: string): Promise<{ access_token: string; id_token: string }> {
    // In production, make actual HTTP request to token endpoint
    // For now, return mock tokens for development
    if (!OIDC_CONFIG.clientId) {
      // Development mode - return mock token
      return {
        access_token: `mock_access_token_${code}`,
        id_token: `mock_id_token_${code}`,
      };
    }

    const tokenEndpoint = `${OIDC_CONFIG.issuer}/token`;
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: OIDC_CONFIG.clientId,
        client_secret: OIDC_CONFIG.clientSecret,
        redirect_uri: OIDC_CONFIG.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange authorization code');
    }

    return response.json();
  }

  /**
   * Fetch user info from OIDC provider.
   * Mock implementation - replace with actual HTTP call.
   */
  private async fetchUserInfo(accessToken: string): Promise<OIDCUserInfo> {
    // In production, make actual HTTP request to userinfo endpoint
    if (!OIDC_CONFIG.clientId) {
      // Development mode - return mock user
      return {
        sub: 'mock-user-123',
        email: 'dev@example.com',
        name: 'Development User',
        picture: undefined,
      };
    }

    const userinfoEndpoint = `${OIDC_CONFIG.issuer}/userinfo`;
    const response = await fetch(userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  /**
   * Determine provider from OIDC issuer URL.
   */
  private getProviderFromIssuer(issuer: string): AuthProvider {
    if (issuer.includes('google')) return 'google';
    if (issuer.includes('github')) return 'github';
    if (issuer.includes('azure') || issuer.includes('microsoft')) return 'azure';
    return 'custom';
  }

  /**
   * Generate access token JWT.
   */
  generateAccessToken(user: { id: string; email: string; name: string | null }): string {
    return createJwt(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      JWT_EXPIRY_SECONDS
    );
  }

  /**
   * Generate refresh token.
   */
  generateRefreshToken(userId: string): string {
    return createJwt(
      {
        sub: userId,
        type: 'refresh',
      },
      JWT_SECRET,
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
    // Decode and validate refresh token
    const parts = refreshToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid refresh token');
    }

    try {
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);

      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new Error('Refresh token expired');
      }

      // Check token type
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get user from database
      const user = await this.usersRepo.findById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user.id);

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
      if (error instanceof Error && error.message === 'Refresh token expired') {
        throw error;
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
  async getUser(
    userId: string
  ): Promise<{ id: string; email: string; name: string | null; avatar_url: string | null } | null> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    };
  }
}
