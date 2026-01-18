import type { Kysely } from 'kysely';
import { nanoid } from 'nanoid';
import type {
  Database,
  UserProjectMember,
  NewUserProjectMember,
  ProjectRole,
} from '../db/types.ts';

/**
 * Repository for managing user-project membership.
 */
export class UserProjectMembersRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Add a user to a project.
   */
  async addMember(data: {
    userId: string;
    projectId: string;
    role?: ProjectRole;
  }): Promise<UserProjectMember> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    await this.db
      .insertInto('user_project_members')
      .values({
        id,
        user_id: data.userId,
        project_id: data.projectId,
        role: data.role ?? 'member',
        created_at: now,
      })
      .execute();

    const member = await this.findMembership(data.userId, data.projectId);
    if (!member) {
      throw new Error('Failed to add project member');
    }
    return member;
  }

  /**
   * Remove a user from a project.
   */
  async removeMember(userId: string, projectId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('user_project_members')
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .execute();

    return result[0]?.numDeletedRows > 0n;
  }

  /**
   * Find a specific membership.
   */
  async findMembership(userId: string, projectId: string): Promise<UserProjectMember | undefined> {
    return this.db
      .selectFrom('user_project_members')
      .selectAll()
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  /**
   * Check if user is a member of a project.
   */
  async isMember(userId: string, projectId: string): Promise<boolean> {
    const membership = await this.findMembership(userId, projectId);
    return membership !== undefined;
  }

  /**
   * Check if user is an admin of a project.
   */
  async isAdmin(userId: string, projectId: string): Promise<boolean> {
    const membership = await this.findMembership(userId, projectId);
    return membership?.role === 'admin';
  }

  /**
   * Get user's role in a project.
   */
  async getRole(userId: string, projectId: string): Promise<ProjectRole | null> {
    const membership = await this.findMembership(userId, projectId);
    return membership?.role ?? null;
  }

  /**
   * Update a user's role in a project.
   */
  async updateRole(userId: string, projectId: string, role: ProjectRole): Promise<UserProjectMember | undefined> {
    const result = await this.db
      .updateTable('user_project_members')
      .set({ role })
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .execute();

    if (result[0]?.numUpdatedRows === 0n) {
      return undefined;
    }

    return this.findMembership(userId, projectId);
  }

  /**
   * Get all members of a project.
   */
  async getProjectMembers(projectId: string): Promise<
    Array<UserProjectMember & { user_email: string; user_name: string | null }>
  > {
    return this.db
      .selectFrom('user_project_members')
      .innerJoin('users', 'users.id', 'user_project_members.user_id')
      .select([
        'user_project_members.id',
        'user_project_members.user_id',
        'user_project_members.project_id',
        'user_project_members.role',
        'user_project_members.created_at',
        'users.email as user_email',
        'users.name as user_name',
      ])
      .where('user_project_members.project_id', '=', projectId)
      .orderBy('user_project_members.created_at', 'asc')
      .execute();
  }

  /**
   * Get all projects a user is a member of.
   */
  async getUserProjects(userId: string): Promise<
    Array<UserProjectMember & { project_name: string }>
  > {
    return this.db
      .selectFrom('user_project_members')
      .innerJoin('projects', 'projects.id', 'user_project_members.project_id')
      .select([
        'user_project_members.id',
        'user_project_members.user_id',
        'user_project_members.project_id',
        'user_project_members.role',
        'user_project_members.created_at',
        'projects.name as project_name',
      ])
      .where('user_project_members.user_id', '=', userId)
      .orderBy('projects.name', 'asc')
      .execute();
  }

  /**
   * Get project IDs where user is a member.
   */
  async getUserProjectIds(userId: string): Promise<string[]> {
    const memberships = await this.db
      .selectFrom('user_project_members')
      .select('project_id')
      .where('user_id', '=', userId)
      .execute();

    return memberships.map((m) => m.project_id);
  }

  /**
   * Count members in a project.
   */
  async countMembers(projectId: string): Promise<number> {
    const result = await this.db
      .selectFrom('user_project_members')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('project_id', '=', projectId)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }
}
