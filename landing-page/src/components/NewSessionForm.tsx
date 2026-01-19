import { useState, useEffect } from 'react';
import { ProjectSelector } from './ProjectSelector';
import { EnvironmentSelector } from './EnvironmentSelector';

export interface NewSessionFormProps {
  orchestratorUrl?: string;
}

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

export function NewSessionForm({ orchestratorUrl = 'http://localhost:4000' }: NewSessionFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('');
  const [sessionName, setSessionName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingEnvironments, setLoadingEnvironments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch(`${orchestratorUrl}/projects`);
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
  }, [orchestratorUrl]);

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
        const res = await fetch(`${orchestratorUrl}/projects/${selectedProjectId}/environments`);
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
  }, [selectedProjectId, orchestratorUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${orchestratorUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          artifactName: sessionName,
          environment: selectedEnvironment,
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

  const isValid = Boolean(selectedProjectId && selectedEnvironment && sessionName.trim());
  const noEnvironments = Boolean(selectedProjectId) && environments.length === 0 && !loadingEnvironments;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
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
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
              <p className="font-medium">No environments configured</p>
              <p className="mt-1 text-yellow-700">
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
        <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 mb-1">
          Session Name
        </label>
        <input
          type="text"
          id="sessionName"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="feature-auth-improvements"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          A descriptive name for your session (used for branch naming)
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <a
          href="/"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
