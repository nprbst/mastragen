import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database, Session } from '../db/types.ts';
import { ProjectsRepository, SessionsRepository } from '../repositories/index.ts';
import {
  SandboxService,
  SessionAlreadyExistsError,
  ProjectNotFoundError,
  EnvironmentNotFoundError,
} from '../services/sandbox.ts';
import type { ServiceUrls } from '../services/sandbox.ts';

// Validation regex for artifact names (lowercase alphanumeric with hyphens)
const ARTIFACT_NAME_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

interface CreateSessionRequest {
  projectId: string;
  artifactName: string;
  environment: string;
}

interface SessionResponse {
  id: string;
  projectId: string;
  artifactName: string;
  environment: string;
  state: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

interface SessionWithUrlsResponse extends SessionResponse {
  urls: ServiceUrls;
}

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
    dockerEnabled: false, // Disable Docker for now
  });

  // POST /sessions - Create a new session
  app.post('/', async (c) => {
    const body = await c.req.json<CreateSessionRequest>();

    // Validate request body
    if (!body.projectId || !body.artifactName || !body.environment) {
      return c.json({ error: 'Missing required fields: projectId, artifactName, environment' }, 400);
    }

    // Validate artifact name format
    if (!ARTIFACT_NAME_REGEX.test(body.artifactName)) {
      return c.json(
        {
          error:
            'Invalid artifactName: must be lowercase alphanumeric with hyphens, 1-50 characters',
        },
        400
      );
    }

    if (body.artifactName.length > 50) {
      return c.json({ error: 'artifactName must be 50 characters or less' }, 400);
    }

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
            error: `Session already exists for this project and artifact name`,
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

  return app;
}
