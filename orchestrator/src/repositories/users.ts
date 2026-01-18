import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type { Database, User, NewUser, UserUpdate } from '../db/types.ts';

/**
 * Repository for managing users authenticated via GitHub OAuth.
 */
export class UsersRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new user.
   */
  async create(data: Omit<NewUser, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('users')
      .values({
        id,
        ...data,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const user = await this.findById(id);
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  /**
   * Find a user by ID.
   */
  async findById(id: string): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find a user by email.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  /**
   * Find a user by GitHub ID.
   */
  async findByGithubId(githubId: number): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('github_id', '=', githubId)
      .executeTakeFirst();
  }

  /**
   * Find a user by GitHub login (username).
   */
  async findByGithubLogin(githubLogin: string): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('github_login', '=', githubLogin)
      .executeTakeFirst();
  }

  /**
   * Find or create a user from GitHub OAuth profile.
   */
  async findOrCreate(data: {
    email: string;
    name?: string | null;
    avatar_url?: string | null;
    github_id: number;
    github_login: string;
    github_access_token?: string | null;
  }): Promise<User> {
    // First try to find by GitHub ID
    let user = await this.findByGithubId(data.github_id);

    if (user) {
      // Update user info in case it changed
      const updates: Partial<UserUpdate> = {};
      if (data.name !== user.name) updates.name = data.name;
      if (data.avatar_url !== user.avatar_url) updates.avatar_url = data.avatar_url;
      if (data.github_login !== user.github_login) updates.github_login = data.github_login;
      if (data.github_access_token !== undefined) {
        updates.github_access_token = data.github_access_token;
      }

      if (Object.keys(updates).length > 0) {
        user = await this.update(user.id, updates);
      }
      return user!;
    }

    // Create new user
    return this.create({
      email: data.email,
      name: data.name ?? null,
      avatar_url: data.avatar_url ?? null,
      github_id: data.github_id,
      github_login: data.github_login,
      github_access_token: data.github_access_token ?? null,
    });
  }

  /**
   * Update a user's GitHub access token.
   */
  async updateAccessToken(id: string, accessToken: string | null): Promise<User | undefined> {
    return this.update(id, { github_access_token: accessToken });
  }

  /**
   * Update a user.
   */
  async update(id: string, data: Omit<UserUpdate, 'id' | 'created_at'>): Promise<User | undefined> {
    const now = new Date().toISOString();

    const result = await this.db
      .updateTable('users')
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
   * Delete a user.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('users').where('id', '=', id).execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * List all users (with pagination).
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    let query = this.db.selectFrom('users').selectAll().orderBy('created_at', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }
}
