import { useState, useEffect } from 'react';
import { createAuthHeaders, getCachedUser } from '../lib/auth';
import type { Session } from '../lib/orpc-client';
import { SessionShareList } from './SessionShareList';
import { ShareSessionModal } from './ShareSessionModal';
import { IdleWarningBanner } from './IdleWarningBanner';

const API_BASE = '/api';

export interface SessionDetailProps {
  sessionId: string;
}

interface IdleStatus {
  sessionId: string;
  state: string;
  idleTimeoutMinutes: number;
  warningMinutes: number;
  idleSinceMinutes: number;
  warningIssued: boolean;
  suspendAt: string | null;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function StateLabel({ state }: { state: Session['state'] }) {
  const colors: Record<Session['state'], string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    pr_open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    merged: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    closed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  const labels: Record<Session['state'], string> = {
    active: 'Active',
    suspended: 'Suspended',
    pr_open: 'PR Open',
    merged: 'Merged',
    archived: 'Archived',
    closed: 'Closed',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[state]}`}>
      {labels[state]}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/3" />
      <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/2" />
      <div className="h-32 bg-gray-200 dark:bg-dark-bg-tertiary rounded" />
    </div>
  );
}

/**
 * SessionDetail - Display full session information with sharing controls.
 *
 * Features:
 * - Session metadata (branch, environment, activity)
 * - Idle warning banner (if applicable)
 * - Share button (owner only)
 * - SessionShareList (shows current shares)
 * - Links to services (VS Code, Mastra, Astro)
 */
export function SessionDetail({ sessionId }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [idleStatus, setIdleStatus] = useState<IdleStatus | null>(null);
  const [keepingWorking, setKeepingWorking] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);

  const currentUser = getCachedUser();
  const isOwner = currentUser?.id === session?.userId;
  const isActive = session?.state === 'active';

  async function fetchSession() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        headers: createAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Session not found');
        }
        throw new Error(`Failed to fetch session: ${res.statusText}`);
      }

      const data = await res.json();
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Poll idle status for active sessions
  useEffect(() => {
    if (!isActive) {
      setIdleStatus(null);
      return;
    }

    const checkIdleStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/idle-status`, {
          headers: createAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setIdleStatus(data);
        }
      } catch {
        // Silently ignore errors
      }
    };

    checkIdleStatus();
    const interval = setInterval(checkIdleStatus, 30000);
    return () => clearInterval(interval);
  }, [isActive, sessionId]);

  // T016: For shared users (non-owners), poll to detect access revocation
  useEffect(() => {
    if (!session || isOwner) {
      return;
    }

    const checkAccess = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
          headers: createAuthHeaders(),
        });
        if (res.status === 403) {
          setAccessRevoked(true);
        }
      } catch {
        // Silently ignore network errors
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkAccess, 30000);
    return () => clearInterval(interval);
  }, [session, isOwner, sessionId]);

  async function handleKeepWorking() {
    setKeepingWorking(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({ activityType: 'keyboard' }),
      });
      if (res.ok) {
        setIdleStatus(null);
      }
    } catch {
      // Silently ignore
    } finally {
      setKeepingWorking(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  // T016: Show access revoked message for shared users
  if (accessRevoked) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-yellow-500 dark:text-yellow-400">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
          Access Revoked
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
          Your access to this session has been revoked by the owner.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-red-400">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
          {error || 'Session not found'}
        </h3>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const baseHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const serviceUrls = {
    vscode: `http://${sessionId}.${baseHost}:8080`,
    mastra: `http://${sessionId}.${baseHost}:4111`,
    astro: `http://${sessionId}.${baseHost}:4321`,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {session.artifactName}
            </h1>
            <StateLabel state={session.state} />
          </div>
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
            {session.project?.name || session.projectId} · {session.branchName} · {session.environment}
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-text-muted mt-1">
            Last activity {formatRelativeTime(session.lastActivityAt || session.updatedAt)}
          </p>
        </div>

        {isOwner && isActive && (
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary transition-colors"
          >
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        )}
      </div>

      {/* Idle Warning */}
      {isActive && idleStatus?.warningIssued && idleStatus.suspendAt && (
        <IdleWarningBanner
          sessionId={sessionId}
          idleSinceMinutes={idleStatus.idleSinceMinutes}
          idleTimeoutMinutes={idleStatus.idleTimeoutMinutes}
          suspendAt={idleStatus.suspendAt}
          onKeepWorking={handleKeepWorking}
          keepingWorking={keepingWorking}
        />
      )}

      {/* Service Links */}
      {isActive && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
          <h2 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-3">
            Services
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href={serviceUrls.vscode}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-border rounded-md transition-colors"
            >
              <span className="mr-2">💻</span>
              VS Code
            </a>
            <a
              href={serviceUrls.mastra}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-border rounded-md transition-colors"
            >
              <span className="mr-2">🤖</span>
              Mastra
            </a>
            <a
              href={serviceUrls.astro}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-border rounded-md transition-colors"
            >
              <span className="mr-2">🚀</span>
              Astro
            </a>
          </div>
        </div>
      )}

      {/* Sharing Section */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
        <h2 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-3">
          Shared Access
        </h2>
        <SessionShareList
          sessionId={sessionId}
          isOwner={isOwner}
          onShareRevoked={fetchSession}
        />
      </div>

      {/* Session Info */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
        <h2 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-3">
          Details
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-dark-text-muted">Session ID</dt>
            <dd className="font-mono text-gray-900 dark:text-dark-text-primary truncate">{session.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-dark-text-muted">Created</dt>
            <dd className="text-gray-900 dark:text-dark-text-primary">{formatRelativeTime(session.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-dark-text-muted">Branch</dt>
            <dd className="text-gray-900 dark:text-dark-text-primary">{session.branchName}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-dark-text-muted">Environment</dt>
            <dd className="text-gray-900 dark:text-dark-text-primary">{session.environment}</dd>
          </div>
          {session.suspensionReason && (
            <div className="col-span-2">
              <dt className="text-gray-500 dark:text-dark-text-muted">Suspension Reason</dt>
              <dd className="text-gray-900 dark:text-dark-text-primary">{session.suspensionReason}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Share Modal */}
      <ShareSessionModal
        sessionId={sessionId}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShared={() => {
          setShowShareModal(false);
          // Trigger a re-render of the share list
        }}
      />
    </div>
  );
}

export default SessionDetail;
