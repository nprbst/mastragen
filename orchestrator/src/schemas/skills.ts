import * as v from 'valibot';

/**
 * Skill name validation (alphanumeric + hyphens + underscores, 1-100 chars).
 */
export const SkillNameSchema = v.pipe(
  v.string(),
  v.minLength(1, 'Skill name is required'),
  v.maxLength(100, 'Skill name must be 100 characters or less'),
  v.regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Skill name must start with a letter and contain only letters, numbers, hyphens, and underscores'
  )
);

/**
 * Project skill schema.
 */
export const ProjectSkillSchema = v.object({
  id: v.string(),
  project_id: v.string(),
  name: SkillNameSchema,
  description: v.nullable(v.string()),
  content: v.pipe(v.string(), v.minLength(1, 'Skill content is required')),
  created_at: v.string(),
  updated_at: v.string(),
});
export type ProjectSkillType = v.InferOutput<typeof ProjectSkillSchema>;

/**
 * Create skill request schema.
 */
export const CreateSkillSchema = v.object({
  name: SkillNameSchema,
  description: v.optional(v.nullable(v.string())),
  content: v.pipe(v.string(), v.minLength(1, 'Skill content is required')),
});
export type CreateSkill = v.InferOutput<typeof CreateSkillSchema>;

/**
 * Update skill request schema.
 */
export const UpdateSkillSchema = v.object({
  name: v.optional(SkillNameSchema),
  description: v.optional(v.nullable(v.string())),
  content: v.optional(v.pipe(v.string(), v.minLength(1, 'Skill content is required'))),
});
export type UpdateSkill = v.InferOutput<typeof UpdateSkillSchema>;

/**
 * Skill list response schema.
 */
export const SkillListSchema = v.array(ProjectSkillSchema);
export type SkillList = v.InferOutput<typeof SkillListSchema>;

/**
 * Validate skill name.
 */
export function validateSkillName(name: string): boolean {
  try {
    v.parse(SkillNameSchema, name);
    return true;
  } catch {
    return false;
  }
}
