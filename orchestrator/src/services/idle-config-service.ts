/**
 * Idle configuration service for managing idle timeout settings.
 *
 * Handles:
 * - Global default idle configuration
 * - Per-project idle configuration overrides
 * - Effective configuration resolution (project > global)
 */
import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type { Database, IdleConfig } from '../db/types.ts';

export interface IdleConfigInput {
  idleTimeoutMinutes: number;
  warningMinutes: number;
  enabled?: boolean;
}

export interface IdleConfigResult {
  id: string;
  projectId: string | null;
  idleTimeoutMinutes: number;
  warningMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class IdleConfigService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Get the global default idle configuration.
   */
  async getGlobalConfig(): Promise<IdleConfigResult | null> {
    const config = await this.db
      .selectFrom('idle_config')
      .selectAll()
      .where('project_id', 'is', null)
      .executeTakeFirst();

    return config ? this.toResult(config) : null;
  }

  /**
   * Update the global default idle configuration.
   */
  async updateGlobalConfig(input: Partial<IdleConfigInput>): Promise<IdleConfigResult> {
    const now = new Date().toISOString();

    const updateValues: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.idleTimeoutMinutes !== undefined) {
      updateValues.idle_timeout_minutes = input.idleTimeoutMinutes;
    }
    if (input.warningMinutes !== undefined) {
      updateValues.warning_minutes = input.warningMinutes;
    }
    if (input.enabled !== undefined) {
      updateValues.enabled = input.enabled ? 1 : 0;
    }

    await this.db
      .updateTable('idle_config')
      .set(updateValues)
      .where('project_id', 'is', null)
      .execute();

    const config = await this.getGlobalConfig();
    if (!config) {
      throw new Error('Global idle config not found after update');
    }

    return config;
  }

  /**
   * Get the idle configuration for a specific project.
   * Returns null if no project-specific config exists.
   */
  async getProjectConfig(projectId: string): Promise<IdleConfigResult | null> {
    const config = await this.db
      .selectFrom('idle_config')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();

    return config ? this.toResult(config) : null;
  }

  /**
   * Get the effective idle configuration for a project.
   * Returns project-specific config if exists, otherwise global config.
   */
  async getEffectiveConfig(projectId: string): Promise<IdleConfigResult> {
    const projectConfig = await this.getProjectConfig(projectId);
    if (projectConfig) {
      return projectConfig;
    }

    const globalConfig = await this.getGlobalConfig();
    if (!globalConfig) {
      throw new Error('Global idle config not found');
    }

    return globalConfig;
  }

  /**
   * Set (create or update) idle configuration for a project.
   */
  async setProjectConfig(projectId: string, input: IdleConfigInput): Promise<IdleConfigResult> {
    const now = new Date().toISOString();
    const existingConfig = await this.getProjectConfig(projectId);

    if (existingConfig) {
      await this.db
        .updateTable('idle_config')
        .set({
          idle_timeout_minutes: input.idleTimeoutMinutes,
          warning_minutes: input.warningMinutes,
          enabled: input.enabled !== false ? 1 : 0,
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .execute();
    } else {
      const configId = nanoid(12);
      await this.db
        .insertInto('idle_config')
        .values({
          id: configId,
          project_id: projectId,
          idle_timeout_minutes: input.idleTimeoutMinutes,
          warning_minutes: input.warningMinutes,
          enabled: input.enabled !== false ? 1 : 0,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    const config = await this.getProjectConfig(projectId);
    if (!config) {
      throw new Error('Project idle config not found after set');
    }

    return config;
  }

  /**
   * Delete project-specific idle configuration.
   * Project will fall back to global config.
   */
  async deleteProjectConfig(projectId: string): Promise<void> {
    await this.db.deleteFrom('idle_config').where('project_id', '=', projectId).execute();
  }

  /**
   * Convert database row to API result format.
   */
  private toResult(config: IdleConfig): IdleConfigResult {
    return {
      id: config.id,
      projectId: config.project_id,
      idleTimeoutMinutes: config.idle_timeout_minutes,
      warningMinutes: config.warning_minutes,
      enabled: config.enabled === 1,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    };
  }
}
