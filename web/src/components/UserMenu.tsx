import { useEffect, useState } from 'react';
import { getAuthState, logout, type AuthUser } from '../lib/auth';

export default function UserMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const state = getAuthState();
    setUser(state.user);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  if (!user) {
    return (
      <a
        href="/auth/login"
        className="text-sm text-gray-600 hover:text-gray-900 dark:text-dark-text-secondary dark:hover:text-dark-text-primary"
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text-primary hover:text-gray-900 dark:hover:text-white"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name || user.githubLogin}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
            {(user.name || user.githubLogin).charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden sm:inline">{user.name || user.githubLogin}</span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close menu */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-48 rounded-md bg-white dark:bg-dark-bg-secondary shadow-lg ring-1 ring-black ring-opacity-5 z-20">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border">
              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                {user.name || user.githubLogin}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted truncate">{user.email}</p>
            </div>
            <div className="py-1">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary disabled:opacity-50"
              >
                {isLoggingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
