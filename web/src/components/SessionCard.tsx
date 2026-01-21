import { useState, useEffect } from 'react';
import type { Session } from '../lib/orpc-client';
import {
  createAuthHeaders,
  getStoredClaudeToken,
  setStoredClaudeToken,
  hasStoredClaudeToken,
} from '../lib/auth';
import { encryptToken } from '../lib/crypto';
import { IdleWarningBanner } from './IdleWarningBanner';

interface IdleStatus {
  sessionId: string;
  state: string;
  idleTimeoutMinutes: number;
  warningMinutes: number;
  idleSinceMinutes: number;
  warningIssued: boolean;
  suspendAt: string | null;
}

export interface ServiceUrls {
  mastra: string;
  astro: string | null;
  vscode: string;
}

export interface SessionCardProps {
  session: Session;
  urls?: ServiceUrls;
  onResumed?: () => void;
  onSuspended?: () => void;
}

type ServiceStatus = 'pending' | 'checking' | 'ready' | 'error';

const API_BASE = '/api';

const STATUS_STYLES: Record<Session['state'], { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', label: 'Active' },
  suspended: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', label: 'Suspended' },
  pr_open: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400', label: 'PR Open' },
  merged: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-400', label: 'Merged' },
  archived: { bg: 'bg-gray-100 dark:bg-dark-bg-tertiary', text: 'text-gray-800 dark:text-dark-text-secondary', label: 'Archived' },
  closed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', label: 'Closed' },
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

export function SessionCard({ session, urls, onResumed, onSuspended }: SessionCardProps) {
  const status = STATUS_STYLES[session.state];
  const isActive = session.state === 'active';
  const isSuspended = session.state === 'suspended';

  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<{
    vscode: ServiceStatus;
    mastra: ServiceStatus;
    astro: ServiceStatus;
  } | null>(null);
  const [resumedUrls, setResumedUrls] = useState<ServiceUrls | null>(null);
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);
  const [resumeToken, setResumeToken] = useState('');
  const [rememberResumeToken, setRememberResumeToken] = useState(false);
  const [idleStatus, setIdleStatus] = useState<IdleStatus | null>(null);
  const [keepingWorking, setKeepingWorking] = useState(false);

  // Poll idle status every 30 seconds for active sessions
  useEffect(() => {
    if (!isActive) {
      setIdleStatus(null);
      return;
    }

    const checkIdleStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${session.id}/idle-status`, {
          headers: createAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setIdleStatus(data);
        }
      } catch {
        // Silently ignore errors - idle status is non-critical
      }
    };

    checkIdleStatus();
    const interval = setInterval(checkIdleStatus, 30000);
    return () => clearInterval(interval);
  }, [isActive, session.id]);

  // Handle "Keep Working" button - records activity to reset idle timer
  async function handleKeepWorking() {
    setKeepingWorking(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${session.id}/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({ activityType: 'keyboard' }),
      });
      if (res.ok) {
        // Reset idle status - will be refreshed on next poll
        setIdleStatus(null);
      }
    } catch {
      // Silently ignore errors
    } finally {
      setKeepingWorking(false);
    }
  }

  // Poll a single service and update status
  async function pollService(
    url: string,
    serviceName: 'vscode' | 'mastra' | 'astro',
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<boolean> {
    setServiceStatus((prev) => (prev ? { ...prev, [serviceName]: 'checking' } : prev));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        setServiceStatus((prev) => (prev ? { ...prev, [serviceName]: 'ready' } : prev));
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    setServiceStatus((prev) => (prev ? { ...prev, [serviceName]: 'error' } : prev));
    return false;
  }

  async function handleSuspend() {
    setSuspending(true);
    setSuspendError(null);

    try {
      const res = await fetch(`${API_BASE}/sessions/${session.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to suspend session');
      }

      // Notify parent to refresh
      onSuspended?.();
    } catch (err) {
      setSuspendError(err instanceof Error ? err.message : 'Failed to suspend session');
    } finally {
      setSuspending(false);
    }
  }

  async function handleResume() {
    // Check for stored (encrypted) token first
    const storedEncryptedToken = getStoredClaudeToken();

    if (!storedEncryptedToken && !resumeToken) {
      // No token available - show prompt
      setShowTokenPrompt(true);
      return;
    }

    setResuming(true);
    setResumeError(null);

    try {
      // Determine encrypted token to send
      let encryptedClaudeToken: string;
      if (resumeToken) {
        // User entered a new token - encrypt it
        encryptedClaudeToken = await encryptToken(resumeToken);
        // Save if "remember" is checked
        if (rememberResumeToken) {
          await setStoredClaudeToken(resumeToken);
        }
      } else {
        // Use stored (already encrypted) token
        encryptedClaudeToken = storedEncryptedToken!;
      }

      const res = await fetch(`${API_BASE}/sessions/${session.id}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({
          encryptedClaudeToken,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resume session');
      }

      const data = await res.json();
      const newUrls: ServiceUrls = data.urls;

      // Initialize status panel and store URLs
      setServiceStatus({
        vscode: newUrls.vscode ? 'pending' : 'ready',
        mastra: newUrls.mastra ? 'pending' : 'ready',
        astro: newUrls.astro ? 'pending' : 'ready',
      });
      setResumedUrls(newUrls);
      setShowTokenPrompt(false);

      // Poll services in parallel
      const checks: Promise<boolean>[] = [];
      if (newUrls.vscode) checks.push(pollService(newUrls.vscode, 'vscode'));
      if (newUrls.mastra) checks.push(pollService(newUrls.mastra, 'mastra'));
      if (newUrls.astro) checks.push(pollService(newUrls.astro, 'astro'));

      await Promise.all(checks);

      // Try to open tabs
      if (newUrls.vscode) window.open(newUrls.vscode, '_blank');
      if (newUrls.mastra) window.open(newUrls.mastra, '_blank');

      // Notify parent to refresh
      onResumed?.();
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Failed to resume session');
      setResuming(false);
    }
  }

  // Service status indicator for resume
  function ServiceStatusItem({
    name,
    serviceStatus: status,
    url,
  }: {
    name: string;
    serviceStatus: ServiceStatus;
    url: string | null;
  }) {
    const statusConfig = {
      pending: { icon: '○', color: 'text-gray-400', label: 'Waiting...' },
      checking: { icon: '◐', color: 'text-yellow-500 animate-pulse', label: 'Starting...' },
      ready: { icon: '●', color: 'text-green-500', label: 'Ready' },
      error: { icon: '●', color: 'text-red-500', label: 'Failed' },
    };
    const config = statusConfig[status];

    return (
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${config.color}`}>{config.icon}</span>
          <span className="text-xs text-gray-900 dark:text-dark-text-primary">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-dark-text-muted">{config.label}</span>
          {status === 'ready' && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              Open →
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4 hover:shadow-md dark:hover:border-dark-text-muted transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
              {session.artifactName || session.id.slice(0, 8)}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}
            >
              {status.label}
            </span>
          </div>

          {session.branchName && (
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted font-mono truncate">
              {session.branchName}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-400 dark:text-dark-text-muted">
            {formatRelativeTime(session.lastActivityAt || session.updatedAt)}
            {session.commitCount && session.commitCount > 0 && ` · ${session.commitCount} commit${session.commitCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {isActive && idleStatus?.warningIssued && idleStatus.suspendAt && (
        <div className="mt-3">
          <IdleWarningBanner
            sessionId={session.id}
            idleSinceMinutes={idleStatus.idleSinceMinutes}
            idleTimeoutMinutes={idleStatus.idleTimeoutMinutes}
            suspendAt={idleStatus.suspendAt}
            onKeepWorking={handleKeepWorking}
            keepingWorking={keepingWorking}
          />
        </div>
      )}

      {isActive && urls && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <ServiceLink href={urls.vscode} label="VS Code" icon="code" />
            <ServiceLink href={urls.mastra} label="Mastra" icon="api" />
            {urls.astro && <ServiceLink href={urls.astro} label="Astro" icon="web" />}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {suspendError && (
              <p className="text-xs text-red-600 dark:text-red-400">{suspendError}</p>
            )}
            <button
              type="button"
              onClick={handleSuspend}
              disabled={suspending}
              className="text-xs px-2 py-1 text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 rounded font-medium disabled:opacity-50 transition-colors"
            >
              {suspending ? 'Suspending...' : 'Suspend'}
            </button>
          </div>
        </div>
      )}

      {isSuspended && !serviceStatus && (
        <div className="mt-3">
          {resumeError && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-2">{resumeError}</p>
          )}
          {!showTokenPrompt && (
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="text-xs px-2 py-1 text-primary-700 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 rounded font-medium disabled:opacity-50 transition-colors"
            >
              {resuming ? 'Resuming...' : 'Resume'}
            </button>
          )}
          {showTokenPrompt && (
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded p-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                Claude Code Token required
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={resumeToken}
                  onChange={(e) => setResumeToken(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 text-xs rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-2 py-1 font-mono"
                />
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={!resumeToken.trim() || resuming}
                  className="text-xs px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {resuming ? '...' : 'Resume'}
                </button>
              </div>
              <label className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-dark-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberResumeToken}
                  onChange={(e) => setRememberResumeToken(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 text-xs"
                />
                Remember for future sessions
              </label>
            </div>
          )}
        </div>
      )}

      {serviceStatus && (
        <div className="mt-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded p-2">
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            <ServiceStatusItem name="VS Code" serviceStatus={serviceStatus.vscode} url={resumedUrls?.vscode ?? null} />
            <ServiceStatusItem name="Mastra" serviceStatus={serviceStatus.mastra} url={resumedUrls?.mastra ?? null} />
            {resumedUrls?.astro && (
              <ServiceStatusItem name="Astro" serviceStatus={serviceStatus.astro} url={resumedUrls.astro} />
            )}
          </div>
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
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary rounded hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
    >
      <span className="text-gray-500 dark:text-dark-text-muted">{ICONS[icon]}</span>
      {label}
    </a>
  );
}

export default SessionCard;
