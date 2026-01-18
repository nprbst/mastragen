import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  User,
  NewUser,
  UserUpdate,
  AuthProvider,
} from '../db/types.ts';

/**
 * Repository for managing users.
 */
export class UsersRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new user.
   */
  async create(data: Omit<NewUser, 'id'>): Promise<User> {
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
   * Find a user by provider and provider ID.
   */
  async findByProvider(provider: AuthProvider, providerId: string): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_id', '=', providerId)
      .executeTakeFirst();
  }

  /**
   * Find or create a user from OIDC profile.
   */
  async findOrCreate(data: {
    email: string;
    name?: string | null;
    avatar_url?: string | null;
    provider: AuthProvider;
    provider_id: string;
  }): Promise<User> {
    // First try to find by provider
    let user = await this.findByProvider(data.provider, data.provider_id);

    if (user) {
      // Update user info in case it changed
      if (data.name !== user.name || data.avatar_url !== user.avatar_url) {
        user = await this.update(user.id, {
          name: data.name,
          avatar_url: data.avatar_url,
        });
      }
      return user!;
    }

    // Check if email already exists with different provider
    const existingByEmail = await this.findByEmail(data.email);
    if (existingByEmail) {
      // Link to existing user (could implement account linking here)
      // For now, create a new user
    }

    // Create new user
    return this.create({
      email: data.email,
      name: data.name ?? null,
      avatar_url: data.avatar_url ?? null,
      provider: data.provider,
      provider_id: data.provider_id,
    });
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
    const result = await this.db
      .deleteFrom('users')
      .where('id', '=', id)
      .execute();

    return result[0]?.numDeletedRows > 0n;
  }

  /**
   * List all users (with pagination).
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    let query = this.db
      .selectFrom('users')
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
}
