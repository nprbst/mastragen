interface Environment {
  id: string;
  name: string;
}

export interface EnvironmentSelectorProps {
  environments: Environment[];
  selectedName: string;
  onChange: (environmentName: string) => void;
  loading?: boolean;
}

export function EnvironmentSelector({
  environments,
  selectedName,
  onChange,
  loading,
}: EnvironmentSelectorProps) {
  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Environment</label>
        <div className="animate-pulse bg-gray-200 dark:bg-dark-bg-tertiary rounded-md h-10" />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="environment" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
        Environment
      </label>
      <div className="flex flex-wrap gap-2">
        {environments.map((env) => (
          <button
            key={env.id}
            type="button"
            onClick={() => onChange(env.name)}
            className={`
              px-4 py-2 text-sm font-medium rounded-md border transition-colors
              ${
                selectedName === env.name
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-300'
                  : 'bg-white dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-secondary'
              }
            `}
          >
            {env.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default EnvironmentSelector;
