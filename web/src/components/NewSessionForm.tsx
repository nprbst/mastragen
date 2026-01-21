import { useState, useEffect } from 'react';
import { ProjectSelector } from './ProjectSelector';
import { EnvironmentSelector } from './EnvironmentSelector';
import { getAuthState, createAuthHeaders } from '../lib/auth';

export interface NewSessionFormProps {}

interface Project {
  id: string;
  name: string;
  githubRepo: string | null;
}

interface Environment {
  id: string;
  name: string;
}

interface CreateSessionResponse {
  id: string;
  urls?: {
    mastra: string;
    astro: string | null;
    vscode: string;
  };
}

const API_BASE = '/api';

export function NewSessionForm({}: NewSessionFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('');
  const [sessionName, setSessionName] = useState<string>('');
  const [claudeToken, setClaudeToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingEnvironments, setLoadingEnvironments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch(`${API_BASE}/projects`);
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        setProjects(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoadingProjects(false);
      }
    }
    fetchProjects();
  }, []);

  // Fetch environments when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setEnvironments([]);
      setSelectedEnvironment('');
      return;
    }

    async function fetchEnvironments() {
      setLoadingEnvironments(true);
      try {
        const res = await fetch(`${API_BASE}/projects/${selectedProjectId}/environments`);
        if (!res.ok) throw new Error('Failed to fetch environments');
        const data = await res.json();
        setEnvironments(data);
        // Auto-select first environment
        if (data.length > 0) {
          setSelectedEnvironment(data[0].name);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load environments');
      } finally {
        setLoadingEnvironments(false);
      }
    }
    fetchEnvironments();
  }, [selectedProjectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const authState = getAuthState();

      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...createAuthHeaders(),
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          artifactName: sessionName,
          environment: selectedEnvironment,
          claudeToken: claudeToken,
          userId: authState.user?.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const session: CreateSessionResponse = await res.json();

      // Redirect to VS Code URL
      if (session.urls?.vscode) {
        window.location.href = session.urls.vscode;
      } else {
        // Fallback to dashboard
        window.location.href = '/';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setLoading(false);
    }
  };

  const isValid = Boolean(selectedProjectId && selectedEnvironment && sessionName.trim() && claudeToken.trim());
  const noEnvironments = Boolean(selectedProjectId) && environments.length === 0 && !loadingEnvironments;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <ProjectSelector
        projects={projects}
        selectedId={selectedProjectId}
        onChange={setSelectedProjectId}
        loading={loadingProjects}
      />

      {selectedProjectId && (
        <>
          {noEnvironments ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 px-4 py-3 rounded-md text-sm">
              <p className="font-medium">No environments configured</p>
              <p className="mt-1 text-yellow-700 dark:text-yellow-500">
                This project has no environments. Please configure an environment before creating a session.
              </p>
            </div>
          ) : (
            <EnvironmentSelector
              environments={environments}
              selectedName={selectedEnvironment}
              onChange={setSelectedEnvironment}
              loading={loadingEnvironments}
            />
          )}
        </>
      )}

      <div>
        <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
          Session Name
        </label>
        <input
          type="text"
          id="sessionName"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="feature-auth-improvements"
          className="block w-full rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary px-3 py-2 text-sm text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-primary-400"
          required
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
          A descriptive name for your session (used for branch naming)
        </p>
      </div>

      <div>
        <label htmlFor="claudeToken" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
          Claude Code Token
        </label>
        <input
          type="password"
          id="claudeToken"
          value={claudeToken}
          onChange={(e) => setClaudeToken(e.target.value)}
          placeholder="sk-ant-..."
          className="block w-full rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary px-3 py-2 text-sm text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-primary-400 font-mono"
          required
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
          Run <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1 rounded font-mono">claude setup-token</code> to generate a token
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <a
          href="/"
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={!isValid || loading || noEnvironments}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    </form>
  );
}

export default NewSessionForm;
