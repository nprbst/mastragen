import { describe, expect, test, mock, beforeEach } from 'bun:test';

/**
 * T041a: Unit tests for K8sMetricsCollector
 *
 * Tests Kubernetes metrics collection:
 * 1. Collects CPU/memory for sandbox pods
 * 2. Caches metrics for 15 seconds
 * 3. Handles Kubernetes unavailability gracefully
 * 4. Filters pods by label selector
 */
describe('K8sMetricsCollector', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('collectPodMetrics', () => {
    test('should return empty array when not in Kubernetes cluster', async () => {
      const { K8sMetricsCollector } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      // Create collector without Kubernetes config (simulates local development)
      const collector = new K8sMetricsCollector({ enabled: false });
      const metrics = await collector.collectPodMetrics();

      expect(metrics).toHaveLength(0);
    });

    test('should collect metrics from mock Kubernetes API', async () => {
      const { K8sMetricsCollector } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      // Create mock metrics API response
      const mockMetricsResponse = {
        items: [
          {
            metadata: {
              name: 'sandbox-abc123',
              namespace: 'mastragen',
              labels: { app: 'mastragen-sandbox' },
            },
            containers: [
              {
                name: 'vscode',
                usage: {
                  cpu: '250m', // 250 millicores
                  memory: '256Mi', // 256 MiB
                },
              },
            ],
          },
          {
            metadata: {
              name: 'sandbox-def456',
              namespace: 'mastragen',
              labels: { app: 'mastragen-sandbox' },
            },
            containers: [
              {
                name: 'vscode',
                usage: {
                  cpu: '500m',
                  memory: '512Mi',
                },
              },
            ],
          },
        ],
      };

      // Mock pod specs for resource limits
      const mockPodSpecs = new Map([
        ['sandbox-abc123', { cpuLimit: '1000m', memoryLimit: '1Gi' }],
        ['sandbox-def456', { cpuLimit: '1000m', memoryLimit: '1Gi' }],
      ]);

      const collector = new K8sMetricsCollector({
        enabled: true,
        mockMetricsApi: async () => mockMetricsResponse,
        mockPodSpecs,
      });

      const metrics = await collector.collectPodMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics[0].pod).toBe('sandbox-abc123');
      expect(metrics[0].namespace).toBe('mastragen');
      expect(metrics[0].cpuRatio).toBeCloseTo(0.25, 2); // 250m / 1000m
      expect(metrics[0].memoryBytes).toBe(268435456); // 256 MiB in bytes

      expect(metrics[1].pod).toBe('sandbox-def456');
      expect(metrics[1].cpuRatio).toBeCloseTo(0.5, 2); // 500m / 1000m
      expect(metrics[1].memoryBytes).toBe(536870912); // 512 MiB in bytes
    });

    test('should cache metrics for 15 seconds', async () => {
      const { K8sMetricsCollector } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      let callCount = 0;
      const mockMetricsApi = async () => {
        callCount++;
        return { items: [] };
      };

      const collector = new K8sMetricsCollector({
        enabled: true,
        mockMetricsApi,
        cacheDurationMs: 15000,
      });

      // First call should hit the API
      await collector.collectPodMetrics();
      expect(callCount).toBe(1);

      // Second call within cache window should use cache
      await collector.collectPodMetrics();
      expect(callCount).toBe(1);

      // After invalidating cache, should hit API again
      collector.invalidateCache();
      await collector.collectPodMetrics();
      expect(callCount).toBe(2);
    });

    test('should handle API errors gracefully', async () => {
      const { K8sMetricsCollector } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      const mockMetricsApi = async () => {
        throw new Error('Metrics API unavailable');
      };

      const collector = new K8sMetricsCollector({
        enabled: true,
        mockMetricsApi,
      });

      const metrics = await collector.collectPodMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('parseResourceValue', () => {
    test('should parse CPU millicores', async () => {
      const { parseResourceValue } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      expect(parseResourceValue('100m', 'cpu')).toBe(100);
      expect(parseResourceValue('1000m', 'cpu')).toBe(1000);
      expect(parseResourceValue('500m', 'cpu')).toBe(500);
    });

    test('should parse CPU cores to millicores', async () => {
      const { parseResourceValue } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      expect(parseResourceValue('1', 'cpu')).toBe(1000);
      expect(parseResourceValue('2', 'cpu')).toBe(2000);
      expect(parseResourceValue('0.5', 'cpu')).toBe(500);
    });

    test('should parse memory in bytes', async () => {
      const { parseResourceValue } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      expect(parseResourceValue('256Mi', 'memory')).toBe(268435456);
      expect(parseResourceValue('1Gi', 'memory')).toBe(1073741824);
      expect(parseResourceValue('512Ki', 'memory')).toBe(524288);
    });

    test('should parse memory without suffix as bytes', async () => {
      const { parseResourceValue } = await import(
        '../../../src/services/k8s-metrics-collector.ts'
      );

      expect(parseResourceValue('1048576', 'memory')).toBe(1048576);
    });
  });
});
