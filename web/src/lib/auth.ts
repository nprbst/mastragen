/**
 * Auth state management for landing page.
 *
 * Handles token storage, user context, and authentication state.
 */

const API_BASE = '/api';
const TOKEN_STORAGE_KEY = 'mastragen_access_token';
const USER_STORAGE_KEY = 'mastragen_user';
const AUTH_COOKIE_NAME = 'mastragen_authenticated';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  githubId: number;
  githubLogin: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
}

/**
 * Get the current access token from storage.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Set a cookie for SSR authentication checks.
 */
function setAuthCookie(): void {
  if (typeof document === 'undefined') return;
  // Set cookie that expires in 7 days (matches refresh token)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; expires=${expires}; SameSite=Lax`;
}

/**
 * Clear the auth cookie.
 */
function clearAuthCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Set the access token in storage.
 */
export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  setAuthCookie();
}

/**
 * Clear the access token from storage.
 */
export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  clearAuthCookie();
}

/**
 * Get the cached user from storage.
 */
export function getCachedUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const cached = localStorage.getItem(USER_STORAGE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Set the cached user in storage.
 */
export function setCachedUser(user: AuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/**
 * Clear the cached user from storage.
 */
export function clearCachedUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Get the current auth state.
 */
export function getAuthState(): AuthState {
  const accessToken = getAccessToken();
  const user = getCachedUser();
  return {
    isAuthenticated: !!accessToken,
    user,
    accessToken,
  };
}

/**
 * Fetch the current user from the API.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAccessToken();
        clearCachedUser();
        return null;
      }
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    const user = (await response.json()) as AuthUser;
    setCachedUser(user);
    return user;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

/**
 * Refresh the access token using the refresh token cookie.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAccessToken();
        clearCachedUser();
        return null;
      }
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const data = (await response.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Login by redirecting to the auth login endpoint.
 */
export function login(redirectUri?: string): void {
  if (typeof window === 'undefined') return;

  const loginUrl = new URL(`${API_BASE}/auth/login`);
  // Use the callback page as redirect, storing the final destination
  const callbackUrl = new URL('/auth/callback', window.location.origin);
  if (redirectUri) {
    callbackUrl.searchParams.set('redirect', redirectUri);
  }
  loginUrl.searchParams.set('redirect_uri', callbackUrl.toString());

  window.location.href = loginUrl.toString();
}

/**
 * Logout the current user.
 */
export async function logout(): Promise<void> {
  const accessToken = getAccessToken();

  if (accessToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  clearAccessToken();
  clearCachedUser();

  if (typeof window !== 'undefined') {
    window.location.href = '/auth/login';
  }
}

/**
 * Check if the user is authenticated, optionally refreshing the token.
 */
export async function checkAuth(options?: { refresh?: boolean }): Promise<AuthState> {
  let accessToken = getAccessToken();

  // Try to refresh if no token or refresh requested
  if (!accessToken || options?.refresh) {
    accessToken = await refreshAccessToken();
  }

  if (!accessToken) {
    return { isAuthenticated: false, user: null, accessToken: null };
  }

  // Fetch user if not cached
  let user = getCachedUser();
  if (!user) {
    user = await fetchCurrentUser();
  }

  return {
    isAuthenticated: !!accessToken,
    user,
    accessToken,
  };
}

/**
 * Create authorization headers for API requests.
 */
export function createAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
