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
        <div className="h-10 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <a href="/" className="text-red-600 hover:text-red-800 text-sm mt-2 inline-block">
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
        <h2 className="text-xl font-semibold text-gray-900">{project.name}</h2>
        {project.githubRepo && (
          <p className="text-sm text-gray-500 mt-1">
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700"
            >
              {project.githubRepo}
            </a>
          </p>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg shadow p-6">
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
