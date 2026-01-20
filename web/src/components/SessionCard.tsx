import type { Session } from '../lib/orpc-client';

export interface ServiceUrls {
  mastra: string;
  astro: string | null;
  vscode: string;
}

export interface SessionCardProps {
  session: Session;
  urls?: ServiceUrls;
}

const STATUS_STYLES: Record<Session['state'], { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  suspended: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Suspended' },
  pr_open: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'PR Open' },
  merged: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Merged' },
  archived: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Archived' },
  closed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Closed' },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function SessionCard({ session, urls }: SessionCardProps) {
  const status = STATUS_STYLES[session.state];
  const isActive = session.state === 'active';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {session.artifactName || session.id.slice(0, 8)}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}
            >
              {status.label}
            </span>
          </div>

          {session.branchName && (
            <p className="mt-1 text-xs text-gray-500 font-mono truncate">
              {session.branchName}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-400">
            {formatRelativeTime(session.lastActivityAt || session.updatedAt)}
            {session.commitCount && session.commitCount > 0 && ` · ${session.commitCount} commit${session.commitCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {isActive && urls && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ServiceLink href={urls.vscode} label="VS Code" icon="code" />
          <ServiceLink href={urls.mastra} label="Mastra" icon="api" />
          {urls.astro && <ServiceLink href={urls.astro} label="Astro" icon="web" />}
        </div>
      )}

      {!isActive && session.state === 'suspended' && (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Resume session
          </button>
        </div>
      )}
    </div>
  );
}

interface ServiceLinkProps {
  href: string;
  label: string;
  icon: 'terminal' | 'api' | 'web' | 'code';
}

const ICONS: Record<ServiceLinkProps['icon'], string> = {
  terminal: '⌘',
  api: '◉',
  web: '◎',
  code: '⟨⟩',
};

function ServiceLink({ href, label, icon }: ServiceLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
    >
      <span className="text-gray-500">{ICONS[icon]}</span>
      {label}
    </a>
  );
}

export default SessionCard;
