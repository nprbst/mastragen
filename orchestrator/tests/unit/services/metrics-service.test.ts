import { describe, expect, test, mock, beforeEach } from 'bun:test';

/**
 * T048: Unit tests for MetricsService
 *
 * Tests Prometheus metrics collection:
 * 1. Session count gauges by project/state
 * 2. Session creation/suspension counters
 * 3. Alert fired counter
 * 4. Build info gauge
 * 5. Prometheus format output
 */
describe('MetricsService', () => {
  beforeEach(() => {
    mock.restore();
  });

  function createMockDb(options: {
    sessionCounts?: Array<{ project_id: string; state: string; count: number }>;
    alertCounts?: Array<{ condition_type: string; count: number }>;
  }) {
    const { sessionCounts = [], alertCounts = [] } = options;

    // Mock the Kysely fn helper
    const mockFn = {
      count: mock(() => ({
        as: mock(() => 'count'),
      })),
    };

    return {
      fn: mockFn,
      selectFrom: mock((table: string) => {
        if (table === 'sessions') {
          return {
            select: mock(() => ({
              groupBy: mock(() => ({
                execute: mock(() => Promise.resolve(sessionCounts)),
              })),
            })),
          };
        }
        if (table === 'alert_events') {
          return {
            innerJoin: mock(() => ({
              select: mock(() => ({
                groupBy: mock(() => ({
                  execute: mock(() => Promise.resolve(alertCounts)),
                })),
              })),
            })),
          };
        }
        return {
          select: mock(() => ({
            groupBy: mock(() => ({
              execute: mock(() => Promise.resolve([])),
            })),
          })),
        };
      }),
    };
  }

  describe('getSessionGauges', () => {
    test('should return session counts by project and state', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({
        sessionCounts: [
          { project_id: 'project-1', state: 'active', count: 5 },
          { project_id: 'project-1', state: 'suspended', count: 12 },
          { project_id: 'project-2', state: 'active', count: 3 },
        ],
      });

      const service = new MetricsService(mockDb as never);
      const gauges = await service.getSessionGauges();

      expect(gauges).toHaveLength(3);
      expect(gauges[0]).toEqual({
        projectId: 'project-1',
        state: 'active',
        count: 5,
      });
      expect(gauges[1]).toEqual({
        projectId: 'project-1',
        state: 'suspended',
        count: 12,
      });
    });

    test('should return empty array when no sessions exist', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({ sessionCounts: [] });

      const service = new MetricsService(mockDb as never);
      const gauges = await service.getSessionGauges();

      expect(gauges).toHaveLength(0);
    });
  });

  describe('incrementSessionCreation', () => {
    test('should increment creation counter for project', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      service.incrementSessionCreation('project-1');
      service.incrementSessionCreation('project-1');
      service.incrementSessionCreation('project-2');

      const counters = service.getSessionCreationCounters();
      expect(counters.get('project-1')).toBe(2);
      expect(counters.get('project-2')).toBe(1);
    });
  });

  describe('incrementSessionSuspension', () => {
    test('should increment suspension counter by project and reason', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      service.incrementSessionSuspension('project-1', 'manual');
      service.incrementSessionSuspension('project-1', 'auto');
      service.incrementSessionSuspension('project-1', 'manual');

      const counters = service.getSessionSuspensionCounters();
      expect(counters.get('project-1:manual')).toBe(2);
      expect(counters.get('project-1:auto')).toBe(1);
    });
  });

  describe('incrementAlertFired', () => {
    test('should increment alert counter by type', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      service.incrementAlertFired('pod_creation_failed');
      service.incrementAlertFired('tailscale_timeout');
      service.incrementAlertFired('pod_creation_failed');

      const counters = service.getAlertFiredCounters();
      expect(counters.get('pod_creation_failed')).toBe(2);
      expect(counters.get('tailscale_timeout')).toBe(1);
    });
  });

  describe('getBuildInfo', () => {
    test('should return build info with version and commit', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      const buildInfo = service.getBuildInfo();
      expect(buildInfo.version).toBeDefined();
      expect(buildInfo.commit).toBeDefined();
    });
  });

  describe('recordApiRequest', () => {
    test('should record request count by endpoint, method, and status', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      service.recordApiRequest('/api/sessions', 'POST', 201, 0.15);
      service.recordApiRequest('/api/sessions', 'GET', 200, 0.05);
      service.recordApiRequest('/api/sessions', 'POST', 201, 0.25);

      const counters = service.getApiRequestCounters();
      expect(counters.get('/api/sessions:POST:201')).toBe(2);
      expect(counters.get('/api/sessions:GET:200')).toBe(1);
    });

    test('should record request duration in histogram buckets', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      // Record requests with varying durations
      service.recordApiRequest('/api/sessions', 'POST', 201, 0.05); // < 0.1
      service.recordApiRequest('/api/sessions', 'POST', 201, 0.15); // < 0.5
      service.recordApiRequest('/api/sessions', 'POST', 201, 0.75); // < 1.0
      service.recordApiRequest('/api/sessions', 'POST', 201, 1.5); // > 1.0

      const histogram = service.getApiDurationHistogram('/api/sessions', 'POST');
      expect(histogram.buckets['0.1']).toBe(1);
      expect(histogram.buckets['0.5']).toBe(2);
      expect(histogram.buckets['1.0']).toBe(3);
      expect(histogram.buckets['+Inf']).toBe(4);
      expect(histogram.sum).toBeCloseTo(2.45, 2);
      expect(histogram.count).toBe(4);
    });
  });

  describe('formatPrometheus', () => {
    test('should format metrics in Prometheus text exposition format', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({
        sessionCounts: [
          { project_id: 'project-1', state: 'active', count: 5 },
          { project_id: 'project-1', state: 'suspended', count: 12 },
        ],
      });

      const service = new MetricsService(mockDb as never);
      service.incrementSessionCreation('project-1');
      service.incrementAlertFired('pod_creation_failed');

      const output = await service.formatPrometheus();

      // Check session gauge format
      expect(output).toContain('# HELP mastragen_sessions_total');
      expect(output).toContain('# TYPE mastragen_sessions_total gauge');
      expect(output).toContain('mastragen_sessions_total{project="project-1",state="active"} 5');
      expect(output).toContain(
        'mastragen_sessions_total{project="project-1",state="suspended"} 12'
      );

      // Check creation counter format
      expect(output).toContain('# HELP mastragen_session_creations_total');
      expect(output).toContain('# TYPE mastragen_session_creations_total counter');
      expect(output).toContain('mastragen_session_creations_total{project="project-1"} 1');

      // Check alert counter format
      expect(output).toContain('# HELP mastragen_alerts_fired_total');
      expect(output).toContain('# TYPE mastragen_alerts_fired_total counter');
      expect(output).toContain('mastragen_alerts_fired_total{type="pod_creation_failed"} 1');

      // Check build info format
      expect(output).toContain('# HELP mastragen_build_info');
      expect(output).toContain('# TYPE mastragen_build_info gauge');
      expect(output).toContain('mastragen_build_info{version=');
    });

    test('should include API request metrics', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({ sessionCounts: [] });
      const service = new MetricsService(mockDb as never);

      service.recordApiRequest('/api/sessions', 'POST', 201, 0.15);

      const output = await service.formatPrometheus();

      expect(output).toContain('# HELP mastragen_api_requests_total');
      expect(output).toContain('# TYPE mastragen_api_requests_total counter');
      expect(output).toContain(
        'mastragen_api_requests_total{endpoint="/api/sessions",method="POST",status="201"} 1'
      );

      expect(output).toContain('# HELP mastragen_api_request_duration_seconds');
      expect(output).toContain('# TYPE mastragen_api_request_duration_seconds histogram');
    });

    test('should include pod resource metrics when available', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({ sessionCounts: [] });
      const service = new MetricsService(mockDb as never);

      // Inject mock pod metrics
      service.setPodMetrics([
        { pod: 'sandbox-abc123', namespace: 'mastragen', cpuRatio: 0.25, memoryBytes: 268435456 },
        { pod: 'sandbox-def456', namespace: 'mastragen', cpuRatio: 0.5, memoryBytes: 536870912 },
      ]);

      const output = await service.formatPrometheus();

      // Check CPU gauge format
      expect(output).toContain('# HELP mastragen_pod_cpu_usage_ratio Pod CPU usage as ratio of limit');
      expect(output).toContain('# TYPE mastragen_pod_cpu_usage_ratio gauge');
      expect(output).toContain(
        'mastragen_pod_cpu_usage_ratio{pod="sandbox-abc123",namespace="mastragen"} 0.25'
      );
      expect(output).toContain(
        'mastragen_pod_cpu_usage_ratio{pod="sandbox-def456",namespace="mastragen"} 0.5'
      );

      // Check memory gauge format
      expect(output).toContain('# HELP mastragen_pod_memory_usage_bytes Pod memory usage in bytes');
      expect(output).toContain('# TYPE mastragen_pod_memory_usage_bytes gauge');
      expect(output).toContain(
        'mastragen_pod_memory_usage_bytes{pod="sandbox-abc123",namespace="mastragen"} 268435456'
      );
      expect(output).toContain(
        'mastragen_pod_memory_usage_bytes{pod="sandbox-def456",namespace="mastragen"} 536870912'
      );
    });
  });

  describe('Pod Resource Metrics (T041a-b)', () => {
    test('should store and retrieve pod metrics', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      const testMetrics = [
        { pod: 'sandbox-test1', namespace: 'mastragen', cpuRatio: 0.3, memoryBytes: 134217728 },
      ];

      service.setPodMetrics(testMetrics);
      const metrics = service.getPodMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.pod).toBe('sandbox-test1');
      expect(metrics[0]?.cpuRatio).toBe(0.3);
      expect(metrics[0]?.memoryBytes).toBe(134217728);
    });

    test('should return empty array when no pod metrics set', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      const metrics = service.getPodMetrics();
      expect(metrics).toHaveLength(0);
    });

    test('should clear pod metrics', async () => {
      const { MetricsService } = await import('../../../src/services/metrics-service.ts');

      const mockDb = createMockDb({});
      const service = new MetricsService(mockDb as never);

      service.setPodMetrics([
        { pod: 'sandbox-test', namespace: 'mastragen', cpuRatio: 0.5, memoryBytes: 1000 },
      ]);
      service.clearPodMetrics();

      const metrics = service.getPodMetrics();
      expect(metrics).toHaveLength(0);
    });
  });
});
