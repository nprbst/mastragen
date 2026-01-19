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
        <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
        <div className="animate-pulse bg-gray-200 rounded-md h-10" />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="environment" className="block text-sm font-medium text-gray-700 mb-1">
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
                  ? 'bg-primary-100 border-primary-500 text-primary-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
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
