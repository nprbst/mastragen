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

export interface AlertRuleFormProps {
  /** Rule to edit (undefined for create mode) */
  rule?: AlertRule;
  /** Called when form is submitted successfully */
  onSave?: (rule: AlertRule) => void;
  /** Called when form is cancelled */
  onCancel?: () => void;
}

const conditionTypes = [
  { value: 'pod_creation_failed', label: 'Pod Creation Failed' },
  { value: 'tailscale_timeout', label: 'Tailscale Timeout' },
  { value: 'database_failed', label: 'Database Failed' },
  { value: 'orphaned_pod', label: 'Orphaned Pod' },
];

const severityLevels = [
  { value: 'warning', label: 'Warning', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'error', label: 'Error', color: 'bg-red-100 text-red-800' },
  { value: 'critical', label: 'Critical', color: 'bg-purple-100 text-purple-800' },
];

interface FormState {
  name: string;
  conditionType: string;
  threshold: string;
  severity: 'warning' | 'error' | 'critical';
  enabled: boolean;
  destinations: AlertDestination[];
}

interface FormErrors {
  name?: string;
  conditionType?: string;
  threshold?: string;
  destinations?: string;
}

/**
 * T072: Alert Rule Form component
 *
 * Create or edit alert rules with:
 * - Form fields for name, conditionType, threshold, severity, enabled
 * - Destination management (add/remove webhook URLs and emails)
 * - Validation matching CreateAlertRuleRequestSchema
 * - Create and Edit modes (controlled by optional rule prop)
 */
export function AlertRuleForm({ rule, onSave, onCancel }: AlertRuleFormProps) {
  const isEditMode = !!rule;

  const [formState, setFormState] = useState<FormState>({
    name: '',
    conditionType: 'pod_creation_failed',
    threshold: '',
    severity: 'warning',
    enabled: true,
    destinations: [],
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Destination form state
  const [newDestType, setNewDestType] = useState<'webhook' | 'email'>('webhook');
  const [newDestValue, setNewDestValue] = useState('');
  const [destError, setDestError] = useState<string | null>(null);

  // Initialize form with rule data in edit mode
  useEffect(() => {
    if (rule) {
      setFormState({
        name: rule.name,
        conditionType: rule.conditionType,
        threshold: rule.threshold !== null ? String(rule.threshold) : '',
        severity: rule.severity,
        enabled: rule.enabled,
        destinations: [...rule.destinations],
      });
    }
  }, [rule]);

  function validateForm(): boolean {
    const newErrors: FormErrors = {};

    // Name validation (1-100 chars)
    if (!formState.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formState.name.length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    // Condition type validation
    if (!formState.conditionType) {
      newErrors.conditionType = 'Condition type is required';
    }

    // Threshold validation (optional, but must be valid number if provided)
    if (formState.threshold && Number.isNaN(Number(formState.threshold))) {
      newErrors.threshold = 'Threshold must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateDestination(): boolean {
    setDestError(null);

    if (!newDestValue.trim()) {
      setDestError(newDestType === 'webhook' ? 'URL is required' : 'Email is required');
      return false;
    }

    if (newDestType === 'webhook') {
      try {
        new URL(newDestValue);
      } catch {
        setDestError('Invalid URL format');
        return false;
      }
    } else {
      // Simple email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newDestValue)) {
        setDestError('Invalid email format');
        return false;
      }
    }

    // Check for duplicates
    const isDuplicate = formState.destinations.some((d) => {
      if (newDestType === 'webhook') {
        return d.type === 'webhook' && d.url === newDestValue;
      }
      return d.type === 'email' && d.email === newDestValue;
    });

    if (isDuplicate) {
      setDestError('This destination already exists');
      return false;
    }

    return true;
  }

  function handleAddDestination() {
    if (!validateDestination()) return;

    const newDest: AlertDestination =
      newDestType === 'webhook'
        ? { type: 'webhook', url: newDestValue }
        : { type: 'email', email: newDestValue };

    setFormState((prev) => ({
      ...prev,
      destinations: [...prev.destinations, newDest],
    }));
    setNewDestValue('');
    setDestError(null);
  }

  function handleRemoveDestination(index: number) {
    setFormState((prev) => ({
      ...prev,
      destinations: prev.destinations.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) return;

    setSaving(true);

    try {
      const body = {
        name: formState.name.trim(),
        conditionType: formState.conditionType,
        threshold: formState.threshold ? Number(formState.threshold) : null,
        severity: formState.severity,
        enabled: formState.enabled,
        destinations: formState.destinations,
      };

      const url = isEditMode
        ? `${API_BASE}/alerts/rules/${rule.id}`
        : `${API_BASE}/alerts/rules`;

      const res = await fetch(url, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} rule`);
      }

      const savedRule = await res.json();
      onSave?.(savedRule);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label
            htmlFor="rule-name"
            className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary"
          >
            Rule Name
          </label>
          <input
            id="rule-name"
            type="text"
            value={formState.name}
            onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            placeholder="e.g., Critical Pod Failures"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>
          )}
        </div>

        {/* Condition Type */}
        <div>
          <label
            htmlFor="condition-type"
            className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary"
          >
            Condition Type
          </label>
          <select
            id="condition-type"
            value={formState.conditionType}
            onChange={(e) =>
              setFormState((prev) => ({ ...prev, conditionType: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            {conditionTypes.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
          {errors.conditionType && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.conditionType}</p>
          )}
        </div>

        {/* Threshold */}
        <div>
          <label
            htmlFor="threshold"
            className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary"
          >
            Threshold (optional)
          </label>
          <input
            id="threshold"
            type="number"
            value={formState.threshold}
            onChange={(e) => setFormState((prev) => ({ ...prev, threshold: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            placeholder="e.g., 60 (seconds for timeout)"
          />
          {errors.threshold && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.threshold}</p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
            Used for conditions that require a numeric threshold (e.g., timeout in seconds)
          </p>
        </div>

        {/* Severity */}
        <div>
          <label
            htmlFor="severity"
            className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary"
          >
            Severity
          </label>
          <select
            id="severity"
            value={formState.severity}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                severity: e.target.value as 'warning' | 'error' | 'critical',
              }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            {severityLevels.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
            Enabled
          </span>
          <button
            type="button"
            onClick={() => setFormState((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              formState.enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={formState.enabled}
          >
            <span className="sr-only">Enable rule</span>
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formState.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Destinations Section */}
      <div className="border-t border-gray-200 dark:border-dark-border pt-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-3">
          Destinations
        </h4>

        {/* Existing destinations */}
        {formState.destinations.length > 0 && (
          <ul className="space-y-2 mb-4">
            {formState.destinations.map((dest, index) => (
              <li
                key={`${dest.type}-${dest.type === 'webhook' ? dest.url : dest.email}`}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      dest.type === 'webhook'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    {dest.type}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary truncate">
                    {dest.type === 'webhook' ? dest.url : dest.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDestination(index)}
                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add new destination */}
        <div className="flex gap-2">
          <select
            value={newDestType}
            onChange={(e) => {
              setNewDestType(e.target.value as 'webhook' | 'email');
              setNewDestValue('');
              setDestError(null);
            }}
            className="rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
          </select>
          <input
            type={newDestType === 'email' ? 'email' : 'url'}
            value={newDestValue}
            onChange={(e) => setNewDestValue(e.target.value)}
            placeholder={newDestType === 'webhook' ? 'https://...' : 'ops@example.com'}
            className="flex-1 rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <button
            type="button"
            onClick={handleAddDestination}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Add
          </button>
        </div>
        {destError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{destError}</p>
        )}
        {formState.destinations.length === 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
            No destinations configured. Alert events will still be recorded but not delivered.
          </p>
        )}
      </div>

      {/* Server Error */}
      {serverError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : isEditMode ? 'Update Rule' : 'Create Rule'}
        </button>
      </div>
    </form>
  );
}

export default AlertRuleForm;
