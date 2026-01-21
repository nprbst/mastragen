const THEME_KEY = 'mastragen_theme';

export type Theme = 'light' | 'dark' | 'system';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(THEME_KEY) as Theme) || 'system';
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_KEY, theme);
}

export function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getEffectiveTheme(): 'light' | 'dark' {
  const stored = getStoredTheme();
  return stored === 'system' ? getSystemPreference() : stored;
}

export function applyTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initializeTheme(): void {
  const theme = getEffectiveTheme();
  applyTheme(theme);
}

export function listenToSystemPreference(callback: (theme: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (getStoredTheme() === 'system') {
      callback(e.matches ? 'dark' : 'light');
    }
  };

  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}
