/**
 * MetricsService - Prometheus-compatible metrics collection
 *
 * Collects and exposes platform metrics:
 * - Session counts by project/state (gauge)
 * - Session creation/suspension counters
 * - Alert fired counter
 * - API request count and duration histogram
 * - Build info
 *
 * Per specs/004-production-readiness/contracts/metrics.md
 */
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';

export interface SessionGauge {
  projectId: string;
  state: string;
  count: number;
}

export interface BuildInfo {
  version: string;
  commit: string;
}

export interface DurationHistogram {
  buckets: Record<string, number>;
  sum: number;
  count: number;
}

// Histogram bucket boundaries in seconds
const HISTOGRAM_BUCKETS = [
  { value: 0.1, label: '0.1' },
  { value: 0.5, label: '0.5' },
  { value: 1.0, label: '1.0' },
];

export class MetricsService {
  private db: Kysely<Database>;

  // In-memory counters (reset on restart, but persist during runtime)
  private sessionCreationCounters = new Map<string, number>();
  private sessionSuspensionCounters = new Map<string, number>();
  private alertFiredCounters = new Map<string, number>();
  private apiRequestCounters = new Map<string, number>();
  private apiDurationHistograms = new Map<
    string,
    { buckets: Map<string, number>; sum: number; count: number }
  >();

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  /**
   * Get current session counts grouped by project and state.
   */
  async getSessionGauges(): Promise<SessionGauge[]> {
    const results = await this.db
      .selectFrom('sessions')
      .select(['project_id', 'state', this.db.fn.count<number>('id').as('count')])
      .groupBy(['project_id', 'state'])
      .execute();

    return results.map((row) => ({
      projectId: row.project_id,
      state: row.state,
      count: Number(row.count),
    }));
  }

  /**
   * Increment session creation counter for a project.
   */
  incrementSessionCreation(projectId: string): void {
    const current = this.sessionCreationCounters.get(projectId) ?? 0;
    this.sessionCreationCounters.set(projectId, current + 1);
  }

  /**
   * Get session creation counters.
   */
  getSessionCreationCounters(): Map<string, number> {
    return this.sessionCreationCounters;
  }

  /**
   * Increment session suspension counter for a project and reason.
   */
  incrementSessionSuspension(projectId: string, reason: string): void {
    const key = `${projectId}:${reason}`;
    const current = this.sessionSuspensionCounters.get(key) ?? 0;
    this.sessionSuspensionCounters.set(key, current + 1);
  }

  /**
   * Get session suspension counters.
   */
  getSessionSuspensionCounters(): Map<string, number> {
    return this.sessionSuspensionCounters;
  }

  /**
   * Increment alert fired counter by condition type.
   */
  incrementAlertFired(conditionType: string): void {
    const current = this.alertFiredCounters.get(conditionType) ?? 0;
    this.alertFiredCounters.set(conditionType, current + 1);
  }

  /**
   * Get alert fired counters.
   */
  getAlertFiredCounters(): Map<string, number> {
    return this.alertFiredCounters;
  }

  /**
   * Get build information.
   */
  getBuildInfo(): BuildInfo {
    return {
      version: process.env.npm_package_version ?? '0.1.0',
      commit: process.env.GIT_COMMIT ?? 'unknown',
    };
  }

  /**
   * Record an API request with count and duration.
   */
  recordApiRequest(
    endpoint: string,
    method: string,
    status: number,
    durationSeconds: number
  ): void {
    // Increment request counter
    const counterKey = `${endpoint}:${method}:${status}`;
    const currentCount = this.apiRequestCounters.get(counterKey) ?? 0;
    this.apiRequestCounters.set(counterKey, currentCount + 1);

    // Update duration histogram
    const histogramKey = `${endpoint}:${method}`;
    let histogram = this.apiDurationHistograms.get(histogramKey);
    if (!histogram) {
      histogram = {
        buckets: new Map<string, number>(),
        sum: 0,
        count: 0,
      };
      // Initialize buckets
      for (const bucket of HISTOGRAM_BUCKETS) {
        histogram.buckets.set(bucket.label, 0);
      }
      histogram.buckets.set('+Inf', 0);
      this.apiDurationHistograms.set(histogramKey, histogram);
    }

    // Increment appropriate buckets (cumulative)
    for (const bucket of HISTOGRAM_BUCKETS) {
      if (durationSeconds <= bucket.value) {
        const current = histogram.buckets.get(bucket.label) ?? 0;
        histogram.buckets.set(bucket.label, current + 1);
      }
    }
    // Always increment +Inf bucket
    const infCurrent = histogram.buckets.get('+Inf') ?? 0;
    histogram.buckets.set('+Inf', infCurrent + 1);

    histogram.sum += durationSeconds;
    histogram.count += 1;
  }

  /**
   * Get API request counters.
   */
  getApiRequestCounters(): Map<string, number> {
    return this.apiRequestCounters;
  }

  /**
   * Get duration histogram for a specific endpoint/method.
   */
  getApiDurationHistogram(endpoint: string, method: string): DurationHistogram {
    const key = `${endpoint}:${method}`;
    const histogram = this.apiDurationHistograms.get(key);
    if (!histogram) {
      return {
        buckets: {},
        sum: 0,
        count: 0,
      };
    }
    return {
      buckets: Object.fromEntries(histogram.buckets),
      sum: histogram.sum,
      count: histogram.count,
    };
  }

  /**
   * Format all metrics in Prometheus text exposition format.
   */
  async formatPrometheus(): Promise<string> {
    const lines: string[] = [];

    // Session gauges
    const sessionGauges = await this.getSessionGauges();
    lines.push('# HELP mastragen_sessions_total Current number of sessions by state');
    lines.push('# TYPE mastragen_sessions_total gauge');
    for (const gauge of sessionGauges) {
      lines.push(
        `mastragen_sessions_total{project="${gauge.projectId}",state="${gauge.state}"} ${gauge.count}`
      );
    }
    lines.push('');

    // Session creation counters
    lines.push('# HELP mastragen_session_creations_total Total sessions created');
    lines.push('# TYPE mastragen_session_creations_total counter');
    for (const [projectId, count] of this.sessionCreationCounters) {
      lines.push(`mastragen_session_creations_total{project="${projectId}"} ${count}`);
    }
    lines.push('');

    // Session suspension counters
    lines.push('# HELP mastragen_session_suspensions_total Total sessions suspended');
    lines.push('# TYPE mastragen_session_suspensions_total counter');
    for (const [key, count] of this.sessionSuspensionCounters) {
      const [projectId, reason] = key.split(':');
      lines.push(
        `mastragen_session_suspensions_total{project="${projectId}",reason="${reason}"} ${count}`
      );
    }
    lines.push('');

    // API request counters
    lines.push('# HELP mastragen_api_requests_total Total API requests');
    lines.push('# TYPE mastragen_api_requests_total counter');
    for (const [key, count] of this.apiRequestCounters) {
      const [endpoint, method, status] = key.split(':');
      lines.push(
        `mastragen_api_requests_total{endpoint="${endpoint}",method="${method}",status="${status}"} ${count}`
      );
    }
    lines.push('');

    // API request duration histograms
    lines.push('# HELP mastragen_api_request_duration_seconds API request duration');
    lines.push('# TYPE mastragen_api_request_duration_seconds histogram');
    for (const [key, histogram] of this.apiDurationHistograms) {
      const [endpoint, method] = key.split(':');
      for (const [bucket, count] of histogram.buckets) {
        lines.push(
          `mastragen_api_request_duration_seconds_bucket{endpoint="${endpoint}",method="${method}",le="${bucket}"} ${count}`
        );
      }
      lines.push(
        `mastragen_api_request_duration_seconds_sum{endpoint="${endpoint}",method="${method}"} ${histogram.sum}`
      );
      lines.push(
        `mastragen_api_request_duration_seconds_count{endpoint="${endpoint}",method="${method}"} ${histogram.count}`
      );
    }
    lines.push('');

    // Alert fired counters
    lines.push('# HELP mastragen_alerts_fired_total Total alerts fired');
    lines.push('# TYPE mastragen_alerts_fired_total counter');
    for (const [type, count] of this.alertFiredCounters) {
      lines.push(`mastragen_alerts_fired_total{type="${type}"} ${count}`);
    }
    lines.push('');

    // Build info
    const buildInfo = this.getBuildInfo();
    lines.push('# HELP mastragen_build_info Build information');
    lines.push('# TYPE mastragen_build_info gauge');
    lines.push(
      `mastragen_build_info{version="${buildInfo.version}",commit="${buildInfo.commit}"} 1`
    );
    lines.push('');

    return lines.join('\n');
  }
}

// Singleton instance for global metrics collection
let metricsServiceInstance: MetricsService | null = null;

export function initializeMetricsService(db: Kysely<Database>): MetricsService {
  metricsServiceInstance = new MetricsService(db);
  return metricsServiceInstance;
}

export function getMetricsService(): MetricsService | null {
  return metricsServiceInstance;
}
