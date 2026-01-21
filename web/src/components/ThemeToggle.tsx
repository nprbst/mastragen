import { useState, useEffect } from 'react';
import {
  setStoredTheme,
  getEffectiveTheme,
  applyTheme,
  listenToSystemPreference,
  type Theme,
} from '../lib/theme';

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(getEffectiveTheme() === 'dark');

    const cleanup = listenToSystemPreference((theme) => {
      setIsDark(theme === 'dark');
      applyTheme(theme);
    });

    return cleanup;
  }, []);

  const handleToggle = () => {
    const effective = getEffectiveTheme();
    const newTheme: Theme = effective === 'dark' ? 'light' : 'dark';
    setStoredTheme(newTheme);
    setIsDark(newTheme === 'dark');
    applyTheme(newTheme);
  };

  if (!mounted) {
    return (
      <button
        className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary"
        aria-label="Toggle theme"
      >
        <div className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
    </button>
  );
}

export default ThemeToggle;
