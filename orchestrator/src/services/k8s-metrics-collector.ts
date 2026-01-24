/**
 * K8sMetricsCollector - Kubernetes pod resource metrics collection (T041a)
 *
 * Collects CPU and memory usage for sandbox pods via the Kubernetes Metrics API.
 * Metrics are cached for 15 seconds to avoid API overload.
 *
 * Per specs/004-production-readiness/tasks.md T041a-b
 */

import type { PodMetrics } from './metrics-service.ts';

/**
 * Parse Kubernetes resource values (CPU in millicores, memory in bytes)
 */
export function parseResourceValue(value: string, type: 'cpu' | 'memory'): number {
  if (type === 'cpu') {
    // CPU values: "250m" (millicores) or "1" (cores)
    if (value.endsWith('m')) {
      return Number.parseInt(value.slice(0, -1), 10);
    }
    // Core to millicores
    return Math.round(Number.parseFloat(value) * 1000);
  }

  // Memory values: "256Mi", "1Gi", "512Ki", or raw bytes
  const memoryUnits: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
    Ti: 1024 * 1024 * 1024 * 1024,
    K: 1000,
    M: 1000 * 1000,
    G: 1000 * 1000 * 1000,
    T: 1000 * 1000 * 1000 * 1000,
  };

  for (const [suffix, multiplier] of Object.entries(memoryUnits)) {
    if (value.endsWith(suffix)) {
      return Math.round(Number.parseFloat(value.slice(0, -suffix.length)) * multiplier);
    }
  }

  // Raw bytes
  return Number.parseInt(value, 10);
}

interface PodMetricsItem {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  containers: Array<{
    name: string;
    usage: {
      cpu: string;
      memory: string;
    };
  }>;
}

interface MetricsApiResponse {
  items: PodMetricsItem[];
}

interface PodSpec {
  cpuLimit: string;
  memoryLimit: string;
}

export interface K8sMetricsCollectorOptions {
  /** Whether Kubernetes metrics collection is enabled */
  enabled: boolean;
  /** Mock function for metrics API (testing) */
  mockMetricsApi?: () => Promise<MetricsApiResponse>;
  /** Mock pod specs for resource limits (testing) */
  mockPodSpecs?: Map<string, PodSpec>;
  /** Cache duration in milliseconds (default: 15000) */
  cacheDurationMs?: number;
  /** Namespace to filter pods (default: all namespaces) */
  namespace?: string;
  /** Label selector for sandbox pods (default: app=mastragen-sandbox) */
  labelSelector?: string;
}

export class K8sMetricsCollector {
  private enabled: boolean;
  private mockMetricsApi?: () => Promise<MetricsApiResponse>;
  private mockPodSpecs?: Map<string, PodSpec>;
  private cacheDurationMs: number;
  private namespace?: string;
  private labelSelector: string;

  // Cache
  private cachedMetrics: PodMetrics[] = [];
  private cacheTimestamp = 0;

  // Kubernetes client (lazy initialized)
  private k8sApi: unknown | null = null;
  private metricsApi: unknown | null = null;

  constructor(options: K8sMetricsCollectorOptions) {
    this.enabled = options.enabled;
    this.mockMetricsApi = options.mockMetricsApi;
    this.mockPodSpecs = options.mockPodSpecs;
    this.cacheDurationMs = options.cacheDurationMs ?? 15000;
    this.namespace = options.namespace;
    this.labelSelector = options.labelSelector ?? 'app=mastragen-sandbox';
  }

  /**
   * Collect pod resource metrics.
   * Returns cached metrics if within cache window.
   */
  async collectPodMetrics(): Promise<PodMetrics[]> {
    if (!this.enabled) {
      return [];
    }

    // Check cache (cacheTimestamp > 0 means we have valid cached data)
    const now = Date.now();
    if (this.cacheTimestamp > 0 && now - this.cacheTimestamp < this.cacheDurationMs) {
      return this.cachedMetrics;
    }

    try {
      const metrics = await this.fetchMetrics();
      this.cachedMetrics = metrics;
      this.cacheTimestamp = now;
      return metrics;
    } catch (error) {
      console.error('Failed to collect K8s pod metrics:', error);
      return [];
    }
  }

  /**
   * Invalidate the metrics cache.
   */
  invalidateCache(): void {
    this.cacheTimestamp = 0;
    this.cachedMetrics = [];
  }

  private async fetchMetrics(): Promise<PodMetrics[]> {
    // Use mock API if provided (for testing)
    if (this.mockMetricsApi) {
      const response = await this.mockMetricsApi();
      return this.processMetricsResponse(response);
    }

    // Real Kubernetes API
    await this.initializeK8sClient();
    if (!this.metricsApi) {
      return [];
    }

    try {
      // Dynamic import to avoid issues when not in K8s
      const { Metrics } = await import('@kubernetes/client-node');
      const metricsClient = this.metricsApi as InstanceType<typeof Metrics>;

      const response = this.namespace
        ? await metricsClient.getPodMetrics(this.namespace)
        : await metricsClient.getPodMetrics();

      return this.processMetricsResponse(response as unknown as MetricsApiResponse);
    } catch (error) {
      console.error('K8s metrics API error:', error);
      return [];
    }
  }

  private async initializeK8sClient(): Promise<void> {
    if (this.k8sApi !== null) {
      return;
    }

    try {
      const k8s = await import('@kubernetes/client-node');
      const kc = new k8s.KubeConfig();

      // Try in-cluster config first, fall back to default
      try {
        kc.loadFromCluster();
      } catch {
        kc.loadFromDefault();
      }

      // Allow skipping TLS verification for development/minikube
      if (process.env.K8S_SKIP_TLS_VERIFY === 'true') {
        const cluster = kc.getCurrentCluster();
        if (cluster) {
          (cluster as { skipTLSVerify: boolean }).skipTLSVerify = true;
        }
      }

      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      this.metricsApi = new k8s.Metrics(kc);
    } catch (error) {
      console.warn('Failed to initialize K8s client:', error);
      this.k8sApi = undefined;
      this.metricsApi = undefined;
    }
  }

  private processMetricsResponse(response: MetricsApiResponse): PodMetrics[] {
    const results: PodMetrics[] = [];

    for (const item of response.items) {
      // Filter by label selector
      if (this.labelSelector && !this.matchesLabelSelector(item.metadata.labels)) {
        continue;
      }

      // Sum up container resources
      let totalCpuMillicores = 0;
      let totalMemoryBytes = 0;

      for (const container of item.containers) {
        totalCpuMillicores += parseResourceValue(container.usage.cpu, 'cpu');
        totalMemoryBytes += parseResourceValue(container.usage.memory, 'memory');
      }

      // Get resource limits for ratio calculation
      const limits = this.getPodLimits(item.metadata.name);
      const cpuLimitMillicores = parseResourceValue(limits.cpuLimit, 'cpu');
      const cpuRatio = cpuLimitMillicores > 0 ? totalCpuMillicores / cpuLimitMillicores : 0;

      results.push({
        pod: item.metadata.name,
        namespace: item.metadata.namespace,
        cpuRatio,
        memoryBytes: totalMemoryBytes,
      });
    }

    return results;
  }

  private matchesLabelSelector(labels?: Record<string, string>): boolean {
    if (!labels || !this.labelSelector) {
      return !this.labelSelector;
    }

    // Parse simple label selector (e.g., "app=mastragen-sandbox")
    const parts = this.labelSelector.split('=');
    if (parts.length !== 2) {
      return true;
    }

    const key = parts[0];
    const value = parts[1];
    return key !== undefined && labels[key] === value;
  }

  private getPodLimits(podName: string): PodSpec {
    // Use mock specs if provided (for testing)
    if (this.mockPodSpecs?.has(podName)) {
      return this.mockPodSpecs.get(podName)!;
    }

    // Default limits (should be fetched from actual pod specs in production)
    return {
      cpuLimit: '1000m',
      memoryLimit: '1Gi',
    };
  }
}

// Factory function for creating collector with auto-detection
export function createK8sMetricsCollector(): K8sMetricsCollector {
  // Check if running in Kubernetes
  const inCluster = process.env.KUBERNETES_SERVICE_HOST !== undefined;

  return new K8sMetricsCollector({
    enabled: inCluster,
    namespace: process.env.MASTRAGEN_NAMESPACE ?? 'mastragen',
  });
}
