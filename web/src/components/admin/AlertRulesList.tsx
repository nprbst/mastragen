import { useState, useEffect } from 'react';
import { createAuthHeaders } from '../../lib/auth';

const API_BASE = '/api';

interface AlertDestination {
  type: 'webhook' | 'email';
  url?: string;
  email?: string;
}

interface AlertRule {
  id: string;
  name: string;
  conditionType: string;
  threshold: number | null;
  severity: 'warning' | 'error' | 'critical';
  enabled: boolean;
  destinations: AlertDestination[];
  createdAt: string;
  updatedAt: string;
}

const severityColors: Record<string, string> = {
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  critical: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const conditionLabels: Record<string, string> = {
  pod_creation_failed: 'Pod Creation Failed',
  tailscale_timeout: 'Tailscale Timeout',
  database_failed: 'Database Failed',
  orphaned_pod: 'Orphaned Pod',
};

/**
 * T070: Alert Rules List component
 *
 * Displays all alert rules with:
 * - Enable/disable toggle
 * - Severity badge
 * - Destination count
 */
export function AlertRulesList() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function fetchRules() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/alerts/rules`, {
        headers: createAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch rules: ${res.statusText}`);
      }

      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRules();
  }, []);

  async function toggleRule(ruleId: string, enabled: boolean) {
    setTogglingId(ruleId);

    try {
      const res = await fetch(`${API_BASE}/alerts/rules/${ruleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update rule: ${res.statusText}`);
      }

      // Update local state
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r))
      );
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-dark-bg-tertiary rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={fetchRules}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
          No alert rules configured
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                {rule.name}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors[rule.severity]}`}
              >
                {rule.severity}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
              {conditionLabels[rule.conditionType] || rule.conditionType}
              {rule.threshold !== null && ` (threshold: ${rule.threshold})`}
              {rule.destinations.length > 0 &&
                ` - ${rule.destinations.length} destination(s)`}
            </p>
          </div>

          <div className="ml-4">
            <button
              type="button"
              onClick={() => toggleRule(rule.id, !rule.enabled)}
              disabled={togglingId === rule.id}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-secondary ${
                rule.enabled
                  ? 'bg-primary-600'
                  : 'bg-gray-200 dark:bg-gray-600'
              } ${togglingId === rule.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              role="switch"
              aria-checked={rule.enabled}
            >
              <span className="sr-only">Enable rule</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  rule.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AlertRulesList;
