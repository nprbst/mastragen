/**
 * Project routes - CRUD for projects and environments.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, Project } from '../db/types.ts';
import { optionalAuth, getAuthUser } from '../middleware/auth.ts';
import { ProjectsRepository } from '../repositories/index.ts';
import type {
  EnvironmentResponse,
  ProjectResponse,
  ProjectWithEnvironments,
} from '../schemas/index.ts';
import { AddEnvironmentRequestSchema, CreateProjectRequestSchema, UpdateProjectRequestSchema } from '../schemas/index.ts';
import { IdleConfigService } from '../services/idle-config-service.ts';
import { SetProjectIdleConfigRequestSchema } from '../schemas/idle-config.ts';
import { requireAuth } from '../middleware/auth.ts';

/**
 * Fetch user's accessible GitHub App installations.
 */
async function getUserInstallationIds(accessToken: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.github.com/user/installations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch user installations:', response.status);
      return [];
    }

    const data = (await response.json()) as {
      installations: Array<{ id: number }>;
    };

    return data.installations.map((inst) => inst.id);
  } catch (error) {
    console.error('Error fetching user installations:', error);
    return [];
  }
}

/**
 * Transforms a database project to API response format.
 */
function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    githubRepo: project.github_repo,
    defaultBranch: project.default_branch,
    branchPrefix: project.branch_prefix,
    mastraPath: project.mastra_path,
    uiSandboxPath: project.ui_sandbox_path,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

/**
 * Creates project management routes.
 */
export function projectsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const projectsRepo = new ProjectsRepository(db);

  // GET /projects - List projects accessible to the user
  app.get('/', optionalAuth(), async (c) => {
    const user = getAuthUser(c);

    // If authenticated, filter by user's accessible installations
    if (user) {
      // Get user's GitHub access token
      const dbUser = await db
        .selectFrom('users')
        .select(['github_access_token'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      if (dbUser?.github_access_token) {
        // Fetch user's accessible installations
        const installationIds = await getUserInstallationIds(dbUser.github_access_token);

        if (installationIds.length > 0) {
          // Get internal installation IDs that match
          const installations = await db
            .selectFrom('github_app_installations')
            .select(['id'])
            .where('installation_id', 'in', installationIds)
            .execute();

          const internalIds = installations.map((i) => i.id);

          if (internalIds.length > 0) {
            // Filter projects by those installations
            const projects = await db
              .selectFrom('projects')
              .selectAll()
              .where('installation_id', 'in', internalIds)
              .execute();

            return c.json(projects.map(toProjectResponse), 200);
          }
        }

        // User has no accessible installations
        return c.json([], 200);
      }
    }

    // Unauthenticated: return all projects (for backwards compatibility)
    // In production, this could be restricted
    const projects = await projectsRepo.findAll();
    return c.json(projects.map(toProjectResponse), 200);
  });

  // GET /projects/:id - Get project details with environments
  app.get('/:id', async (c) => {
    const id = c.req.param('id');

    const project = await projectsRepo.findById(id);
    if (!project) {
      return c.json({ error: `Project not found: ${id}` }, 404);
    }

    const environments = await projectsRepo.findEnvironments(id);
    const response: ProjectWithEnvironments = {
      ...toProjectResponse(project),
      environments: environments.map((e) => e.name),
    };

    return c.json(response, 200);
  });

  // POST /projects - Create a new project
  app.post('/', async (c) => {
    const body = await c.req.json();

    // Validate request body
    const result = v.safeParse(CreateProjectRequestSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name
    const existing = await projectsRepo.findByName(input.name);
    if (existing) {
      return c.json({ error: `Project already exists: ${input.name}` }, 409);
    }

    // Create the project
    const project = await projectsRepo.create({
      name: input.name,
      github_repo: input.githubRepo,
      default_branch: input.defaultBranch,
      branch_prefix: input.branchPrefix,
      mastra_path: input.mastraPath,
      ui_sandbox_path: input.uiSandboxPath ?? null,
    });

    return c.json(toProjectResponse(project), 201);
  });

  // PUT /projects/:id - Update a project
  app.put('/:id', async (c) => {
    const id = c.req.param('id');

    // Verify project exists
    const existingProject = await projectsRepo.findById(id);
    if (!existingProject) {
      return c.json({ error: `Project not found: ${id}` }, 404);
    }

    const body = await c.req.json();

    // Validate request body
    const result = v.safeParse(UpdateProjectRequestSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name if name is being changed
    if (input.name && input.name !== existingProject.name) {
      const nameConflict = await projectsRepo.findByName(input.name);
      if (nameConflict) {
        return c.json({ error: `Project already exists: ${input.name}` }, 409);
      }
    }

    // Build update object with snake_case field names
    const updates: Record<string, string | null | undefined> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.githubRepo !== undefined) updates.github_repo = input.githubRepo;
    if (input.defaultBranch !== undefined) updates.default_branch = input.defaultBranch;
    if (input.branchPrefix !== undefined) updates.branch_prefix = input.branchPrefix;
    if (input.mastraPath !== undefined) updates.mastra_path = input.mastraPath;
    if (input.uiSandboxPath !== undefined) updates.ui_sandbox_path = input.uiSandboxPath;

    // Update the project
    const project = await projectsRepo.update(id, updates);
    if (!project) {
      return c.json({ error: `Failed to update project: ${id}` }, 500);
    }

    return c.json(toProjectResponse(project), 200);
  });

  // POST /projects/:id/environments - Add environment to project
  app.post('/:id/environments', async (c) => {
    const projectId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: `Project not found: ${projectId}` }, 404);
    }

    const body = await c.req.json();

    // Validate request body
    const result = v.safeParse(AddEnvironmentRequestSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate environment name
    const existing = await projectsRepo.findEnvironmentByName(projectId, input.name);
    if (existing) {
      return c.json({ error: `Environment already exists: ${input.name}` }, 409);
    }

    // Add the environment
    const env = await projectsRepo.addEnvironment(projectId, {
      name: input.name,
      env_vars: input.envVars ?? {},
    });

    const response: EnvironmentResponse = {
      id: env.id,
      name: env.name,
      envVars: JSON.parse(env.env_vars),
      createdAt: env.created_at,
    };

    return c.json(response, 201);
  });

  // GET /projects/:id/environments - List project environments
  app.get('/:id/environments', async (c) => {
    const projectId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: `Project not found: ${projectId}` }, 404);
    }

    const environments = await projectsRepo.findEnvironments(projectId);
    const response: EnvironmentResponse[] = environments.map((env) => ({
      id: env.id,
      name: env.name,
      envVars: JSON.parse(env.env_vars),
      createdAt: env.created_at,
    }));

    return c.json(response, 200);
  });

  // =========================================================================
  // Idle Configuration Endpoints (T029-T031)
  // =========================================================================

  const idleConfigService = new IdleConfigService(db);

  // GET /projects/:id/idle-config - Get project idle configuration (T029)
  app.get('/:id/idle-config', requireAuth(), async (c) => {
    const projectId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: `Project not found: ${projectId}` }, 404);
    }

    // Get project-specific config, or null if using global defaults
    const config = await idleConfigService.getProjectConfig(projectId);

    if (config) {
      return c.json(config, 200);
    }

    // Return global config with indication that it's the fallback
    const globalConfig = await idleConfigService.getGlobalConfig();
    return c.json({
      ...globalConfig,
      isGlobalFallback: true,
    }, 200);
  });

  // PUT /projects/:id/idle-config - Set project idle configuration (T030)
  app.put('/:id/idle-config', requireAuth(), async (c) => {
    const projectId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: `Project not found: ${projectId}` }, 404);
    }

    const rawBody = await c.req.json();

    // Validate request body
    const parseResult = v.safeParse(SetProjectIdleConfigRequestSchema, rawBody);
    if (!parseResult.success) {
      const issues = parseResult.issues.map((i) => {
        const path = i.path?.map((p) => p.key).join('.') || 'input';
        return `${path}: ${i.message}`;
      });
      return c.json({ error: 'Validation failed', issues }, 400);
    }

    const input = parseResult.output;

    // Validate warning_minutes is less than idle_timeout_minutes
    if (input.warningMinutes >= input.idleTimeoutMinutes) {
      return c.json(
        { error: 'Warning time must be less than idle timeout' },
        400
      );
    }

    try {
      const config = await idleConfigService.setProjectConfig(projectId, input);
      return c.json(config, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set config';
      return c.json({ error: message }, 500);
    }
  });

  // DELETE /projects/:id/idle-config - Delete project idle configuration (T031)
  app.delete('/:id/idle-config', requireAuth(), async (c) => {
    const projectId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: `Project not found: ${projectId}` }, 404);
    }

    await idleConfigService.deleteProjectConfig(projectId);

    return c.json({ success: true, message: 'Project idle config deleted, now using global defaults' }, 200);
  });

  return app;
}
