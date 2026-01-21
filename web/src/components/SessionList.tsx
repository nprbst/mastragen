import { useState, useEffect } from 'react';
import { fetchSessions, type Session, type SessionListParams } from '../lib/orpc-client';
import { SessionCard, type ServiceUrls } from './SessionCard';

export interface SessionListProps {
  initialSessions?: Session[];
  showSharedWithMe?: boolean;
}

interface GroupedSessions {
  projectId: string;
  projectName: string;
  sessions: Session[];
}

function groupSessionsByProject(sessions: Session[]): GroupedSessions[] {
  const groups = new Map<string, GroupedSessions>();

  for (const session of sessions) {
    const projectId = session.projectId;
    const projectName = session.project?.name || projectId;

    if (!groups.has(projectId)) {
      groups.set(projectId, {
        projectId,
        projectName,
        sessions: [],
      });
    }

    groups.get(projectId)!.sessions.push(session);
  }

  // Sort groups by most recent activity
  return Array.from(groups.values()).sort((a, b) => {
    const aLatest = Math.max(...a.sessions.map((s) => new Date(s.lastActivityAt || s.updatedAt).getTime()));
    const bLatest = Math.max(...b.sessions.map((s) => new Date(s.lastActivityAt || s.updatedAt).getTime()));
    return bLatest - aLatest;
  });
}

function generateServiceUrls(sessionId: string): ServiceUrls {
  // URLs are port-based per Constitution III. Multi-Service Architecture
  const baseHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return {
    mastra: `http://${sessionId}.${baseHost}:4111`,
    astro: `http://${sessionId}.${baseHost}:4321`,
    vscode: `http://${sessionId}.${baseHost}:8080`,
  };
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="mx-auto h-12 w-12 text-gray-400 dark:text-dark-text-muted">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">No sessions yet</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
        Get started by creating your first development session.
      </p>
      <div className="mt-6">
        <a
          href="/sessions/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Create your first session
        </a>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4 animate-pulse"
        >
          <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/4 mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto h-12 w-12 text-red-400 dark:text-red-500">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">Failed to load sessions</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">{message}</p>
      <div className="mt-6">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function SessionList({
  initialSessions,
  showSharedWithMe = true,
}: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions || []);
  const [sharedSessions, setSharedSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(!initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<Session['state'] | 'all'>('all');

  const loadSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params: SessionListParams = {};
      if (activeFilter !== 'all') {
        params.state = activeFilter;
      }

      const [mySessions, shared] = await Promise.all([
        fetchSessions(params),
        showSharedWithMe ? fetchSessions({ ...params, sharedWithMe: true }) : Promise.resolve([]),
      ]);

      setSessions(mySessions);
      setSharedSessions(shared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialSessions) {
      loadSessions();
    }
  }, [activeFilter]);

  const groupedSessions = groupSessionsByProject(sessions);
  const groupedSharedSessions = groupSessionsByProject(sharedSessions);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadSessions} />;
  }

  if (sessions.length === 0 && sharedSessions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      {/* Filter tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex space-x-8" aria-label="Session filters">
          {(['all', 'active', 'suspended', 'pr_open'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={`
                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium
                ${
                  activeFilter === filter
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-dark-text-secondary hover:border-gray-300 dark:hover:border-dark-border hover:text-gray-700 dark:hover:text-dark-text-primary'
                }
              `}
            >
              {filter === 'all' ? 'All' : filter === 'pr_open' ? 'PR Open' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* My Sessions */}
      {groupedSessions.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">My Sessions</h2>
          {groupedSessions.map((group) => (
            <div key={group.projectId} className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary flex items-center gap-2">
                <span className="text-gray-400 dark:text-dark-text-muted">◉</span>
                {group.projectName}
                <span className="text-xs text-gray-400 dark:text-dark-text-muted">({group.sessions.length})</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    urls={session.state === 'active' ? generateServiceUrls(session.id) : undefined}
                    onResumed={loadSessions}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shared with me */}
      {showSharedWithMe && groupedSharedSessions.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
            Shared with me
            <span className="text-xs text-gray-400 dark:text-dark-text-muted font-normal">
              ({sharedSessions.length} session{sharedSessions.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {groupedSharedSessions.map((group) => (
            <div key={group.projectId} className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary flex items-center gap-2">
                <span className="text-gray-400 dark:text-dark-text-muted">◉</span>
                {group.projectName}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    urls={session.state === 'active' ? generateServiceUrls(session.id) : undefined}
                    onResumed={loadSessions}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SessionList;
