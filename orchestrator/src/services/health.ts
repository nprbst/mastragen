import Docker from 'dockerode';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';

export interface HealthStatus {
  status: 'ok' | 'unhealthy';
  database: 'connected' | 'disconnected';
  docker: 'connected' | 'disconnected';
  version: string;
  error?: string;
}

export interface HealthServiceOptions {
  db: Kysely<Database>;
  dockerEnabled?: boolean;
}

export class HealthService {
  private db: Kysely<Database>;
  private dockerEnabled: boolean;
  private version: string;
  private docker: Docker;

  constructor(options: HealthServiceOptions) {
    this.db = options.db;
    this.dockerEnabled = options.dockerEnabled ?? true;
    this.version = process.env.npm_package_version ?? '0.1.0';
    this.docker = new Docker();
  }

  /**
   * Checks the health of all services.
   */
  async check(): Promise<HealthStatus> {
    const dbStatus = await this.checkDatabase();
    const dockerStatus = await this.checkDocker();

    const isHealthy = dbStatus === 'connected';

    return {
      status: isHealthy ? 'ok' : 'unhealthy',
      database: dbStatus,
      docker: dockerStatus,
      version: this.version,
      ...(isHealthy ? {} : { error: 'One or more services are unhealthy' }),
    };
  }

  /**
   * Checks database connectivity.
   */
  private async checkDatabase(): Promise<'connected' | 'disconnected'> {
    try {
      // Simple query to check database is responsive
      await this.db.selectFrom('projects').select('id').limit(1).execute();
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  /**
   * Checks Docker daemon connectivity.
   */
  private async checkDocker(): Promise<'connected' | 'disconnected'> {
    if (!this.dockerEnabled) {
      return 'disconnected';
    }

    try {
      await this.docker.ping();
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  /**
   * Checks health of a specific service by URL.
   */
  async checkServiceHealth(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
