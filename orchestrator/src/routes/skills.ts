/**
 * Skills routes - CRUD for project skills (domain knowledge).
 * T080: Modification routes require admin access.
 */
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import * as v from 'valibot';
import type { Database, ProjectSkill } from '../db/types.ts';
import { requireAuth, requireProjectAdmin } from '../middleware/auth.ts';
import { ProjectsRepository } from '../repositories/index.ts';
import { ProjectSkillsRepository } from '../repositories/project-skills.ts';

/**
 * Schema for creating a skill.
 */
const CreateSkillSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  content: v.pipe(v.string(), v.minLength(1)),
});

/**
 * Schema for updating a skill.
 */
const UpdateSkillSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  description: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  content: v.optional(v.pipe(v.string(), v.minLength(1))),
});

/**
 * API response format for a skill.
 */
interface SkillResponse {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transform DB skill to API response.
 */
function toResponse(skill: ProjectSkill): SkillResponse {
  return {
    id: skill.id,
    projectId: skill.project_id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    createdAt: skill.created_at,
    updatedAt: skill.updated_at,
  };
}

/**
 * Creates skills routes.
 */
export function skillsRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const projectsRepo = new ProjectsRepository(db);
  const skillsRepo = new ProjectSkillsRepository(db);

  /**
   * GET /:projectId/skills - List project skills
   */
  app.get('/:projectId/skills', async (c) => {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const skills = await skillsRepo.findByProjectId(projectId);
    return c.json(skills.map(toResponse), 200);
  });

  /**
   * POST /:projectId/skills - Create a skill
   * T080: Requires admin access to create skills
   */
  app.post('/:projectId/skills', requireAuth(), requireProjectAdmin(), async (c) => {
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

    const result = v.safeParse(CreateSkillSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name
    const existing = await skillsRepo.findByName(projectId, input.name);
    if (existing) {
      return c.json({ error: `Skill already exists: ${input.name}` }, 409);
    }

    // Create skill
    const skill = await skillsRepo.create({
      project_id: projectId,
      name: input.name,
      description: input.description,
      content: input.content,
    });

    return c.json(toResponse(skill), 201);
  });

  /**
   * GET /:projectId/skills/:id - Get a skill
   */
  app.get('/:projectId/skills/:id', async (c) => {
    const projectId = c.req.param('projectId');
    const skillId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const skill = await skillsRepo.findById(skillId);
    if (!skill || skill.project_id !== projectId) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    return c.json(toResponse(skill), 200);
  });

  /**
   * PUT /:projectId/skills/:id - Update a skill
   * T080: Requires admin access to update skills
   */
  app.put('/:projectId/skills/:id', requireAuth(), requireProjectAdmin(), async (c) => {
    const projectId = c.req.param('projectId');
    const skillId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Verify skill exists
    const existing = await skillsRepo.findById(skillId);
    if (!existing || existing.project_id !== projectId) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const result = v.safeParse(UpdateSkillSchema, body);
    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join(', ');
      return c.json({ error: `Validation failed: ${issues}` }, 400);
    }

    const input = result.output;

    // Check for duplicate name if name is being changed
    if (input.name && input.name !== existing.name) {
      const duplicate = await skillsRepo.findByName(projectId, input.name);
      if (duplicate) {
        return c.json({ error: `Skill already exists: ${input.name}` }, 409);
      }
    }

    // Update skill
    const skill = await skillsRepo.update(skillId, input);
    if (!skill) {
      return c.json({ error: 'Failed to update skill' }, 500);
    }

    return c.json(toResponse(skill), 200);
  });

  /**
   * DELETE /:projectId/skills/:id - Delete a skill
   * T080: Requires admin access to delete skills
   */
  app.delete('/:projectId/skills/:id', requireAuth(), requireProjectAdmin(), async (c) => {
    const projectId = c.req.param('projectId');
    const skillId = c.req.param('id');

    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Verify skill exists
    const existing = await skillsRepo.findById(skillId);
    if (!existing || existing.project_id !== projectId) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Delete skill
    await skillsRepo.delete(skillId);
    return c.json({ success: true }, 200);
  });

  return app;
}
