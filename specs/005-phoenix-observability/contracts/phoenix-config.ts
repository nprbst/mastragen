/**
 * Phoenix Configuration Contracts
 *
 * Type definitions for Phoenix observability configuration in Mastragen.
 */

// =============================================================================
// Project Config File Types (.mastragen/config.yaml)
// =============================================================================

/**
 * Root structure of .mastragen/config.yaml
 */
export interface MastragenConfigFile {
  /** Config file version */
  version: "1";

  /** Component enablement settings */
  components?: {
    /** Phoenix observability settings */
    phoenix?: PhoenixComponentConfig;

    /** Astro UI sandbox settings */
    astro?: {
      enabled?: boolean;
      path?: string;
    };
  };

  /** Workspace paths */
  paths?: {
    mastra?: string;
    workspace?: string;
  };
}

/**
 * Phoenix component configuration within .mastragen/config.yaml
 */
export interface PhoenixComponentConfig {
  /** Enable/disable Phoenix for this project */
  enabled?: boolean;

  /** Data retention settings */
  retention?: {
    /** Days to retain traces (default: 30) */
    traces_days?: number;
    /** Days to retain experiments (default: 90) */
    experiments_days?: number;
  };
}

/**
 * Default config when .mastragen/config.yaml is missing
 */
export const MASTRAGEN_CONFIG_DEFAULTS: MastragenConfigFile = {
  version: "1",
  components: {
    phoenix: {
      enabled: false,
      retention: {
        traces_days: 30,
        experiments_days: 90,
      },
    },
    astro: {
      enabled: false,
    },
  },
};

// =============================================================================
// Environment Variables
// =============================================================================

/**
 * Phoenix-related environment variables injected into Mastra container.
 */
export interface PhoenixEnvironmentVariables {
  /** Master switch for Phoenix integration */
  PHOENIX_ENABLED: "true" | "false";

  /** Trace collector endpoint (Phoenix REST API) */
  PHOENIX_ENDPOINT: string;

  /** Optional API key for authenticated setups */
  PHOENIX_API_KEY?: string;

  /** Project name in Phoenix UI */
  PHOENIX_PROJECT_NAME: string;
}

/**
 * Default values for Phoenix environment variables.
 */
export const PHOENIX_ENV_DEFAULTS: Required<
  Omit<PhoenixEnvironmentVariables, "PHOENIX_API_KEY">
> = {
  PHOENIX_ENABLED: "false",
  PHOENIX_ENDPOINT: "http://phoenix:6006/v1/traces",
  PHOENIX_PROJECT_NAME: "mastragen-experiments",
};

// =============================================================================
// Service Configuration
// =============================================================================

/**
 * Phoenix container configuration for Docker Compose.
 */
export interface PhoenixDockerConfig {
  image: string;
  profile: string;
  ports: {
    http: number;
    otlp?: number;
  };
  environment: {
    PHOENIX_SQL_DATABASE_URL: string;
    PHOENIX_WORKING_DIR: string;
    PHOENIX_TRACE_RETENTION_DAYS?: number;
  };
  volumes: {
    data: string;
  };
  healthcheck: {
    endpoint: string;
    interval: string;
    timeout: string;
    retries: number;
  };
}

/**
 * Default Phoenix Docker configuration.
 */
export const PHOENIX_DOCKER_DEFAULTS: PhoenixDockerConfig = {
  image: "arizephoenix/phoenix:latest",
  profile: "phoenix",
  ports: {
    http: 6006,
    otlp: 4317,
  },
  environment: {
    PHOENIX_SQL_DATABASE_URL: "sqlite:////data/phoenix/phoenix.db",
    PHOENIX_WORKING_DIR: "/data/phoenix",
    PHOENIX_TRACE_RETENTION_DAYS: 30,
  },
  volumes: {
    data: "phoenix-data:/data/phoenix",
  },
  healthcheck: {
    endpoint: "http://localhost:6006/health",
    interval: "10s",
    timeout: "5s",
    retries: 5,
  },
};

/**
 * Phoenix Kubernetes resource configuration.
 */
export interface PhoenixK8sConfig {
  deployment: {
    replicas: number;
    resources: {
      requests: {
        memory: string;
        cpu: string;
      };
      limits: {
        memory: string;
        cpu: string;
      };
    };
  };
  service: {
    type: "ClusterIP" | "NodePort" | "LoadBalancer";
    ports: {
      http: number;
      otlp: number;
    };
  };
  pvc: {
    storage: string;
    storageClass?: string;
  };
}

/**
 * Default Phoenix Kubernetes configuration.
 */
export const PHOENIX_K8S_DEFAULTS: PhoenixK8sConfig = {
  deployment: {
    replicas: 1,
    resources: {
      requests: {
        memory: "512Mi",
        cpu: "250m",
      },
      limits: {
        memory: "2Gi",
        cpu: "1000m",
      },
    },
  },
  service: {
    type: "ClusterIP",
    ports: {
      http: 6006,
      otlp: 4317,
    },
  },
  pvc: {
    storage: "10Gi",
  },
};

// =============================================================================
// Service URLs
// =============================================================================

/**
 * Extension to ServiceUrls for Phoenix.
 */
export interface PhoenixServiceUrls {
  /** Phoenix UI URL (null if Phoenix not enabled) */
  phoenix: string | null;
}

// =============================================================================
// Telemetry Configuration
// =============================================================================

/**
 * Mastra observability configuration for Phoenix integration.
 */
export interface MastraObservabilityConfig {
  configs?: {
    arize?: {
      serviceName: string;
      exporter: {
        endpoint: string;
        apiKey?: string;
      };
    };
  };
}

/**
 * Build Mastra observability config from environment variables.
 */
export function buildObservabilityConfig(
  env: Partial<PhoenixEnvironmentVariables>
): MastraObservabilityConfig | undefined {
  if (env.PHOENIX_ENABLED !== "true") {
    return undefined;
  }

  return {
    configs: {
      arize: {
        serviceName:
          env.PHOENIX_PROJECT_NAME || PHOENIX_ENV_DEFAULTS.PHOENIX_PROJECT_NAME,
        exporter: {
          endpoint: env.PHOENIX_ENDPOINT || PHOENIX_ENV_DEFAULTS.PHOENIX_ENDPOINT,
          apiKey: env.PHOENIX_API_KEY,
        },
      },
    },
  };
}
