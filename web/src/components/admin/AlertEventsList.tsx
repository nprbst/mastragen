import { useState, useEffect } from 'react';
import { createAuthHeaders, getCachedUser } from '../../lib/auth';

const API_BASE = '/api';

type AlertEventStatus = 'pending' | 'delivered' | 'failed' | 'acknowledged';

interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName?: string;
  triggeredAt: string;
  context: Record<string, unknown>;
  status: AlertEventStatus;
  deliveryAttempts: number;
  lastDeliveryAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

const statusColors: Record<AlertEventStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const statusLabels: Record<AlertEventStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  failed: 'Failed',
  acknowledged: 'Acked',
};

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

/**
 * T071: Alert Events List component
 *
 * Displays recent alert events with:
 * - Status filter (all, pending, delivered, failed, acknowledged)
 * - Acknowledge button for pending/delivered events
 * - Context preview on hover
 */
export function AlertEventsList() {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertEventStatus | 'all'>('all');
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchEvents() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('status', filter);
      }
      params.set('limit', '20');

      const res = await fetch(`${API_BASE}/alerts/events?${params.toString()}`, {
        headers: createAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch events: ${res.statusText}`);
      }

      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, [filter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  async function acknowledgeEvent(eventId: string) {
    setAcknowledgingId(eventId);

    try {
      const res = await fetch(`${API_BASE}/alerts/events/${eventId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Failed to acknowledge: ${res.statusText}`);
      }

      // Refresh events
      await fetchEvents();
    } catch (err) {
      console.error('Failed to acknowledge event:', err);
    } finally {
      setAcknowledgingId(null);
    }
  }

  if (loading && events.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {['all', 'pending', 'delivered', 'failed', 'acknowledged'].map((s) => (
            <div key={s} className="h-8 w-20 bg-gray-200 dark:bg-dark-bg-tertiary rounded animate-pulse" />
          ))}
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-dark-bg-tertiary rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={fetchEvents}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'delivered', 'failed', 'acknowledged'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter === status
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border'
            }`}
          >
            {status === 'all' ? 'All' : statusLabels[status]}
          </button>
        ))}
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
            No events found
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-border"
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[event.status]}`}
                    >
                      {statusLabels[event.status]}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                      {event.ruleName || event.ruleId}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    {formatRelativeTime(event.triggeredAt)}
                    {event.deliveryAttempts > 0 && ` - ${event.deliveryAttempts} delivery attempt(s)`}
                  </p>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  {(event.status === 'pending' || event.status === 'delivered') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeEvent(event.id);
                      }}
                      disabled={acknowledgingId === event.id}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        acknowledgingId === event.id
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50'
                      }`}
                    >
                      {acknowledgingId === event.id ? 'Acking...' : 'Ack'}
                    </button>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === event.id ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded context */}
              {expandedId === event.id && (
                <div className="px-3 pb-3 border-t border-gray-200 dark:border-dark-border">
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-dark-text-muted mb-1">Context:</p>
                    <pre className="text-xs bg-gray-100 dark:bg-dark-bg-primary p-2 rounded overflow-x-auto">
                      {JSON.stringify(event.context, null, 2)}
                    </pre>
                  </div>
                  {event.acknowledgedAt && (
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2">
                      Acknowledged by {event.acknowledgedBy} at {new Date(event.acknowledgedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AlertEventsList;
