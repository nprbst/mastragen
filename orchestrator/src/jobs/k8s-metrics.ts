/**
 * K8sMetricsJob - Background job for Kubernetes pod metrics collection (T041a-b)
 *
 * Periodically collects pod CPU/memory metrics and updates the MetricsService.
 * Runs every 15 seconds (matching the K8sMetricsCollector cache duration).
 */

import { createK8sMetricsCollector } from '../services/k8s-metrics-collector.ts';
import { getMetricsService } from '../services/metrics-service.ts';

export interface K8sMetricsScheduler {
  start(): void;
  stop(): void;
}

/**
 * Create a scheduler that periodically updates pod metrics in the MetricsService.
 */
export function createK8sMetricsScheduler(): K8sMetricsScheduler {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const collector = createK8sMetricsCollector();

  const collectAndUpdate = async () => {
    try {
      const metricsService = getMetricsService();
      if (!metricsService) {
        return;
      }

      const podMetrics = await collector.collectPodMetrics();
      metricsService.setPodMetrics(podMetrics);
    } catch (error) {
      console.error('K8s metrics collection failed:', error);
    }
  };

  return {
    start() {
      if (intervalId) {
        return; // Already running
      }

      console.log('Starting K8s metrics collector (T041a-b)');
      // Initial collection
      collectAndUpdate();
      // Collect every 15 seconds
      intervalId = setInterval(collectAndUpdate, 15000);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('Stopped K8s metrics collector');
      }
    },
  };
}
