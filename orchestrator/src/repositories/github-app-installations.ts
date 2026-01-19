import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  GithubAppInstallation,
  NewGithubAppInstallation,
  GithubAppInstallationUpdate,
  GitHubAccountType,
} from '../db/types.ts';

/**
 * Repository for managing GitHub App installations.
 * Installations are synced via webhooks and used for access control.
 */
export class GithubAppInstallationsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new installation record.
   */
  async create(
    data: Omit<NewGithubAppInstallation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<GithubAppInstallation> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('github_app_installations')
      .values({
        id,
        ...data,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const installation = await this.findById(id);
    if (!installation) {
      throw new Error('Failed to create installation');
    }
    return installation;
  }

  /**
   * Find an installation by our internal ID.
   */
  async findById(id: string): Promise<GithubAppInstallation | undefined> {
    return this.db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find an installation by GitHub's installation ID.
   */
  async findByInstallationId(installationId: number): Promise<GithubAppInstallation | undefined> {
    return this.db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('installation_id', '=', installationId)
      .executeTakeFirst();
  }

  /**
   * Find installations by account login (org or user name).
   */
  async findByAccountLogin(accountLogin: string): Promise<GithubAppInstallation[]> {
    return this.db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('account_login', '=', accountLogin)
      .execute();
  }

  /**
   * Find or create an installation from webhook data.
   */
  async findOrCreate(data: {
    installation_id: number;
    account_type: GitHubAccountType;
    account_login: string;
    account_id: number;
    permissions: string;
    repository_selection: string;
  }): Promise<GithubAppInstallation> {
    const existing = await this.findByInstallationId(data.installation_id);
    if (existing) {
      // Update if data changed
      return (await this.update(existing.id, data)) ?? existing;
    }
    return this.create(data);
  }

  /**
   * Update an installation.
   */
  async update(
    id: string,
    data: Omit<GithubAppInstallationUpdate, 'id' | 'created_at'>
  ): Promise<GithubAppInstallation | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('github_app_installations')
      .set({
        ...data,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();

    if (result[0]?.numUpdatedRows === 0n) {
      return undefined;
    }

    return this.findById(id);
  }

  /**
   * Mark an installation as suspended.
   */
  async suspend(id: string): Promise<GithubAppInstallation | undefined> {
    const now = new Date().toISOString();
    return this.update(id, { suspended_at: now });
  }

  /**
   * Clear suspended status from an installation.
   */
  async unsuspend(id: string): Promise<GithubAppInstallation | undefined> {
    return this.update(id, { suspended_at: null });
  }

  /**
   * Delete an installation (typically on uninstall webhook).
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('github_app_installations')
      .where('id', '=', id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Delete an installation by GitHub's installation ID.
   */
  async deleteByInstallationId(installationId: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('github_app_installations')
      .where('installation_id', '=', installationId)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * List all installations (with pagination).
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<GithubAppInstallation[]> {
    let query = this.db
      .selectFrom('github_app_installations')
      .selectAll()
      .orderBy('created_at', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }

  /**
   * List installations that are not suspended.
   */
  async findActive(): Promise<GithubAppInstallation[]> {
    return this.db
      .selectFrom('github_app_installations')
      .selectAll()
      .where('suspended_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
  }
}
