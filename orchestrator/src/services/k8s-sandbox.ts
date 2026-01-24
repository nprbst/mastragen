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
import * as tar from 'tar-stream';
import type { Session, Project } from '../db/types.ts';
import type { ClaudeInjectionService } from './claude-injection.ts';
import { getTailscaleService } from './tailscale.ts';

/**
 * Configuration for Claude config injection.
 */
export interface ClaudeConfigInjectionConfig {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
  sessionToken?: string;
  chromeMode?: 'sidecar' | 'local';
  userTailscaleHostname?: string;
}

/**
 * Check if an error from the k8s client is a 404 (Not Found) error.
 */
function isK8s404Error(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // Check for code property (ApiException from k8s client)
    if ('code' in error && error.code === 404) {
      return true;
    }
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
  /** Whether to include Chrome container in sandbox pods */
  chromeEnabled: boolean;
}

export interface PodStatus {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  ready: boolean;
  tailscaleConnected: boolean;
  containerStatuses: Map<string, { ready: boolean; restartCount: number }>;
}

/**
 * Container status for CLI progress display.
 */
export interface ContainerStatus {
  name: string;
  ready: boolean;
  status: 'waiting' | 'running' | 'terminated';
  message?: string;
}

/**
 * Session status for CLI progress display.
 * Provides granular feedback during pod startup.
 */
export interface SessionStatus {
  phase: 'creating' | 'initializing' | 'starting' | 'ready' | 'error';
  message: string;
  containers: ContainerStatus[];
  tailscale?: {
    ready: boolean;
    hostname?: string;
  };
}

/**
 * External ports exposed by Caddy (what users connect to)
 */
const SANDBOX_PORTS = {
  mastra: 4111,
  astro: 4321,
  vscode: 8080,
  chrome: 3000,
  phoenix: 6006,
} as const;

/**
 * Internal ports for app containers (Caddy proxies to these)
 * Different from external ports because containers share network namespace in a pod
 */
const INTERNAL_PORTS = {
  mastra: 14111,
  astro: 14321,
  vscode: 18080,
  chrome: 3000, // Chrome uses same port (Caddy doesn't proxy to it, just passes through)
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
    claudeToken?: string,
    claudeConfigMapName?: string
  ): Promise<void> {
    const configMapName = this.getConfigMapName(session.id);

    // Create all PVCs first (idempotent, supports resume)
    await this.createWorkspacePVC(session.id);
    await this.createTailscalePVC(session.id);
    await this.createCaddyPVC(session.id);

    // Create Caddyfile ConfigMap
    await this.createCaddyfileConfigMap(session, configMapName);

    // Create the pod
    const pod = this.buildPodSpec(session, project, configMapName, envVars, claudeToken, claudeConfigMapName);
    await this.coreApi.createNamespacedPod({ namespace: this.config.namespace, body: pod });
  }

  /**
   * Delete a sandbox pod and its resources.
   * @param sessionId - The session ID
   * @param options.keepPVC - If true, keep all PVCs for resume (default: false)
   */
  async deleteSandboxPod(sessionId: string, options?: { keepPVC?: boolean }): Promise<void> {
    const podName = this.getPodName(sessionId);
    const caddyConfigMapName = this.getConfigMapName(sessionId);
    const claudeConfigMapName = this.getClaudeConfigMapName(sessionId);
    const workspacePvcName = `workspace-${sessionId.slice(0, 12).toLowerCase()}`;
    const tailscalePvcName = this.getTailscalePvcName(sessionId);
    const caddyPvcName = this.getCaddyPvcName(sessionId);

    // Delete pod
    try {
      console.log(`[K8sSandboxService] Deleting pod ${podName}`);
      await this.coreApi.deleteNamespacedPod({ name: podName, namespace: this.config.namespace });
    } catch (error) {
      // Ignore 404 errors (pod already deleted)
      if (!isK8s404Error(error)) {
        throw error;
      }
    }

    // Delete Caddy ConfigMap
    try {
      console.log(`[K8sSandboxService] Deleting ConfigMap ${caddyConfigMapName}`);
      await this.coreApi.deleteNamespacedConfigMap({
        name: caddyConfigMapName,
        namespace: this.config.namespace,
      });
    } catch (error) {
      // Ignore 404 errors
      if (!isK8s404Error(error)) {
        throw error;
      }
    }

    // Delete Claude ConfigMap
    try {
      console.log(`[K8sSandboxService] Deleting ConfigMap ${claudeConfigMapName}`);
      await this.coreApi.deleteNamespacedConfigMap({
        name: claudeConfigMapName,
        namespace: this.config.namespace,
      });
    } catch (error) {
      // Ignore 404 errors
      if (!isK8s404Error(error)) {
        throw error;
      }
    }

    // Delete PVCs unless keepPVC is true (for suspend/resume)
    if (!options?.keepPVC) {
      await this.deletePVC(workspacePvcName);
      await this.deletePVC(tailscalePvcName);
      await this.deletePVC(caddyPvcName);
    } else {
      console.log(`[K8sSandboxService] Keeping PVCs for resume: ${workspacePvcName}, ${tailscalePvcName}, ${caddyPvcName}`);
    }
  }

  /**
   * Delete a PVC by name, ignoring 404 errors.
   */
  private async deletePVC(name: string): Promise<void> {
    try {
      console.log(`[K8sSandboxService] Deleting PVC ${name}`);
      await this.coreApi.deleteNamespacedPersistentVolumeClaim({
        name,
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
   * Deregister a session's Tailscale device from the tailnet.
   * Called during permanent cleanup (not suspend) to prevent orphaned devices.
   */
  async deregisterTailscaleDevice(sessionId: string): Promise<boolean> {
    const hostname = this.getHostname(sessionId);
    const tailscaleService = getTailscaleService();

    if (!tailscaleService.isConfigured()) {
      console.log(
        `[K8sSandboxService] Tailscale not configured, skipping deregistration for ${hostname}`
      );
      return true;
    }

    console.log(`[K8sSandboxService] Deregistering Tailscale device: ${hostname}`);

    try {
      const device = await tailscaleService.findDevice(hostname);
      if (!device) {
        console.log(`[K8sSandboxService] Tailscale device not found: ${hostname}`);
        return true; // Already gone
      }

      const deleted = await tailscaleService.deleteDevice(device.id);
      if (deleted) {
        console.log(`[K8sSandboxService] Tailscale device deleted: ${hostname} (${device.id})`);
      } else {
        console.warn(
          `[K8sSandboxService] Failed to delete Tailscale device: ${hostname} (${device.id})`
        );
      }
      return deleted;
    } catch (error) {
      console.error(`[K8sSandboxService] Error deregistering Tailscale device ${hostname}:`, error);
      return false;
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
   * Get detailed session status for CLI progress display.
   * Returns granular container status and phase information.
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
    const podName = this.getPodName(sessionId);
    const hostname = this.getHostname(sessionId);

    try {
      const response = await this.coreApi.readNamespacedPodStatus({
        name: podName,
        namespace: this.config.namespace,
      });
      const pod = response;

      // Build container statuses
      const containers: ContainerStatus[] = [];

      // Process init containers first
      for (const status of pod.status?.initContainerStatuses ?? []) {
        if (!status.name) continue;
        const cs: ContainerStatus = {
          name: status.name,
          ready: status.ready ?? false,
          status: 'waiting',
        };
        if (status.state?.running) {
          cs.status = 'running';
          cs.message = 'Running...';
        } else if (status.state?.terminated) {
          cs.status = 'terminated';
          cs.ready = status.state.terminated.exitCode === 0;
          cs.message = cs.ready ? 'Completed' : `Failed: ${status.state.terminated.reason}`;
        } else if (status.state?.waiting) {
          cs.status = 'waiting';
          cs.message = status.state.waiting.reason || 'Waiting...';
        }
        containers.push(cs);
      }

      // Process main containers
      for (const status of pod.status?.containerStatuses ?? []) {
        if (!status.name) continue;
        const cs: ContainerStatus = {
          name: status.name,
          ready: status.ready ?? false,
          status: 'waiting',
        };
        if (status.state?.running) {
          cs.status = 'running';
          cs.message = status.ready ? 'Ready' : 'Starting...';
        } else if (status.state?.terminated) {
          cs.status = 'terminated';
          cs.message = `Exited: ${status.state.terminated.reason || status.state.terminated.exitCode}`;
        } else if (status.state?.waiting) {
          cs.status = 'waiting';
          cs.message = status.state.waiting.reason || 'Waiting...';
        }
        containers.push(cs);
      }

      // Determine overall phase and message
      const podPhase = pod.status?.phase;
      const initComplete = (pod.status?.initContainerStatuses ?? []).every(
        (s) => s.state?.terminated?.exitCode === 0
      );
      const allReady = (pod.status?.containerStatuses ?? []).every((s) => s.ready);
      const tailscaleReady = containers.find((c) => c.name === 'tailscale')?.ready ?? false;

      let phase: SessionStatus['phase'];
      let message: string;

      if (podPhase === 'Pending') {
        const initRunning = (pod.status?.initContainerStatuses ?? []).some((s) => s.state?.running);
        if (initRunning) {
          phase = 'initializing';
          message = 'Cloning repository...';
        } else {
          phase = 'creating';
          message = 'Creating pod...';
        }
      } else if (podPhase === 'Running') {
        if (allReady) {
          phase = 'ready';
          message = 'All services started';
        } else if (!tailscaleReady) {
          phase = 'starting';
          message = 'Connecting to Tailscale...';
        } else if (!initComplete) {
          phase = 'initializing';
          message = 'Waiting for init...';
        } else {
          phase = 'starting';
          message = 'Starting services...';
        }
      } else if (podPhase === 'Failed' || podPhase === 'Unknown') {
        phase = 'error';
        message = pod.status?.message || `Pod ${podPhase?.toLowerCase()}`;
      } else {
        phase = 'starting';
        message = `Pod phase: ${podPhase}`;
      }

      return {
        phase,
        message,
        containers,
        tailscale: {
          ready: tailscaleReady,
          hostname: tailscaleReady ? hostname : undefined,
        },
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
   * Note: tailnet is normalized at initialization (without .ts.net suffix)
   */
  getHostname(sessionId: string): string {
    const shortId = sessionId.slice(0, 8).toLowerCase();
    return `${shortId}-mastragen-${this.config.environment}.${this.config.tailnet}.ts.net`;
  }

  /**
   * Get service URLs for a sandbox.
   * Uses port-based routing to avoid path prefix issues.
   */
  getServiceUrls(sessionId: string): { mastra: string; astro: string; vscode: string; phoenix: string | null } {
    const hostname = this.getHostname(sessionId);
    return {
      mastra: `https://${hostname}:${SANDBOX_PORTS.mastra}`,
      astro: `https://${hostname}:${SANDBOX_PORTS.astro}`,
      vscode: `https://${hostname}`, // port 443 is implicit
      phoenix: null, // Set when Phoenix is enabled via project config
    };
  }

  /**
   * Create workspace PVC for a session.
   * Idempotent - does nothing if PVC already exists (for resume).
   * Must be called before createSandboxPod().
   */
  async createWorkspacePVC(sessionId: string): Promise<void> {
    const pvcName = `workspace-${sessionId.slice(0, 12).toLowerCase()}`;

    // Check if PVC already exists (resume case)
    try {
      await this.coreApi.readNamespacedPersistentVolumeClaim({
        name: pvcName,
        namespace: this.config.namespace,
      });
      console.log(`[K8sSandboxService] PVC ${pvcName} already exists (resume)`);
      return;
    } catch (error) {
      if (!isK8s404Error(error)) {
        throw error;
      }
      // PVC doesn't exist, create it
    }

    const pvc: k8s.V1PersistentVolumeClaim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: pvcName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'mastragen-sandbox',
          'mastragen.io/session-id': sessionId,
        },
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '10Gi',
          },
        },
      },
    };

    console.log(`[K8sSandboxService] Creating PVC ${pvcName}`);
    await this.coreApi.createNamespacedPersistentVolumeClaim({
      namespace: this.config.namespace,
      body: pvc,
    });
  }

  /**
   * Create Tailscale state PVC for a session.
   * Preserves device identity across suspend/resume (stable hostname).
   * Idempotent - does nothing if PVC already exists.
   */
  async createTailscalePVC(sessionId: string): Promise<void> {
    const pvcName = this.getTailscalePvcName(sessionId);

    // Check if PVC already exists (resume case)
    try {
      await this.coreApi.readNamespacedPersistentVolumeClaim({
        name: pvcName,
        namespace: this.config.namespace,
      });
      console.log(`[K8sSandboxService] Tailscale PVC ${pvcName} already exists (resume)`);
      return;
    } catch (error) {
      if (!isK8s404Error(error)) {
        throw error;
      }
      // PVC doesn't exist, create it
    }

    const pvc: k8s.V1PersistentVolumeClaim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: pvcName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'mastragen-sandbox',
          'app.kubernetes.io/component': 'tailscale',
          'mastragen.io/session-id': sessionId,
        },
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '100Mi',
          },
        },
      },
    };

    console.log(`[K8sSandboxService] Creating Tailscale PVC ${pvcName}`);
    await this.coreApi.createNamespacedPersistentVolumeClaim({
      namespace: this.config.namespace,
      body: pvc,
    });
  }

  /**
   * Create Caddy data PVC for a session.
   * Caches TLS certificates to avoid rate limits.
   * Idempotent - does nothing if PVC already exists.
   */
  async createCaddyPVC(sessionId: string): Promise<void> {
    const pvcName = this.getCaddyPvcName(sessionId);

    // Check if PVC already exists (resume case)
    try {
      await this.coreApi.readNamespacedPersistentVolumeClaim({
        name: pvcName,
        namespace: this.config.namespace,
      });
      console.log(`[K8sSandboxService] Caddy PVC ${pvcName} already exists (resume)`);
      return;
    } catch (error) {
      if (!isK8s404Error(error)) {
        throw error;
      }
      // PVC doesn't exist, create it
    }

    const pvc: k8s.V1PersistentVolumeClaim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: pvcName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'mastragen-sandbox',
          'app.kubernetes.io/component': 'caddy',
          'mastragen.io/session-id': sessionId,
        },
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '50Mi',
          },
        },
      },
    };

    console.log(`[K8sSandboxService] Creating Caddy PVC ${pvcName}`);
    await this.coreApi.createNamespacedPersistentVolumeClaim({
      namespace: this.config.namespace,
      body: pvc,
    });
  }

  // Private methods

  private getPodName(sessionId: string): string {
    return `sandbox-${sessionId.slice(0, 12).toLowerCase()}`;
  }

  private getConfigMapName(sessionId: string): string {
    return `sandbox-caddy-${sessionId.slice(0, 12).toLowerCase()}`;
  }

  private getClaudeConfigMapName(sessionId: string): string {
    return `sandbox-claude-${sessionId.slice(0, 12).toLowerCase()}`;
  }

  private getTailscalePvcName(sessionId: string): string {
    return `tailscale-${sessionId.slice(0, 12).toLowerCase()}`;
  }

  private getCaddyPvcName(sessionId: string): string {
    return `caddy-${sessionId.slice(0, 12).toLowerCase()}`;
  }

  /**
   * T095g: Create dynamic Caddyfile ConfigMap for per-session proxy config
   * Uses port-based routing to avoid path prefix issues with apps
   */
  private async createCaddyfileConfigMap(session: Session, configMapName: string): Promise<void> {
    const hostname = this.getHostname(session.id);

    const caddyfile = `# Dynamic Caddyfile for session ${session.id}
# Generated by K8sSandboxService
# Caddy listens on external ports, proxies to internal app ports

{
  # Enable Tailscale TLS certificate provisioning
  tailscale
}

# VS Code on default HTTPS port (443) -> internal ${INTERNAL_PORTS.vscode}
https://${hostname} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${INTERNAL_PORTS.vscode}
  log {
    output stdout
    format json
  }
}

# Mastra on port ${SANDBOX_PORTS.mastra} -> internal ${INTERNAL_PORTS.mastra}
https://${hostname}:${SANDBOX_PORTS.mastra} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${INTERNAL_PORTS.mastra}
}

# Astro on port ${SANDBOX_PORTS.astro} -> internal ${INTERNAL_PORTS.astro}
https://${hostname}:${SANDBOX_PORTS.astro} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${INTERNAL_PORTS.astro}
}

# Chrome DevTools on port ${SANDBOX_PORTS.chrome} -> internal ${INTERNAL_PORTS.chrome}
https://${hostname}:${SANDBOX_PORTS.chrome} {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:${INTERNAL_PORTS.chrome}
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
   * Creates a ConfigMap containing a tar archive of all Claude config files.
   * The archive preserves directory structure for multi-file skills.
   */
  async createClaudeConfigMap(
    session: Session,
    _project: Project,
    claudeInjectionService: ClaudeInjectionService,
    config: ClaudeConfigInjectionConfig
  ): Promise<string> {
    const configMapName = this.getClaudeConfigMapName(session.id);

    console.log(`[K8sSandboxService] Creating Claude config ConfigMap ${configMapName}...`);

    // Generate all config content
    const settings = await claudeInjectionService.generateSettings({
      projectId: config.projectId,
      environment: config.environment,
      sessionId: config.sessionId,
      chromeMode: config.chromeMode,
      userTailscaleHostname: config.userTailscaleHostname,
    });

    const claudeMd = await claudeInjectionService.generateClaudeMd({
      projectId: config.projectId,
      environment: config.environment,
      sessionId: config.sessionId,
      chromeMode: config.chromeMode,
      userTailscaleHostname: config.userTailscaleHostname,
    });

    const builtinCommands = await claudeInjectionService.getBuiltinCommands();
    const projectCommands = await claudeInjectionService.getCommands({
      projectId: config.projectId,
      environment: config.environment,
    });
    const builtinSkills = await claudeInjectionService.getBuiltinSkills();
    const envVars = await claudeInjectionService.getSessionEnvVars({
      projectId: config.projectId,
      environment: config.environment,
      sessionId: config.sessionId,
      userId: config.userId ?? '',
      sessionToken: config.sessionToken,
    });

    // Build tar archive
    const { mcpServers, ...settingsWithoutMcp } = settings;
    const tarBase64 = await this.buildClaudeConfigTar({
      settingsJson: JSON.stringify(settingsWithoutMcp, null, 2),
      claudeJson: JSON.stringify({ mcpServers }, null, 2),
      claudeMd,
      envSh: Object.entries(envVars)
        .map(([k, v]) => `export ${k}="${v}"`)
        .join('\n'),
      commands: [...builtinCommands, ...projectCommands],
      skills: builtinSkills,
    });

    // Create ConfigMap with tar archive
    await this.coreApi.createNamespacedConfigMap({
      namespace: this.config.namespace,
      body: {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: configMapName,
          namespace: this.config.namespace,
          labels: {
            'app.kubernetes.io/name': 'mastragen-sandbox',
            'app.kubernetes.io/component': 'claude-config',
            'mastragen.io/session-id': session.id,
          },
        },
        binaryData: {
          'claude-config.tar.gz': tarBase64,
        },
      },
    });

    console.log(`[K8sSandboxService] Created Claude config ConfigMap ${configMapName}`);
    return configMapName;
  }

  /**
   * Build a gzipped tar archive of Claude config files.
   * Returns base64-encoded string for ConfigMap binaryData.
   */
  private async buildClaudeConfigTar(config: {
    settingsJson: string;
    claudeJson: string;
    claudeMd: string;
    envSh: string;
    commands: Array<{ name: string; content: string }>;
    skills: Array<{ name: string; content: string }>;
  }): Promise<string> {
    const pack = tar.pack();
    const chunks: Buffer[] = [];

    // .claude/settings.json
    pack.entry({ name: '.claude/settings.json' }, config.settingsJson);

    // .claude.json (in home dir root)
    pack.entry({ name: '.claude.json' }, config.claudeJson);

    // .claude/CLAUDE.md
    pack.entry({ name: '.claude/CLAUDE.md' }, config.claudeMd);

    // .claude/env.sh
    pack.entry({ name: '.claude/env.sh' }, config.envSh);

    // .claude/commands/*.md
    for (const cmd of config.commands) {
      pack.entry({ name: `.claude/commands/${cmd.name}.md` }, cmd.content);
    }

    // .claude/skills/{name}/SKILL.md
    for (const skill of config.skills) {
      pack.entry({ name: `.claude/skills/${skill.name}/SKILL.md` }, skill.content);
    }

    pack.finalize();

    // Collect chunks from the tar stream
    for await (const chunk of pack) {
      chunks.push(chunk);
    }
    const tarBuffer = Buffer.concat(chunks);
    const gzipped = Bun.gzipSync(tarBuffer);

    return Buffer.from(gzipped).toString('base64');
  }

  /**
   * Build the pod specification for a sandbox.
   */
  private buildPodSpec(
    session: Session,
    project: Project,
    configMapName: string,
    envVars: Record<string, string>,
    claudeToken?: string,
    claudeConfigMapName?: string
  ): k8s.V1Pod {
    const podName = this.getPodName(session.id);
    const hostname = this.getHostname(session.id);

    // Base environment variables (shared by all containers)
    const baseEnv: k8s.V1EnvVar[] = [
      { name: 'SESSION_ID', value: session.id },
      { name: 'PROJECT_ID', value: project.id },
      { name: 'WORKSPACE_VOLUME', value: session.workspace_volume ?? undefined },
      { name: 'GITHUB_REPO', value: project.github_repo },
      ...(session.branch_name ? [{ name: 'BRANCH', value: session.branch_name }] : []),
      ...Object.entries(envVars).map(([name, value]) => ({ name, value })),
    ];

    if (claudeToken) {
      baseEnv.push({ name: 'CLAUDE_CODE_OAUTH_TOKEN', value: claudeToken });
    }

    // Container-specific environment variables
    // Mastra SDK needs actual API key, VSCode Claude Code extension uses OAuth token
    const mastraEnv: k8s.V1EnvVar[] = [
      ...baseEnv,
      ...(process.env.ANTHROPIC_API_KEY ? [{ name: 'ANTHROPIC_API_KEY', value: process.env.ANTHROPIC_API_KEY }] : []),
    ];

    const vscodeEnv: k8s.V1EnvVar[] = [
      ...baseEnv,
      ...(claudeToken ? [{ name: 'ANTHROPIC_API_KEY', value: claudeToken }] : []),
    ];

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
          // VS Code server container (internal port, Caddy proxies external)
          {
            name: 'vscode',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.vscode}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            env: [
              ...vscodeEnv, // Includes OAuth token as ANTHROPIC_API_KEY for Claude Code extension
              { name: 'CODE_SERVER_PORT', value: String(INTERNAL_PORTS.vscode) },
              // SimpleBrowser preview URL for Astro (via Tailscale HTTPS)
              { name: 'ASTRO_PREVIEW_URL', value: `https://${hostname}:${SANDBOX_PORTS.astro}` },
            ],
            volumeMounts: [
              { name: 'workspace', mountPath: '/workspace' },
              // Claude config from ConfigMap (K8s mode)
              ...(claudeConfigMapName
                ? [{ name: 'claude-config', mountPath: '/home/coder/.claude-init', readOnly: true }]
                : []),
            ],
            resources: {
              limits: { cpu: '2', memory: '4Gi' },
              requests: { cpu: '500m', memory: '1Gi' },
            },
          },
          // Mastra container (internal port, Caddy proxies external)
          {
            name: 'mastra',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.mastra}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            env: [
              ...mastraEnv, // Includes actual API key from process.env for Mastra SDK
              { name: 'MASTRA_PORT', value: String(INTERNAL_PORTS.mastra) },
            ],
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '1', memory: '2Gi' },
              requests: { cpu: '250m', memory: '512Mi' },
            },
          },
          // Astro preview container (internal port, Caddy proxies external)
          {
            name: 'astro',
            image: `${this.config.imageRegistry}/${SANDBOX_IMAGES.astro}:${this.config.imageTag}`,
            imagePullPolicy: this.config.imagePullPolicy,
            env: [
              ...baseEnv,
              { name: 'ASTRO_PORT', value: String(INTERNAL_PORTS.astro) },
            ],
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
            resources: {
              limits: { cpu: '500m', memory: '1Gi' },
              requests: { cpu: '100m', memory: '256Mi' },
            },
          },
          // Chrome DevTools container for browser automation (optional)
          ...(this.config.chromeEnabled
            ? [
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
            ]
            : []),
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
              { name: 'TS_STATE_DIR', value: '/var/lib/tailscale' },
              { name: 'TS_USERSPACE', value: 'false' },
              { name: 'TS_HOSTNAME', value: hostname.split('.')[0] }, // Just the prefix
              // T095h: Allow Caddy to fetch TLS certificates
              { name: 'TS_PERMIT_CERT_UID', value: '1000' }, // Must match Caddy's runAsUser
              // Put socket directly in shared volume (not a symlink to /tmp)
              { name: 'TS_SOCKET', value: '/var/run/tailscale/tailscaled.sock' },
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
              { name: 'caddy-data', mountPath: '/data/caddy' },
              { name: 'caddy-config-data', mountPath: '/config/caddy' },
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
          // Workspace PVC (created via createWorkspacePVC)
          {
            name: 'workspace',
            persistentVolumeClaim: { claimName: `workspace-${session.id.slice(0, 12).toLowerCase()}` },
          },
          // Tailscale state PVC (preserves identity across suspend/resume)
          {
            name: 'tailscale-state',
            persistentVolumeClaim: { claimName: `tailscale-${session.id.slice(0, 12).toLowerCase()}` },
          },
          // Tailscale socket for Caddy to access (IPC, ephemeral)
          { name: 'tailscale-socket', emptyDir: {} },
          // Caddy config from ConfigMap
          { name: 'caddy-config', configMap: { name: configMapName } },
          // Caddy data PVC (caches TLS certificates)
          {
            name: 'caddy-data',
            persistentVolumeClaim: { claimName: `caddy-${session.id.slice(0, 12).toLowerCase()}` },
          },
          // Caddy config-data (autosave.json, ephemeral)
          { name: 'caddy-config-data', emptyDir: {} },
          // Claude config from ConfigMap (K8s mode)
          ...(claudeConfigMapName
            ? [{ name: 'claude-config', configMap: { name: claudeConfigMapName } }]
            : []),
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
  // Normalize tailnet by stripping .ts.net suffix if present (like orchestrator's TS_HOSTNAME)
  const tailnet = process.env.TAILSCALE_TAILNET?.replace(/\.ts\.net$/, '');
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
    chromeEnabled: process.env.SANDBOX_CHROME_ENABLED !== 'false',
  });
}
