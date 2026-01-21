import { useState } from 'react';
import type { Session } from '../lib/orpc-client';
import { SessionCard, type ServiceUrls } from './SessionCard';

export interface SharedWithMeSectionProps {
  sessions: Session[];
  onSessionClick?: (sessionId: string) => void;
  onRefresh?: () => void;
}

interface GroupedSessions {
  projectId: string;
  projectName: string;
  ownerName: string | null;
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
        ownerName: session.user?.name || session.user?.email || null,
        sessions: [],
      });
    }

    groups.get(projectId)!.sessions.push(session);
  }

  // Sort groups by most recent activity
  return Array.from(groups.values()).sort((a, b) => {
    const aLatest = Math.max(
      ...a.sessions.map((s) => new Date(s.lastActivityAt || s.updatedAt).getTime())
    );
    const bLatest = Math.max(
      ...b.sessions.map((s) => new Date(s.lastActivityAt || s.updatedAt).getTime())
    );
    return bLatest - aLatest;
  });
}

function generateServiceUrls(sessionId: string): ServiceUrls {
  const baseHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return {
    mastra: `http://${sessionId}.${baseHost}:4111`,
    astro: `http://${sessionId}.${baseHost}:4321`,
    vscode: `http://${sessionId}.${baseHost}:8080`,
  };
}

/**
 * SharedWithMeSection - Display sessions shared with the current user.
 *
 * Features:
 * - Collapsible section with count badge
 * - Group sessions by project
 * - Show "Shared by: [owner]" badge
 * - Click to navigate to session
 */
export function SharedWithMeSection({
  sessions,
  onRefresh,
}: SharedWithMeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (sessions.length === 0) {
    return null;
  }

  const groupedSessions = groupSessionsByProject(sessions);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-dark-text-primary hover:text-gray-700 dark:hover:text-dark-text-secondary transition-colors"
      >
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Shared with me</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
          {sessions.length}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-6 pl-6">
          {groupedSessions.map((group) => (
            <div key={group.projectId} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary flex items-center gap-2">
                  <span className="text-gray-400 dark:text-dark-text-muted">◉</span>
                  {group.projectName}
                </h3>
                {group.ownerName && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-500 dark:text-dark-text-muted bg-gray-100 dark:bg-dark-bg-tertiary">
                    Shared by: {group.ownerName}
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    urls={session.state === 'active' ? generateServiceUrls(session.id) : undefined}
                    onResumed={onRefresh}
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

export default SharedWithMeSection;
