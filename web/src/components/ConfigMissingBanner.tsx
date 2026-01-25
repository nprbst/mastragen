import { useState, useEffect } from 'react';

export interface ConfigMissingBannerProps {
  projectId: string;
  onConfigure: () => void;
}

/**
 * ConfigMissingBanner - Display banner when .mastragen/config.toml is missing.
 *
 * Shows:
 * - Blue info banner with settings icon
 * - Message about missing config
 * - "Configure" button to open modal
 * - "Dismiss" button that stores preference in localStorage
 */
export function ConfigMissingBanner({
  projectId,
  onConfigure,
}: ConfigMissingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage for dismissed state on mount
  useEffect(() => {
    const dismissKey = `mastragen-config-dismissed-${projectId}`;
    const wasDismissed = localStorage.getItem(dismissKey) === 'true';
    setDismissed(wasDismissed);
  }, [projectId]);

  const handleDismiss = () => {
    const dismissKey = `mastragen-config-dismissed-${projectId}`;
    localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-blue-500 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Enable Phoenix observability?
          </p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
            No <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">.mastragen/config.toml</code> found.
            Configure to enable AI trace collection and experiment tracking.
          </p>
        </div>
        <div className="flex-shrink-0 flex gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onConfigure}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-md transition-colors"
          >
            Configure
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfigMissingBanner;
