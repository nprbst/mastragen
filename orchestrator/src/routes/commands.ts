/**
 * Commands routes - CRUD for project custom commands.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, ProjectCommand } from '../db/types.ts';
import { ProjectsRepository } from '../repositories/index.ts';
import { ProjectCommandsRepository } from '../repositories/project-commands.ts';

/**
 * Schema for creating a command.
 */
const CreateCommandSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  content: v.pipe(v.string(), v.minLength(1)),
});

/**
 * Schema for updating a command.
 */
const UpdateCommandSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  description: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  content: v.optional(v.pipe(v.string(), v.minLength(1))),
});

/**
 * API response format for a command.
 */
interface CommandResponse {
  id: string;
  projectId: string;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transform DB command to API response.
 */
function toResponse(command: ProjectCommand): CommandResponse {
  return {
    id: command.id,
    projectId: command.project_id,
    name: command.name,
    description: command.description,
    content: command.content,
    createdAt: command.created_at,
    updatedAt: command.updated_at,
  };
}

/**
 * Creates commands routes.
 */
export function commandsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const projectsRepo = new ProjectsRepository(db);
  const commandsRepo = new ProjectCommandsRepository(db);

  /**
   * GET /:projectId/commands - List project commands
   */
  app.get('/:projectId/commands', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const commands = await commandsRepo.findByProjectId(projectId);
    return c.json(commands.map(toResponse), 200);
  });

  /**
   * POST /:projectId/commands - Create a command
   */
  app.post('/:projectId/commands', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const result = v.safeParse(CreateCommandSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name
    const existing = await commandsRepo.findByName(projectId, input.name);
    if (existing) {
      return c.json({ error: `Command already exists: ${input.name}` }, 409);
    }

    // Create command
    const command = await commandsRepo.create({
      project_id: projectId,
      name: input.name,
      description: input.description,
      content: input.content,
    });

    return c.json(toResponse(command), 201);
  });

  /**
   * GET /:projectId/commands/:id - Get a command
   */
  app.get('/:projectId/commands/:id', async (c) => {
    const projectId = c.req.param('projectId');
    const commandId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const command = await commandsRepo.findById(commandId);
    if (!command || command.project_id !== projectId) {
      return c.json({ error: 'Command not found' }, 404);
    }

    return c.json(toResponse(command), 200);
  });

  /**
   * PUT /:projectId/commands/:id - Update a command
   */
  app.put('/:projectId/commands/:id', async (c) => {
    const projectId = c.req.param('projectId');
    const commandId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Verify command exists
    const existing = await commandsRepo.findById(commandId);
    if (!existing || existing.project_id !== projectId) {
      return c.json({ error: 'Command not found' }, 404);
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const result = v.safeParse(UpdateCommandSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name if name is being changed
    if (input.name && input.name !== existing.name) {
      const duplicate = await commandsRepo.findByName(projectId, input.name);
      if (duplicate) {
        return c.json({ error: `Command already exists: ${input.name}` }, 409);
      }
    }

    // Update command
    const command = await commandsRepo.update(commandId, input);
    if (!command) {
      return c.json({ error: 'Failed to update command' }, 500);
    }

    return c.json(toResponse(command), 200);
  });

  /**
   * DELETE /:projectId/commands/:id - Delete a command
   */
  app.delete('/:projectId/commands/:id', async (c) => {
    const projectId = c.req.param('projectId');
    const commandId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Verify command exists
    const existing = await commandsRepo.findById(commandId);
    if (!existing || existing.project_id !== projectId) {
      return c.json({ error: 'Command not found' }, 404);
    }

    // Delete command
    await commandsRepo.delete(commandId);
    return c.json({ success: true }, 200);
  });

  return app;
}
