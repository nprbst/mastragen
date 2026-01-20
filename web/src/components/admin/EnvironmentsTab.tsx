import { useState, useEffect } from 'react';

interface Environment {
  id: string;
  name: string;
  envVars: Record<string, string>;
  createdAt: string;
}

interface EnvironmentsTabProps {
  projectId: string;
  apiBase: string;
}

export default function EnvironmentsTab({ projectId, apiBase }: EnvironmentsTabProps) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEnvironments();
  }, [projectId]);

  async function fetchEnvironments() {
    try {
      const response = await fetch(`${apiBase}/projects/${projectId}/environments`);
      if (!response.ok) throw new Error('Failed to fetch environments');
      const data = await response.json();
      setEnvironments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environments');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEnvironment(e: React.FormEvent) {
    e.preventDefault();
    if (!newEnvName.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/projects/${projectId}/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEnvName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create environment');
      }

      await fetchEnvironments();
      setNewEnvName('');
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Environments</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure environment variables for different deployment targets.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          + Add Environment
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500">
            &times;
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddEnvironment} className="bg-gray-50 rounded-lg p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              placeholder="Environment name (e.g., development, staging)"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={saving || !newEnvName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewEnvName('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {environments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No environments configured yet.</p>
          <p className="text-sm mt-1">Add an environment to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {environments.map((env) => (
            <EnvironmentCard key={env.id} environment={env} />
          ))}
        </div>
      )}
    </div>
  );
}

interface EnvironmentCardProps {
  environment: Environment;
}

function EnvironmentCard({ environment }: EnvironmentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const envVarCount = Object.keys(environment.envVars).length;

  return (
    <div className="border border-gray-200 rounded-lg">
      <div
        className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h4 className="font-medium text-gray-900">{environment.name}</h4>
          <p className="text-sm text-gray-500">
            {envVarCount} environment variable{envVarCount !== 1 ? 's' : ''}
          </p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          {envVarCount === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No environment variables configured.
            </p>
          ) : (
            <dl className="space-y-2">
              {Object.entries(environment.envVars).map(([key, value]) => (
                <div key={key} className="flex">
                  <dt className="font-mono text-sm text-gray-600 w-1/3">{key}</dt>
                  <dd className="font-mono text-sm text-gray-900 flex-1">
                    {value.includes('*') ? value : '••••••••'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-gray-400 mt-4">
            Environment variables are set when creating new sessions.
          </p>
        </div>
      )}
    </div>
  );
}
