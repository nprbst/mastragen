import { useState } from 'react';

const API_BASE = '/api';

export interface ConfigScaffoldModalProps {
  sessionId: string;
  sessionToken: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ScaffoldResponse {
  success: boolean;
  commitSha?: string;
  branch?: string;
  configPath: string;
}

/**
 * ConfigScaffoldModal - Modal dialog for creating .mastragen/config.yaml.
 *
 * Features:
 * - Checkboxes for Phoenix and Astro components
 * - Loading state while creating config
 * - Success message with git push instructions
 * - Closes on success or cancel
 */
export function ConfigScaffoldModal({
  sessionId,
  sessionToken,
  isOpen,
  onClose,
  onSuccess,
}: ConfigScaffoldModalProps) {
  const [phoenixEnabled, setPhoenixEnabled] = useState(true);
  const [astroEnabled, setAstroEnabled] = useState(false);
  const [astroPath, setAstroPath] = useState('./ui');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ScaffoldResponse | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const components: Record<string, unknown> = {};

      if (phoenixEnabled) {
        components.phoenix = { enabled: true };
      }

      if (astroEnabled) {
        components.astro = { enabled: true, path: astroPath || undefined };
      }

      const res = await fetch(`${API_BASE}/sessions/${sessionId}/scaffold-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ components }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create config');
      }

      const data: ScaffoldResponse = await res.json();
      setSuccess(data);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create config');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setPhoenixEnabled(true);
    setAstroEnabled(false);
    setAstroPath('./ui');
    setError(null);
    setSuccess(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform rounded-lg bg-white dark:bg-dark-bg-secondary shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border px-4 py-3">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
              Configure Mastragen
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-dark-text-secondary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-4">
            {success ? (
              <div className="text-center py-4">
                <div className="mx-auto h-12 w-12 text-green-500 dark:text-green-400 mb-3">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                  Config Created
                </h4>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-2">
                  Created <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1 rounded">{success.configPath}</code>
                </p>
                {success.branch && (
                  <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
                    Committed to branch <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1 rounded">{success.branch}</code>
                  </p>
                )}
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-md p-3 mb-4 text-left">
                  <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                    Push to persist your config:
                  </p>
                  <code className="text-sm font-mono text-gray-800 dark:text-dark-text-primary">
                    git push
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
                  Select which components to enable in your project.
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                {/* Phoenix checkbox */}
                <div className="mb-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={phoenixEnabled}
                      onChange={(e) => setPhoenixEnabled(e.target.checked)}
                      disabled={loading}
                      className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-dark-border rounded"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        Phoenix Observability
                      </span>
                      <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                        Enable AI trace collection and experiment tracking
                      </p>
                    </div>
                  </label>
                </div>

                {/* Astro checkbox */}
                <div className="mb-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={astroEnabled}
                      onChange={(e) => setAstroEnabled(e.target.checked)}
                      disabled={loading}
                      className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-dark-border rounded"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        Astro UI Sandbox
                      </span>
                      <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                        Enable live preview for your Astro frontend
                      </p>
                    </div>
                  </label>

                  {astroEnabled && (
                    <div className="mt-2 ml-7">
                      <label
                        htmlFor="astro-path"
                        className="block text-xs font-medium text-gray-700 dark:text-dark-text-secondary mb-1"
                      >
                        Path to Astro project
                      </label>
                      <input
                        id="astro-path"
                        type="text"
                        value={astroPath}
                        onChange={(e) => setAstroPath(e.target.value)}
                        placeholder="./ui"
                        disabled={loading}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded-md shadow-sm placeholder-gray-400 dark:placeholder-dark-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-secondary rounded-md transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (!phoenixEnabled && !astroEnabled)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating...' : 'Create Config'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfigScaffoldModal;
