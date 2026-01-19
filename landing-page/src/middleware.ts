/**
 * Astro middleware for protected routes.
 *
 * Handles authentication checks and redirects unauthenticated users to login.
 */
import { defineMiddleware } from 'astro:middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/auth/login', '/auth/callback', '/api/health'];

// Routes that start with these prefixes are public
const PUBLIC_PREFIXES = ['/api/', '/docs/', '/_'];

/**
 * Check if a route is public (doesn't require authentication).
 */
function isPublicRoute(pathname: string): boolean {
  // Check exact matches
  if (PUBLIC_ROUTES.includes(pathname)) {
    return true;
  }

  // Check prefix matches
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return next();
  }

  // For SSR pages, we need to check authentication server-side
  // Check for access_token in cookies (set by client-side after OAuth callback)
  // Note: The actual token is stored in localStorage on the client,
  // so we use a lightweight cookie flag for SSR auth checks
  const authCookie = context.cookies.get('mastragen_authenticated');

  // If not authenticated, redirect to login
  if (!authCookie?.value) {
    // Store the original URL for redirect after login
    const loginUrl = new URL('/auth/login', context.url.origin);
    loginUrl.searchParams.set('redirect', pathname);
    return context.redirect(loginUrl.toString());
  }

  // Continue with the request
  return next();
});
