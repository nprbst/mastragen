import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, Session } from '../db/types.ts';
import { ProjectsRepository, SessionsRepository, SessionSharesRepository, UsersRepository } from '../repositories/index.ts';
import {
  CreateSessionRequestSchema,
  ListSessionsFilterSchema,
  ResumeSessionRequestSchema,
  type SessionResponse,
  type SessionWithGitResponse,
  type SessionWithUrlsAndGitResponse,
  type SessionWithUrlsResponse,
} from '../schemas/index.ts';
import { RecordActivityRequestSchema } from '../schemas/session-activity.ts';
import { IdleSuspendJob } from '../jobs/idle-suspend.ts';
import {
  EnvironmentNotFoundError,
  ProjectNotFoundError,
  SandboxService,
  SessionAlreadyActiveError,
  SessionAlreadyExistsError,
  SessionNotActiveError,
  SessionNotFoundError,
} from '../services/sandbox.ts';
import { getTailscaleService } from '../services/tailscale.ts';
import { getAuthUser, optionalAuth, requireAuth, requireSessionAuth } from '../middleware/auth.ts';
import { getAuditLogger } from '../services/audit-logger.ts';
import { AuthService } from '../services/auth.ts';
import { decryptToken } from '../lib/crypto.ts';

/**
 * Transforms a database session to API response format.
 */
function toSessionResponse(session: Session): SessionResponse {
  return {
    id: session.id,
    projectId: session.project_id,
    artifactName: session.artifact_name,
    environment: session.environment,
    state: session.state,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

/**
 * Transforms a database session to API response format with git fields.
 */
function toSessionWithGitResponse(session: Session): SessionWithGitResponse {
  return {
    ...toSessionResponse(session),
    userId: session.user_id,
    branchName: session.branch_name,
    lastCommitSha: session.last_commit_sha,
    commitCount: session.commit_count,
    prNumber: session.pr_number,
    prUrl: session.pr_url,
  };
}

/**
 * Options for sessions routes.
 */
export interface SessionsRoutesOptions {
  dockerEnabled?: boolean;
}

/**
 * Creates session management routes.
 */
export function sessionsRoutes(db: Kysely<Database>, options: SessionsRoutesOptions = {}): Hono {
  const app = new Hono();

  const projectsRepo = new ProjectsRepository(db);
  const sessionsRepo = new SessionsRepository(db);
  const sessionSharesRepo = new SessionSharesRepository(db);
  const usersRepo = new UsersRepository(db);
  const tailscaleService = getTailscaleService();
  const auditLogger = getAuditLogger();
  const sandboxService = new SandboxService({
    projectsRepo,
    sessionsRepo,
    db, // T048: Pass db for Claude config injection
    dockerEnabled: options.dockerEnabled,
  });

  // POST /sessions - Create a new session
  app.post('/', optionalAuth(), async (c) => {
    const rawBody = await c.req.json();

    // Validate request body with Valibot
    const parseResult = v.safeParse(CreateSessionRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      console.log('POST /sessions validation failed:', issues);
      return c.json(
        {
          error: 'Validation failed',
          issues,
        },
        400
      );
    }

    const body = parseResult.output;

    // Decrypt token if encrypted version provided, otherwise use plaintext
    let claudeToken: string | undefined = body.claudeToken;
    if (body.encryptedClaudeToken) {
      try {
        claudeToken = decryptToken(body.encryptedClaudeToken);
      } catch (err) {
        console.error('Failed to decrypt Claude token:', err);
        return c.json({ error: 'Invalid encrypted token' }, 400);
      }
    }

    if (!claudeToken) {
      return c.json({ error: 'Either claudeToken or encryptedClaudeToken is required' }, 400);
    }

    // Get authenticated user's GitHub token if available
    let userGithubToken: string | undefined;
    const user = getAuthUser(c);
    if (user) {
      const dbUser = await db
        .selectFrom('users')
        .select(['github_access_token'])
        .where('id', '=', user.id)
        .executeTakeFirst();
      userGithubToken = dbUser?.github_access_token ?? undefined;
    }

    try {
      const result = await sandboxService.create({
        projectId: body.projectId,
        artifactName: body.artifactName,
        environment: body.environment,
        claudeToken,
        userId: body.userId,
        userGithubToken,
      });

      // Generate session-scoped token for API authentication
      const authService = new AuthService(db);
      const sessionToken = await authService.generateSessionToken(
        result.session.id,
        body.userId ?? ''
      );

      const response: SessionWithUrlsResponse = {
        ...toSessionResponse(result.session),
        urls: result.urls,
        sessionToken,
      };

      return c.json(response, 201);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }

      if (error instanceof EnvironmentNotFoundError) {
        return c.json({ error: error.message }, 404);
      }

      if (error instanceof SessionAlreadyExistsError) {
        return c.json(
          {
            error: 'Session already exists for this project and artifact name',
            existingSessionId: error.existingSessionId,
          },
          409
        );
      }

      // Unexpected error
      console.error('Error creating session:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /sessions/:id/suspend - Suspend an active session
  // Accepts either user auth (web UI) or session auth (sandbox)
  app.post('/:id/suspend', optionalAuth(), async (c) => {
    const id = c.req.param('id');
    const user = getAuthUser(c);

    // Check authorization: either user auth or session auth required
    if (!user) {
      // Try session auth as fallback (for sandbox calling back)
      const authHeader = c.req.header('Authorization');
      if (!authHeader) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      // Verify session token
      const token = authHeader.replace('Bearer ', '');
      const authService = new AuthService(db);
      const sessionAuth = await authService.verifySessionToken(token);

      if (!sessionAuth || sessionAuth.sessionId !== id) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    } else {
      // User auth - verify user created this session or session has no owner
      const session = await sessionsRepo.findById(id);
      if (!session) {
        return c.json({ error: `Session not found: ${id}` }, 404);
      }
      // Allow if: session has no owner (legacy) OR user owns the session
      if (session.user_id && session.user_id !== user.id) {
        return c.json({ error: 'Access denied' }, 403);
      }
    }

    try {
      // T015: Check for active shares and log warning before suspend
      const activeShares = await sessionSharesRepo.getSessionShares(id);
      if (activeShares.length > 0) {
        const sharedWithEmails = activeShares.map((s) => s.shared_with_email).join(', ');
        console.warn(
          `[T015] Suspending session ${id} with ${activeShares.length} active share(s): ${sharedWithEmails}`
        );

        // Log audit event for each shared user being affected
        for (const share of activeShares) {
          auditLogger.logShareEvent({
            action: 'suspend_warning',
            sessionId: id,
            sharedByUserId: share.shared_by_user_id,
            sharedWithUserId: share.shared_with_user_id,
            sharedWithEmail: share.shared_with_email,
            shareId: share.id,
          });
        }
      }

      const session = await sandboxService.suspend(id);
      return c.json(toSessionWithGitResponse(session), 200);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return c.json({ error: `Session not found: ${id}` }, 404);
      }

      if (error instanceof SessionNotActiveError) {
        return c.json({ error: `Session is not active: ${id}` }, 400);
      }

      console.error('Error suspending session:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /sessions/:id/resume - Resume a suspended session
  // Note: Does not require session auth - called by CLI when session is suspended
  app.post('/:id/resume', async (c) => {
    const id = c.req.param('id');

    // Parse optional request body for claudeToken
    let claudeToken: string | undefined;
    try {
      const rawBody = await c.req.json();
      const parseResult = v.safeParse(ResumeSessionRequestSchema, rawBody);
      if (parseResult.success) {
        // Decrypt token if encrypted version provided, otherwise use plaintext
        if (parseResult.output.encryptedClaudeToken) {
          try {
            claudeToken = decryptToken(parseResult.output.encryptedClaudeToken);
          } catch (err) {
            console.error('Failed to decrypt Claude token:', err);
            return c.json({ error: 'Invalid encrypted token' }, 400);
          }
        } else {
          claudeToken = parseResult.output.claudeToken;
        }
      }
    } catch {
      // Empty body is fine for resume
    }

    try {
      const result = await sandboxService.resume(id, claudeToken);

      // Generate session-scoped token for API authentication
      const authService = new AuthService(db);
      const sessionToken = await authService.generateSessionToken(
        result.session.id,
        result.session.user_id ?? ''
      );

      const response: SessionWithUrlsAndGitResponse = {
        ...toSessionWithGitResponse(result.session),
        urls: result.urls,
        sessionToken,
      };
      return c.json(response, 200);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return c.json({ error: `Session not found: ${id}` }, 404);
      }

      if (error instanceof SessionAlreadyActiveError) {
        return c.json({ error: `Session is already active: ${id}` }, 400);
      }

      console.error('Error resuming session:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /sessions - List all sessions with optional filters and pagination
  app.get('/', async (c) => {
    const rawFilter = {
      state: c.req.query('state'),
      projectId: c.req.query('projectId'),
      userId: c.req.query('userId'),
      sharedWithMe: c.req.query('sharedWithMe'),
      includeProject: c.req.query('includeProject'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    };

    // Validate query parameters with Valibot
    const parseResult = v.safeParse(ListSessionsFilterSchema, rawFilter);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      console.log('GET /sessions validation failed:', issues);
      return c.json({ error: 'Invalid query parameters', issues }, 400);
    }

    const filter = parseResult.output;
    const sessions = await sessionsRepo.findAll({
      state: filter.state,
      projectId: filter.projectId,
      userId: filter.userId,
      limit: filter.limit,
      offset: filter.offset,
    });

    return c.json(sessions.map(toSessionResponse), 200);
  });

  // GET /sessions/:id - Get session details
  app.get('/:id', async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    const response = toSessionResponse(session);

    // Only include URLs for active sessions
    if (session.state === 'active') {
      return c.json(
        {
          ...response,
          urls: sandboxService.getServiceUrls(id),
        } as SessionWithUrlsResponse,
        200
      );
    }

    return c.json(response, 200);
  });

  // DELETE /sessions/:id - Clean up and delete a session
  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const removeVolume = c.req.query('removeVolume') === 'true';

    try {
      await sandboxService.cleanup(id, { removeVolume });
      return c.json({ message: `Session ${id} cleaned up successfully` }, 200);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return c.json({ error: `Session not found: ${id}` }, 404);
      }

      console.error('Error cleaning up session:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /sessions/:id/pr - Create a pull request (T095)
  app.post('/:id/pr', requireSessionAuth(), async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    if (session.state !== 'active') {
      return c.json({ error: 'Session must be active to create PR' }, 400);
    }

    let body: { title?: string; body?: string; base?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.title) {
      return c.json({ error: 'Title is required' }, 400);
    }

    // Get project for repo info
    const project = await projectsRepo.findById(session.project_id);
    if (!project || !project.github_repo) {
      return c.json({ error: 'Project not found or has no GitHub repo' }, 400);
    }

    // TODO: Get user's GitHub access token from auth context
    // For now, return a placeholder response
    return c.json({
      url: `https://github.com/${project.github_repo}/pull/new/${session.branch_name}`,
      branch: session.branch_name,
      status: 'pending_implementation',
    }, 200);
  });

  // POST /sessions/:id/share - Share a session (T097, T062)
  // Requires authentication to share sessions
  app.post('/:id/share', requireAuth(), async (c) => {
    const id = c.req.param('id');
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    // Only active sessions can be shared
    if (session.state !== 'active') {
      return c.json({ error: 'Only active sessions can be shared' }, 400);
    }

    let body: { email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Cannot share with self
    if (body.email === authUser.email) {
      return c.json({ error: 'Cannot share session with yourself' }, 400);
    }

    // Look up the target user by email
    const targetUser = await usersRepo.findByEmail(body.email);
    if (!targetUser) {
      return c.json({ error: 'User not found with that email' }, 404);
    }

    // Check if already shared with this user
    const existingShare = await sessionSharesRepo.findActiveShare(id, targetUser.id);
    if (existingShare) {
      return c.json({ error: 'Session already shared with this user' }, 409);
    }

    // Create the share record in the database
    const share = await sessionSharesRepo.create({
      sessionId: id,
      sharedByUserId: authUser.id,
      sharedWithUserId: targetUser.id,
    });

    // T062: Grant Tailscale access for the sandbox
    // Sandbox device name follows convention: session-{sessionId}
    const sandboxDeviceName = `session-${id}`;
    await tailscaleService.grantSessionAccess({
      sessionId: id,
      sandboxDeviceName,
      targetUserEmail: body.email,
      sharedByUserId: authUser.id,
    });

    // Log the share event
    auditLogger.logShareEvent({
      action: 'grant',
      sessionId: id,
      sharedByUserId: authUser.id,
      sharedWithUserId: targetUser.id,
      sharedWithEmail: body.email,
      shareId: share.id,
    });

    return c.json({
      shareId: share.id,
      sharedWithEmail: body.email,
      sharedWithUserId: targetUser.id,
      accessUrl: `https://${sandboxDeviceName}.ts.net`,
      createdAt: share.granted_at,
    }, 201);
  });

  // GET /sessions/:id/shares - List session shares (T100)
  app.get('/:id/shares', async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    // Get all active shares for this session
    const shares = await sessionSharesRepo.getSessionShares(id);

    return c.json(shares.map(share => ({
      id: share.id,
      sessionId: share.session_id,
      sharedByUserId: share.shared_by_user_id,
      sharedWithUserId: share.shared_with_user_id,
      sharedWithEmail: share.shared_with_email,
      sharedWithName: share.shared_with_name,
      grantedAt: share.granted_at,
    })), 200);
  });

  // DELETE /sessions/:id/shares/:shareId - Revoke a share (T099, T062)
  // Requires authentication to revoke shares
  app.delete('/:id/shares/:shareId', requireAuth(), async (c) => {
    const id = c.req.param('id');
    const shareId = c.req.param('shareId');
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    // Find the share
    const share = await sessionSharesRepo.findById(shareId);
    if (!share) {
      return c.json({ error: `Share not found: ${shareId}` }, 404);
    }

    // Verify the share belongs to this session
    if (share.session_id !== id) {
      return c.json({ error: 'Share does not belong to this session' }, 400);
    }

    // Check if already revoked
    if (share.revoked_at) {
      return c.json({ error: 'Share already revoked' }, 400);
    }

    // Get the shared user's email for Tailscale revocation
    const sharedWithUser = await usersRepo.findById(share.shared_with_user_id);
    const sharedWithEmail = sharedWithUser?.email || '';

    // Revoke the share in the database
    await sessionSharesRepo.revoke(shareId);

    // T062: Revoke Tailscale access for the sandbox
    const sandboxDeviceName = `session-${id}`;
    await tailscaleService.revokeSessionAccess({
      sessionId: id,
      sandboxDeviceName,
      targetUserEmail: sharedWithEmail,
      revokedByUserId: authUser.id,
    });

    // Log the revoke event
    auditLogger.logShareEvent({
      action: 'revoke',
      sessionId: id,
      sharedByUserId: authUser.id,
      sharedWithUserId: share.shared_with_user_id,
      sharedWithEmail,
      shareId,
    });

    return c.json({ success: true, shareId, revokedAt: new Date().toISOString() }, 200);
  });

  // POST /sessions/:id/activity - Record session activity (T025, T102)
  app.post('/:id/activity', requireSessionAuth(), async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      rawBody = {};
    }

    // Validate request body with Valibot (T025)
    const parseResult = v.safeParse(RecordActivityRequestSchema, rawBody);
    const activityType = parseResult.success ? parseResult.output.type : 'heartbeat';

    // Update session's last_activity_at and updated_at timestamps
    const now = new Date().toISOString();
    await sessionsRepo.update(id, {
      last_activity_at: now,
      updated_at: now,
    });

    return c.json({
      sessionId: id,
      lastActivityAt: now,
      activityType,
    }, 200);
  });

  // GET /sessions/:id/idle-status - Get idle status for session (T026)
  app.get('/:id/idle-status', requireSessionAuth(), async (c) => {
    const id = c.req.param('id');

    const idleSuspendJob = new IdleSuspendJob(db);
    const status = await idleSuspendJob.getIdleStatus(id);

    if (!status) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    return c.json(status, 200);
  });

  return app;
}
