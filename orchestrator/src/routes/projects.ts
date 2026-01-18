/**
 * Project routes - CRUD for projects and environments.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, Project } from '../db/types.ts';
import { ProjectsRepository } from '../repositories/index.ts';
import type {
  EnvironmentResponse,
  ProjectResponse,
  ProjectWithEnvironments,
} from '../schemas/index.ts';
import { AddEnvironmentRequestSchema, CreateProjectRequestSchema } from '../schemas/index.ts';

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

  // GET /projects - List all projects
  app.get('/', async (c) => {
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

  return app;
}
