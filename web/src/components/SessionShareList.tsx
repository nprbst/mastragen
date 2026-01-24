import { useState, useEffect, useCallback } from 'react';
import { createAuthHeaders } from '../lib/auth';

const API_BASE = '/api';

export interface SessionShare {
  id: string;
  sessionId: string;
  sharedByUserId: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  sharedWithName: string | null;
  grantedAt: string;
}

export interface SessionShareListProps {
  sessionId: string;
  isOwner: boolean;
  onShareRevoked?: () => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-2 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-gray-200 dark:bg-dark-bg-tertiary rounded-full" />
            <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-32" />
          </div>
          <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-sm text-gray-500 dark:text-dark-text-secondary py-2">
      No one else has access to this session.
    </p>
  );
}

/**
 * SessionShareList - Display and manage shares for a session.
 *
 * Shows:
 * - List of users with access (email, name, granted date)
 * - Revoke button for each share (owner only)
 * - Confirmation before revoking
 */
export function SessionShareList({
  sessionId,
  isOwner,
  onShareRevoked,
}: SessionShareListProps) {
  const [shares, setShares] = useState<SessionShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/shares`, {
        headers: createAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch shares: ${res.statusText}`);
      }

      const data = await res.json();
      setShares(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  async function handleRevoke(shareId: string) {
    setRevokingId(shareId);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/shares/${shareId}`, {
        method: 'DELETE',
        headers: createAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke share');
      }

      // Remove from local state
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      setConfirmRevokeId(null);
      onShareRevoked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke share');
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error && shares.length === 0) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 py-2">
        {error}
        <button
          type="button"
          onClick={fetchShares}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (shares.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {shares.map((share) => (
        <div
          key={share.id}
          className="flex items-center justify-between p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded-md"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 h-6 w-6 bg-gray-300 dark:bg-dark-border rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
                {(share.sharedWithName || share.sharedWithEmail).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                {share.sharedWithName || share.sharedWithEmail}
              </p>
              {share.sharedWithName && (
                <p className="text-xs text-gray-500 dark:text-dark-text-muted truncate">
                  {share.sharedWithEmail}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400 dark:text-dark-text-muted">
              {formatRelativeTime(share.grantedAt)}
            </span>

            {isOwner && (
              <>
                {confirmRevokeId === share.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      disabled={revokingId === share.id}
                      className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded disabled:opacity-50"
                    >
                      {revokingId === share.id ? 'Revoking...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(null)}
                      disabled={revokingId === share.id}
                      className="px-2 py-1 text-xs text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-secondary rounded"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(share.id)}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-dark-text-secondary hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-bg-secondary rounded transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SessionShareList;
