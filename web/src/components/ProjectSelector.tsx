interface Project {
  id: string;
  name: string;
  githubRepo: string | null;
}

export interface ProjectSelectorProps {
  projects: Project[];
  selectedId: string;
  onChange: (projectId: string) => void;
  loading?: boolean;
}

export function ProjectSelector({ projects, selectedId, onChange, loading }: ProjectSelectorProps) {
  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Project</label>
        <div className="animate-pulse bg-gray-200 dark:bg-dark-bg-tertiary rounded-md h-10" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Project</label>
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-md px-3 py-2 text-sm text-gray-500 dark:text-dark-text-muted">
          No projects available. Create a project first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
        Project
      </label>
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onChange(project.id)}
            className={`
              px-4 py-2 text-sm font-medium rounded-md border transition-colors
              ${
                selectedId === project.id
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-300'
                  : 'bg-white dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary'
              }
            `}
          >
            <span>{project.name}</span>
            {project.githubRepo && (
              <span className="ml-1 text-xs text-gray-500 dark:text-dark-text-muted">
                ({project.githubRepo})
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProjectSelector;
