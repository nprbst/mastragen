import { useState } from 'react';

interface Project {
  id: string;
  name: string;
  githubRepo: string | null;
  defaultBranch: string | null;
  branchPrefix: string | null;
  mastraPath: string | null;
  uiSandboxPath: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OverviewTabProps {
  project: Project;
  apiBase: string;
  onUpdate: (project: Project) => void;
}

export default function OverviewTab({ project, apiBase, onUpdate }: OverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: project.name,
    githubRepo: project.githubRepo || '',
    defaultBranch: project.defaultBranch || 'main',
    branchPrefix: project.branchPrefix || 'mg/',
    mastraPath: project.mastraPath || '.',
    uiSandboxPath: project.uiSandboxPath || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update project');
      }

      const updated = await response.json();
      onUpdate(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Project Overview</h3>
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            Edit
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Project Name</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">{project.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">GitHub Repository</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">
              {project.githubRepo || <span className="text-gray-400 dark:text-dark-text-muted">Not set</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Default Branch</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">{project.defaultBranch || 'main'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Branch Prefix</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">{project.branchPrefix || 'mg/'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Mastra Path</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">{project.mastraPath || '.'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">UI Sandbox Path</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">
              {project.uiSandboxPath || <span className="text-gray-400 dark:text-dark-text-muted">Not configured</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Created</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">
              {new Date(project.createdAt).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary">
              {new Date(project.updatedAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Edit Project</h3>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">Project Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">GitHub Repository</label>
          <input
            type="text"
            value={formData.githubRepo}
            onChange={(e) => setFormData({ ...formData, githubRepo: e.target.value })}
            placeholder="owner/repo"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">Default Branch</label>
          <input
            type="text"
            value={formData.defaultBranch}
            onChange={(e) => setFormData({ ...formData, defaultBranch: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">Branch Prefix</label>
          <input
            type="text"
            value={formData.branchPrefix}
            onChange={(e) => setFormData({ ...formData, branchPrefix: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">Mastra Path</label>
          <input
            type="text"
            value={formData.mastraPath}
            onChange={(e) => setFormData({ ...formData, mastraPath: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">UI Sandbox Path</label>
          <input
            type="text"
            value={formData.uiSandboxPath}
            onChange={(e) => setFormData({ ...formData, uiSandboxPath: e.target.value })}
            placeholder="Optional: path to Astro project"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-tertiary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
