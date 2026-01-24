import { useState } from 'react';
import { createAuthHeaders } from '../lib/auth';

const API_BASE = '/api';

export interface ShareSessionModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onShared?: () => void;
}

interface ShareResponse {
  shareId: string;
  sharedWithEmail: string;
  sharedWithUserId: string;
  accessUrl: string;
  createdAt: string;
}

/**
 * ShareSessionModal - Modal dialog for sharing a session with another user.
 *
 * Features:
 * - Email input field
 * - Loading state while granting access
 * - Success/error feedback
 * - Closes on success or cancel
 */
export function ShareSessionModal({
  sessionId,
  isOpen,
  onClose,
  onShared,
}: ShareSessionModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ShareResponse | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to share session');
      }

      const data: ShareResponse = await res.json();
      setSuccess(data);
      onShared?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share session');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setEmail('');
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
              Share Session
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
                  Access Granted
                </h4>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
                  <span className="font-medium">{success.sharedWithEmail}</span> can now access this session.
                </p>
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
                  Enter the email address of the person you want to share this session with.
                  They must have a Mastragen account.
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div className="mb-4">
                  <label
                    htmlFor="share-email"
                    className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1"
                  >
                    Email address
                  </label>
                  <input
                    id="share-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    disabled={loading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm placeholder-gray-400 dark:placeholder-dark-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary disabled:opacity-50"
                    autoFocus
                  />
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
                    disabled={loading || !email.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Sharing...' : 'Share'}
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

export default ShareSessionModal;
