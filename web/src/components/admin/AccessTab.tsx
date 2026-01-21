import { useState, useEffect } from 'react';

interface Project {
  id: string;
  name: string;
  githubRepo: string | null;
}

interface AccessTabProps {
  project: Project;
}

export default function AccessTab({ project }: AccessTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    // For now, just show installation info if project has githubRepo
    // In full implementation, would fetch from /projects/:id/installation
    setLoading(false);
  }, [project.id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/4"></div>
        <div className="h-20 bg-gray-200 dark:bg-dark-bg-tertiary rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Access Control</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
          Project access is determined by GitHub App installation permissions.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-400 dark:text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">GitHub-based Access</h4>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              Users with access to the GitHub repository automatically have access to this project.
              Access is verified via GitHub App installation membership.
            </p>
          </div>
        </div>
      </div>

      {project.githubRepo ? (
        <div className="border border-gray-200 dark:border-dark-border rounded-lg divide-y divide-gray-200 dark:divide-dark-border">
          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Linked Repository</h4>
            <div className="mt-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <a
                href={`https://github.com/${project.githubRepo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                {project.githubRepo}
              </a>
            </div>
          </div>

          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Who Has Access</h4>
            <ul className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary space-y-1">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Repository collaborators with read access or higher
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Organization members (if org repo with app installed)
              </li>
            </ul>
          </div>

          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Admin Access</h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-dark-text-secondary">
              Users with <strong>admin</strong> permissions on the repository can modify project settings.
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
          <p>No GitHub repository linked to this project.</p>
          <p className="text-sm mt-1">Link a repository in the Overview tab to enable access control.</p>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-dark-border pt-6">
        <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-3">Session Sharing</h4>
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          Session owners can share active sessions with other users using the <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1 rounded">/share</code> command in Claude.
          Shared access is managed via Tailscale ACLs and recorded in the session history.
        </p>
      </div>
    </div>
  );
}
