/**
 * K8sSandboxService - Kubernetes sandbox pod management (T095f-i)
 *
 * Creates and manages sandbox pods in Kubernetes with:
 * - Tailscale sidecar for networking
 * - Caddy sidecar for HTTPS termination
 * - Multiple containers (init, mastra, astro, vscode)
 * - Per-session ConfigMaps for dynamic Caddyfiles
 *
 * This is a Kubernetes-native alternative to the Docker-based SandboxService.
 */

import * as k8s from '@kubernetes/client-node';
import type { Session, Project } from '../db/types.ts';

/**
 * Check if an error from the k8s client is a 404 (Not Found) error.
 */
function isK8s404Error(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // Check for statusCode property (newer client versions)
    if ('statusCode' in error && error.statusCode === 404) {
      return true;
    }
    // Check for response.statusCode (some error wrappers)
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as { statusCode?: number };
      if (response.statusCode === 404) {
        return true;
      }
    }
  }
  return false;
}

export interface K8sSandboxConfig {
  /** Kubernetes namespace for sandbox pods */
  namespace: string;
  /** Tailscale tailnet name (e.g., "example" for example.ts.net) */
  tailnet: string;
  /** Environment name (e.g., "dev", "staging", "prod") */
  environment: string;
  /** Tailscale auth key secret reference */
  tailscaleSecretName: string;
  tailscaleSecretKey: string;
  /** Image registry prefix (e.g., "ghcr.io/nprbst") */
  imageRegistry: string;
  /** Image tag (e.g., "latest" or specific version) */
  imageTag: string;
  /** Image pull policy (e.g., "Always", "IfNotPresent", "Never") */
  imagePullPolicy: string;
}

export interface PodStatus {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  ready: boolean;
  tailscaleConnected: boolean;
  containerStatuses: Map<string, { ready: boolean; restartCount: number }>;
}

/**
 * Default ports for sandbox services
 */
const SANDBOX_PORTS = {
  mastra: 4111,
  astro: 4321,
  vscode: 8080,
  chrome: 3000,
} as const;

/**
 * Container images for sandbox pods
 */
const SANDBOX_IMAGES = {
  init: 'mastragen-init',
  mastra: 'mastragen-mastra',
  astro: 'mastragen-astro',
  vscode: 'mastragen-vscode',
  tailscale: 'tailscale/tailscale:latest',
  caddy: 'mastragen-caddy',
  chrome: 'ghcr.io/browserless/chromium:latest',
} as const;

export class K8sSandboxService {
  private coreApi: k8s.CoreV1Api;
  private config: K8sSandboxConfig;
  private kc: k8s.KubeConfig;

  constructor(config: K8sSandboxConfig) {
    this.config = config;
    this.kc = new k8s.KubeConfig();

    // Try in-cluster config first, fall back to default
    try {
      this.kc.loadFromCluster();
    } catch {
      this.kc.loadFromDefault();
    }

    // Allow skipping TLS verification for development/minikube
    if (process.env.K8S_SKIP_TLS_VERIFY === 'true') {
      const cluster = this.kc.getCurrentCluster();
      if (cluster) {
        (cluster as { skipTLSVerify: boolean }).skipTLSVerify = true;
      }
    }

    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * Create a sandbox pod for a session.
   * T095f: Creates pod with Caddy sidecar
   * T095g: Creates dynamic Caddyfile ConfigMap
   * T095h: Configures TS_PERMIT_CERT_UID=caddy
   * T095i: Configures Caddy for HTTPS on ports 4111, 4321, 8080
   */
  async createSandboxPod(
    session: Session,
    project: Project,
    envVars: Record<string, string> = {},
    claudeToken?: string
  ): Promise<void> {
    const configMapName = this.getConfigMapName(session.id);

    // Create Caddyfile ConfigMap first
    await this.createCaddyfileConfigMap(session, configMapName);

    // Create the pod
    const pod = this.buildPodSpec(session, project, configMapName, envVars, claudeToken);
    await this.coreApi.createNamespacedPod({ namespace: this.config.namespace, body: pod });
  }

  /**
   * Delete a sandbox pod and its ConfigMap.
   */
  async deleteSandboxPod(sessionId: string): Promise<void> {
    const podName = this.getPodName(sessionId);
    const configMapName = this.getConfigMapName(sessionId);

    // Delete pod
    try {
      await this.coreApi.deleteNamespacedPod({ name: podName, namespace: this.config.namespace });
    } catch (error) {
      // Ignore 404 errors (pod already deleted)
      if (!isK8s404Error(error)) {
        throw error;
      }
    }

    // Delete ConfigMap
    try {
      await this.coreApi.deleteNamespacedConfigMap({
        name: configMapName,
        namespace: this.config.namespace,
      });
    } catch (error) {
      // Ignore 404 errors
      if (!isK8s404Error(error)) {
        throw error;
      }
    }
  }

  /**
   * Get the status of a sandbox pod.
   */
  async getPodStatus(sessionId: string): Promise<PodStatus | null> {
    const podName = this.getPodName(sessionId);

    try {
      const response = await this.coreApi.readNamespacedPodStatus({
        name: podName,
        namespace: this.config.namespace,
      });
      const pod = response;

      const containerStatuses = new Map<string, { ready: boolean; restartCount: number }>();
      for (const status of pod.status?.containerStatuses ?? []) {
        if (status.name) {
          containerStatuses.set(status.name, {
            ready: status.ready ?? false,
            restartCount: status.restartCount ?? 0,
          });
        }
      }

      // Check if Tailscale is connected by looking at the tailscale container status
      const tailscaleStatus = containerStatuses.get('tailscale');
      const tailscaleConnected = tailscaleStatus?.ready ?? false;

      return {
        phase: (pod.status?.phase as PodStatus['phase']) ?? 'Unknown',
        ready: pod.status?.containerStatuses?.every((s) => s.ready) ?? false,
        tailscaleConnected,
        containerStatuses,
      };
    } catch (error) {
      if (isK8s404Error(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Wait for pod to be ready.
   */
  async waitForPodReady(sessionId: string, timeoutMs = 120000): Promise<boolean> {
    const startTime = Date.now();
    const pollIntervalMs = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getPodStatus(sessionId);
      if (status?.ready) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return false;
  }

  /**
   * Get the hostname for a sandbox session.
   * Format: {sessionId}-mastragen-{env}.{tailnet}.ts.net
   */
  getHostname(sessionId: string): string {
    const shortId = sessionId.slice(0, 8);
    return `${shortId}-mastragen-${this.config.environment}.${this.config.tailnet}.ts.net`;
  }

  /**
   * Get service URLs for a sandbox.
   * Uses port-based routing to avoid path prefix issues.
   */
  getServiceUrls(sessionId: string): { mastra: string; astro: string; vscode: string } {
    const hostname = this.getHostname(sessionId);
    return {
      mastra: `https://${hostname}:${SANDBOX_PORTS.mastra}`,
      astro: `https://${hostname}:${SANDBOX_PORTS.astro}`,
      vscode: `https://${hostname}`, // port 443 is implicit
    };
  }

  // Private methods

  private getPodName(sessionId: string): string {
    return `sandbox-${sessionId.slice(0, 12)}`;
  }

  private getConfigMapName(sessionId: string): string {
    return `sandbox-caddy-${sessionId.slice(0, 12)}`;
  }

  /**
   * T095g: Create dynamic Caddyfile ConfigMap for per-session proxy config
   * Uses port-based routing to avoid path prefix issues with apps
   */
  private async createCaddyfileConfigMap(session: Session, configMapName: string): Promise<void> {
    const hostname = this.getHostname(session.id);

    const caddyfile = `# Dynamic Caddyfile for session ${session.id}
# Generated by K8sSandboxService
# Port-based routing: each service on its native port

{
  # Enable Tailscale TLS certificate provisioning
  tailscale
}

# VS Code on default HTTPS port (443)
https://${hostname} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${SANDBOX_PORTS.vscode}
  log {
    output stdout
    format json
  }
}

# Mastra on port ${SANDBOX_PORTS.mastra}
https://${hostname}:${SANDBOX_PORTS.mastra} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${SANDBOX_PORTS.mastra}
}

# Astro on port ${SANDBOX_PORTS.astro}
https://${hostname}:${SANDBOX_PORTS.astro} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${SANDBOX_PORTS.astro}
}

# Chrome DevTools on port ${SANDBOX_PORTS.chrome}
https://${hostname}:${SANDBOX_PORTS.chrome} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${SANDBOX_PORTS.chrome}
}
`;

    const configMap: k8s.V1ConfigMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: configMapName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'mastragen-sandbox',
          'app.kubernetes.io/component': 'caddy-config',
          'mastragen.io/session-id': session.id,
        },
      },
      data: {
        Caddyfile: caddyfile,
      },
    };

    await this.coreApi.createNamespacedConfigMap({
      namespace: this.config.namespace,
      body: configMap,
    });
  }

  /**
   * Build the pod specification for a sandbox.
   */
  private buildPodSpec(
    session: Session,
    project: Project,
    configMapName: string,
    envVars: Record<string, string>,
    claudeToken?: string
  ): k8s.V1Pod {
    const podName = this.getPodName(session.id);
    const hostname = this.getHostname(session.id);

    // Base environment variables
    const baseEnv: k8s.V1EnvVar[] = [
      { name: 'SESSION_ID', value: session.id },
      { name: 'PROJECT_ID', value: project.id },
      { name: 'WORKSPACE_VOLUME', value: session.workspace_volume ?? undefined },
      ...Object.entries(envVars).map(([name, value]) => ({ name, value })),
    ];

    if (claudeToken) {
      baseEnv.push({ name: 'CLAUDE_TOKEN', value: claudeToken });
    }

    return {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'mastragen-sandbox',
          'app.kubernetes.io/instance': podName,
          'mastragen.io/session-id': session.id,
          'mastragen.io/project-id': project.id,
          app: 'mastragen-sandbox', // For metrics collection
        },
      },
      spec: {
        restartPolicy: 'Never',
        shareProcessNamespace: true,
        containers: [
          // VS Code server container
          {
            name: 'vscode',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.vscode}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            ports: [{ containerPort: SANDBOX_PORTS.vscode }],
            env: baseEnv,
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '2', memory: '4Gi' },
              requests: { cpu: '500m', memory: '1Gi' },
            },
          },
          // Mastra container
          {
            name: 'mastra',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.mastra}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            ports: [{ containerPort: SANDBOX_PORTS.mastra }],
            env: baseEnv,
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '1', memory: '2Gi' },
              requests: { cpu: '250m', memory: '512Mi' },
            },
          },
          // Astro preview container
          {
            name: 'astro',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.astro}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            ports: [{ containerPort: SANDBOX_PORTS.astro }],
            env: baseEnv,
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '500m', memory: '1Gi' },
              requests: { cpu: '100m', memory: '256Mi' },
            },
          },
          // Chrome DevTools container for browser automation
          {
            name: 'chrome',
            image: SANDBOX_IMAGES.chrome,
            ports: [{ containerPort: SANDBOX_PORTS.chrome }],
            env: [
              { name: 'CONNECTION_TIMEOUT', value: '300000' },
              { name: 'MAX_CONCURRENT_SESSIONS', value: '2' },
              { name: 'PREBOOT_CHROME', value: 'true' },
              { name: 'DEFAULT_LAUNCH_ARGS', value: '["--disable-dev-shm-usage"]' },
            ],
            resources: {
              limits: { cpu: '1', memory: '2Gi' },
              requests: { cpu: '500m', memory: '1Gi' },
            },
            readinessProbe: {
              httpGet: { path: '/health', port: SANDBOX_PORTS.chrome },
              initialDelaySeconds: 10,
              periodSeconds: 10,
            },
          },
          // T095f, T095h: Tailscale sidecar with TS_PERMIT_CERT_UID=caddy
          {
            name: 'tailscale',
            image: SANDBOX_IMAGES.tailscale,
            securityContext: {
              capabilities: { add: ['NET_ADMIN'] },
            },
            env: [
              {
                name: 'TS_AUTHKEY',
                valueFrom: {
                  secretKeyRef: {
                    name: this.config.tailscaleSecretName,
                    key: this.config.tailscaleSecretKey,
                  },
                },
              },
              { name: 'TS_KUBE_SECRET', value: '' },
              { name: 'TS_USERSPACE', value: 'false' },
              { name: 'TS_HOSTNAME', value: hostname.split('.')[0] }, // Just the prefix
              // T095h: Allow Caddy to fetch TLS certificates
              { name: 'TS_PERMIT_CERT_UID', value: 'caddy' },
            ],
            volumeMounts: [
              { name: 'tailscale-state', mountPath: '/var/lib/tailscale' },
              { name: 'tailscale-socket', mountPath: '/var/run/tailscale' },
            ],
            resources: {
              limits: { cpu: '100m', memory: '128Mi' },
              requests: { cpu: '50m', memory: '64Mi' },
            },
          },
          // T095f, T095i: Caddy sidecar for HTTPS termination (port-based routing)
          {
            name: 'caddy',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.caddy}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            securityContext: {
              runAsUser: 1000,
              runAsGroup: 1000,
            },
            ports: [
              { containerPort: 443, name: 'https' },
              { containerPort: SANDBOX_PORTS.mastra, name: 'mastra' },
              { containerPort: SANDBOX_PORTS.astro, name: 'astro' },
              { containerPort: SANDBOX_PORTS.chrome, name: 'chrome' },
            ],
            volumeMounts: [
              { name: 'caddy-config', mountPath: '/etc/caddy', readOnly: true },
              { name: 'tailscale-socket', mountPath: '/var/run/tailscale', readOnly: true },
            ],
            resources: {
              limits: { cpu: '100m', memory: '64Mi' },
              requests: { cpu: '50m', memory: '32Mi' },
            },
          },
        ],
        initContainers: [
          // Init container to prepare workspace
          {
            name: 'init',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.init}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            env: baseEnv,
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '500m', memory: '512Mi' },
              requests: { cpu: '100m', memory: '128Mi' },
            },
          },
        ],
        volumes: [
          // Workspace PVC (should be created separately)
          {
            name: 'workspace',
            persistentVolumeClaim: { claimName: `workspace-${session.id.slice(0, 12)}` },
          },
          // Tailscale state (ephemeral)
          { name: 'tailscale-state', emptyDir: {} },
          // Tailscale socket for Caddy to access
          { name: 'tailscale-socket', emptyDir: {} },
          // Caddy config from ConfigMap
          { name: 'caddy-config', configMap: { name: configMapName } },
        ],
      },
    };
  }
}

/**
 * Create a K8sSandboxService instance from environment variables.
 */
export function createK8sSandboxService(): K8sSandboxService | null {
  const namespace = process.env.MASTRAGEN_NAMESPACE;
  const tailnet = process.env.TAILSCALE_TAILNET;
  const environment = process.env.MASTRAGEN_ENVIRONMENT ?? 'dev';
  const imageRegistry = process.env.IMAGE_REGISTRY ?? 'ghcr.io/nprbst';
  const imageTag = process.env.IMAGE_TAG ?? 'latest';
  const imagePullPolicy = process.env.IMAGE_PULL_POLICY ?? 'IfNotPresent';

  if (!namespace || !tailnet) {
    console.warn('K8s sandbox service not configured (missing MASTRAGEN_NAMESPACE or TAILSCALE_TAILNET)');
    return null;
  }

  return new K8sSandboxService({
    namespace,
    tailnet,
    environment,
    tailscaleSecretName: process.env.TAILSCALE_SECRET_NAME ?? 'tailscale-auth',
    tailscaleSecretKey: process.env.TAILSCALE_SECRET_KEY ?? 'key',
    imageRegistry,
    imageTag,
    imagePullPolicy,
  });
}
