import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, Session } from '../db/types.ts';
import { ProjectsRepository, SessionsRepository } from '../repositories/index.ts';
import {
  CreateSessionRequestSchema,
  ListSessionsFilterSchema,
  ResumeSessionRequestSchema,
  type SessionResponse,
  type SessionWithGitResponse,
  type SessionWithUrlsAndGitResponse,
  type SessionWithUrlsResponse,
} from '../schemas/index.ts';
import {
  EnvironmentNotFoundError,
  ProjectNotFoundError,
  SandboxService,
  SessionAlreadyActiveError,
  SessionAlreadyExistsError,
  SessionNotActiveError,
  SessionNotFoundError,
} from '../services/sandbox.ts';

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
 * Creates session management routes.
 */
export function sessionsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();

  const projectsRepo = new ProjectsRepository(db);
  const sessionsRepo = new SessionsRepository(db);
  const sandboxService = new SandboxService({
    projectsRepo,
    sessionsRepo,
    db, // T048: Pass db for cui config injection
  });

  // POST /sessions - Create a new session
  app.post('/', async (c) => {
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

    try {
      const result = await sandboxService.create({
        projectId: body.projectId,
        artifactName: body.artifactName,
        environment: body.environment,
        claudeToken: body.claudeToken,
      });

      const response: SessionWithUrlsResponse = {
        ...toSessionResponse(result.session),
        urls: result.urls,
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
  app.post('/:id/suspend', async (c) => {
    const id = c.req.param('id');

    try {
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
  app.post('/:id/resume', async (c) => {
    const id = c.req.param('id');

    // Parse optional request body for claudeToken
    let claudeToken: string | undefined;
    try {
      const rawBody = await c.req.json();
      const parseResult = v.safeParse(ResumeSessionRequestSchema, rawBody);
      if (parseResult.success) {
        claudeToken = parseResult.output.claudeToken;
      }
    } catch {
      // Empty body is fine for resume
    }

    try {
      const result = await sandboxService.resume(id, claudeToken);
      const response: SessionWithUrlsAndGitResponse = {
        ...toSessionWithGitResponse(result.session),
        urls: result.urls,
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
  app.post('/:id/pr', async (c) => {
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

  // POST /sessions/:id/share - Share a session (T097)
  app.post('/:id/share', async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
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

    // TODO: Implement share service integration
    // For now, return a placeholder response
    const shareId = `share_${Date.now()}`;
    return c.json({
      shareId,
      sharedWithEmail: body.email,
      accessUrl: `https://session-${id}.ts.net`,
      createdAt: new Date().toISOString(),
    }, 201);
  });

  // GET /sessions/:id/shares - List session shares (T100)
  app.get('/:id/shares', async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    // TODO: Implement share listing from SessionSharesRepository
    // For now, return empty array
    return c.json([], 200);
  });

  // DELETE /sessions/:id/shares/:shareId - Revoke a share (T099)
  app.delete('/:id/shares/:shareId', async (c) => {
    const id = c.req.param('id');
    const shareId = c.req.param('shareId');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    // TODO: Implement share revocation
    // For now, return success
    return c.json({ success: true, shareId }, 200);
  });

  // POST /sessions/:id/activity - Record session activity (T102)
  app.post('/:id/activity', async (c) => {
    const id = c.req.param('id');

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return c.json({ error: `Session not found: ${id}` }, 404);
    }

    let body: { type?: string; data?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Update session's updated_at timestamp
    await sessionsRepo.update(id, { updated_at: new Date().toISOString() });

    // TODO: Implement activity logging/audit service
    return c.json({
      sessionId: id,
      activityType: body.type || 'heartbeat',
      recordedAt: new Date().toISOString(),
    }, 200);
  });

  return app;
}
