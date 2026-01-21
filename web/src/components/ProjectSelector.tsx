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
      <label htmlFor="project" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
        Project
      </label>
      <select
        id="project"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary px-3 py-2 text-sm text-gray-900 dark:text-dark-text-primary focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-primary-400"
        required
      >
        <option value="">Select a project...</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {project.githubRepo && ` (${project.githubRepo})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ProjectSelector;
