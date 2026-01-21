import { useState, useEffect } from 'react';

export interface IdleWarningBannerProps {
  sessionId: string;
  idleSinceMinutes: number;
  idleTimeoutMinutes: number;
  suspendAt: string;
  onKeepWorking: () => void;
  keepingWorking?: boolean;
}

/**
 * IdleWarningBanner - Display warning when session is approaching idle timeout.
 *
 * Shows:
 * - Yellow warning banner with clock icon
 * - Time remaining until suspension (countdown)
 * - "Keep Working" button to record activity and reset timer
 */
export function IdleWarningBanner({
  idleSinceMinutes,
  idleTimeoutMinutes,
  suspendAt,
  onKeepWorking,
  keepingWorking = false,
}: IdleWarningBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const updateCountdown = () => {
      const suspendTime = new Date(suspendAt).getTime();
      const now = Date.now();
      const diffMs = suspendTime - now;

      if (diffMs <= 0) {
        setTimeRemaining('0:00');
        return;
      }

      const minutes = Math.floor(diffMs / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [suspendAt]);

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-500 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Session will suspend due to inactivity
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            Idle for {idleSinceMinutes} of {idleTimeoutMinutes} minutes.
            {' '}Suspending in <span className="font-mono font-medium">{timeRemaining}</span>
          </p>
        </div>
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={onKeepWorking}
            disabled={keepingWorking}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/50 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded-md transition-colors disabled:opacity-50"
          >
            {keepingWorking ? 'Updating...' : 'Keep Working'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default IdleWarningBanner;
