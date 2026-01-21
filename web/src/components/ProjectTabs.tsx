import { useState, useEffect } from 'react';
import OverviewTab from './admin/OverviewTab';
import EnvironmentsTab from './admin/EnvironmentsTab';
import ClaudeConfigTab from './admin/ClaudeConfigTab';
import SkillsTab from './admin/SkillsTab';
import AccessTab from './admin/AccessTab';

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

export interface ProjectTabsProps {
  projectId: string;
}

type TabId = 'overview' | 'environments' | 'claude-config' | 'skills' | 'access';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'environments', label: 'Environments' },
  { id: 'claude-config', label: 'Claude Config' },
  { id: 'skills', label: 'Skills' },
  { id: 'access', label: 'Access' },
];

const API_BASE = '/api';

export default function ProjectTabs({ projectId }: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    async function fetchProject() {
      try {
        const response = await fetch(`${API_BASE}/projects/${projectId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Project not found');
          } else {
            setError('Failed to load project');
          }
          return;
        }
        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/3 mb-6"></div>
        <div className="h-64 bg-gray-200 dark:bg-dark-bg-tertiary rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-400">{error}</p>
        <a href="/" className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm mt-2 inline-block">
          &larr; Back to Dashboard
        </a>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div>
      {/* Project header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{project.name}</h2>
        {project.githubRepo && (
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 dark:hover:text-dark-text-primary"
            >
              {project.githubRepo}
            </a>
          </p>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-dark-border mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-dark-text-secondary hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow dark:shadow-none dark:border dark:border-dark-border p-6">
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            apiBase={API_BASE}
            onUpdate={setProject}
          />
        )}
        {activeTab === 'environments' && projectId && (
          <EnvironmentsTab
            projectId={projectId}
            apiBase={API_BASE}
          />
        )}
        {activeTab === 'claude-config' && projectId && (
          <ClaudeConfigTab
            projectId={projectId}
            apiBase={API_BASE}
          />
        )}
        {activeTab === 'skills' && projectId && (
          <SkillsTab
            projectId={projectId}
            apiBase={API_BASE}
          />
        )}
        {activeTab === 'access' && <AccessTab project={project} />}
      </div>
    </div>
  );
}
