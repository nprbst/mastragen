import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, Session } from '../db/types.ts';
import { ProjectsRepository, SessionsRepository } from '../repositories/index.ts';
import {
  CreateSessionRequestSchema,
  ListSessionsFilterSchema,
  type SessionResponse,
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
 * Creates session management routes.
 */
export function sessionsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();

  const projectsRepo = new ProjectsRepository(db);
  const sessionsRepo = new SessionsRepository(db);
  const sandboxService = new SandboxService({
    projectsRepo,
    sessionsRepo,
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
      return c.json(toSessionResponse(session), 200);
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

    try {
      const result = await sandboxService.resume(id);
      const response: SessionWithUrlsResponse = {
        ...toSessionResponse(result.session),
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

  // GET /sessions - List all sessions with optional filters
  app.get('/', async (c) => {
    const rawFilter = {
      state: c.req.query('state'),
      projectId: c.req.query('projectId'),
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

  return app;
}
