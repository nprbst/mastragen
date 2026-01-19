/**
 * oRPC Router for type-safe API communication.
 *
 * This router provides end-to-end type safety between the orchestrator and clients
 * (CLI, landing-page). All input/output is validated using Valibot schemas.
 */
import { os, ORPCError } from '@orpc/server';
import * as v from 'valibot';

// Import schemas
import {
  HealthStatusSchema,
  // Project schemas
  CreateProjectRequestSchema,
  ProjectResponseSchema,
  ProjectWithEnvironmentsSchema,
  AddEnvironmentRequestSchema,
  EnvironmentResponseSchema,
  // Session schemas
  CreateSessionRequestSchema,
  SessionWithUrlsResponseSchema,
  SessionWithGitResponseSchema,
  SessionWithUrlsAndGitResponseSchema,
  ListSessionsFilterSchema,
  ResumeSessionRequestSchema,
  SuspendSessionResponseSchema,
  CreatePRRequestSchema,
  PullRequestResponseSchema,
} from '../schemas/index.ts';
import { IdSchema } from '../schemas/common.ts';

/**
 * Base context for oRPC procedures.
 * The actual context will be injected at runtime with db, services, etc.
 */
export interface ORPCContext {
  db: unknown; // Kysely<Database>
  services?: {
    sessions?: unknown;
    projects?: unknown;
  };
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
}

/**
 * Create the base oRPC instance with context type.
 */
const base = os.$context<ORPCContext>();

/**
 * Health procedures.
 */
const health = base.router({
  /**
   * GET /health - Check API health status.
   */
  check: base.output(HealthStatusSchema).handler(async ({ context: _context }) => {
    // Health check implementation will be injected via context
    // For now, return a basic response
    return {
      status: 'ok' as const,
      database: 'connected' as const,
      docker: 'connected' as const,
      version: '0.1.0',
    };
  }),
});

/**
 * Project procedures.
 */
const projects = base.router({
  /**
   * GET /projects - List all projects.
   */
  list: base.output(v.array(ProjectResponseSchema)).handler(async ({ context: _context }) => {
    // Implementation will use context.db
    return [];
  }),

  /**
   * GET /projects/:id - Get a project by ID.
   */
  get: base
    .input(v.object({ id: IdSchema }))
    .output(ProjectWithEnvironmentsSchema)
    .handler(async () => {
      throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
    }),

  /**
   * POST /projects - Create a new project.
   */
  create: base
    .input(CreateProjectRequestSchema)
    .output(ProjectResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * GET /projects/:id/environments - List environments for a project.
   */
  listEnvironments: base
    .input(v.object({ projectId: IdSchema }))
    .output(v.array(EnvironmentResponseSchema))
    .handler(async () => {
      return [];
    }),

  /**
   * POST /projects/:id/environments - Add an environment to a project.
   */
  addEnvironment: base
    .input(v.object({ projectId: IdSchema, ...AddEnvironmentRequestSchema.entries }))
    .output(EnvironmentResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),
});

/**
 * Session procedures.
 */
const sessions = base.router({
  /**
   * GET /sessions - List sessions with optional filters.
   */
  list: base
    .input(v.optional(ListSessionsFilterSchema))
    .output(v.array(SessionWithGitResponseSchema))
    .handler(async () => {
      return [];
    }),

  /**
   * GET /sessions/:id - Get a session by ID.
   */
  get: base
    .input(v.object({ id: IdSchema }))
    .output(SessionWithUrlsAndGitResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_FOUND', { message: 'Session not found' });
    }),

  /**
   * POST /sessions - Create a new session.
   */
  create: base
    .input(CreateSessionRequestSchema)
    .output(SessionWithUrlsResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * POST /sessions/:id/suspend - Suspend an active session.
   */
  suspend: base
    .input(v.object({ id: IdSchema }))
    .output(SuspendSessionResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * POST /sessions/:id/resume - Resume a suspended session.
   */
  resume: base
    .input(v.object({ id: IdSchema, ...ResumeSessionRequestSchema.entries }))
    .output(SessionWithUrlsAndGitResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * DELETE /sessions/:id - Delete a session.
   */
  delete: base
    .input(v.object({ id: IdSchema, removeVolume: v.optional(v.boolean()) }))
    .output(v.object({ message: v.string() }))
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * POST /sessions/:id/pr - Create a pull request for the session.
   */
  createPR: base
    .input(v.object({ id: IdSchema, ...CreatePRRequestSchema.entries }))
    .output(PullRequestResponseSchema)
    .handler(async () => {
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),
});

/**
 * Auth procedures (for authenticated routes).
 */
const auth = base.router({
  /**
   * GET /auth/me - Get current authenticated user.
   */
  me: base
    .output(
      v.object({
        id: v.string(),
        email: v.string(),
        name: v.nullable(v.string()),
        avatarUrl: v.nullable(v.string()),
        githubId: v.number(),
        githubLogin: v.string(),
      })
    )
    .handler(async ({ context }) => {
      if (!context.user) {
        throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' });
      }
      throw new ORPCError('NOT_IMPLEMENTED', { message: 'Not implemented' });
    }),

  /**
   * GET /auth/installations - List user's GitHub App installations.
   */
  installations: base
    .output(
      v.object({
        installations: v.array(
          v.object({
            id: v.number(),
            installationId: v.number(),
            accountType: v.string(),
            accountLogin: v.string(),
            accountId: v.number(),
            repositorySelection: v.string(),
            permissions: v.record(v.string(), v.string()),
          })
        ),
        error: v.optional(v.string()),
      })
    )
    .handler(async ({ context }) => {
      if (!context.user) {
        throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' });
      }
      return { installations: [] };
    }),

  /**
   * GET /auth/installations/:installationId/repos - List repos for an installation.
   */
  installationRepos: base
    .input(
      v.object({
        installationId: v.number(),
        page: v.optional(v.number()),
        perPage: v.optional(v.number()),
      })
    )
    .output(
      v.object({
        repositories: v.array(
          v.object({
            id: v.number(),
            name: v.string(),
            fullName: v.string(),
            private: v.boolean(),
            defaultBranch: v.string(),
            permissions: v.optional(
              v.object({
                admin: v.optional(v.boolean()),
                push: v.optional(v.boolean()),
                pull: v.optional(v.boolean()),
              })
            ),
          })
        ),
        totalCount: v.number(),
        page: v.number(),
        perPage: v.number(),
      })
    )
    .handler(async ({ context }) => {
      if (!context.user) {
        throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' });
      }
      return { repositories: [], totalCount: 0, page: 1, perPage: 30 };
    }),
});

/**
 * Main router combining all sub-routers.
 */
export const router = base.router({
  health,
  projects,
  sessions,
  auth,
});

/**
 * Export the router type for client generation.
 */
export type Router = typeof router;
