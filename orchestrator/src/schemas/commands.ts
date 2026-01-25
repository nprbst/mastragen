import * as v from 'valibot';

/**
 * Command name validation (alphanumeric + hyphens, 1-50 chars, cannot start with number).
 */
export const CommandNameSchema = v.pipe(
  v.string(),
  v.minLength(1, 'Command name is required'),
  v.maxLength(50, 'Command name must be 50 characters or less'),
  v.regex(
    /^[a-zA-Z][a-zA-Z0-9-]*$/,
    'Command name must start with a letter and contain only letters, numbers, and hyphens'
  )
);

/**
 * Project command schema.
 */
export const ProjectCommandSchema = v.object({
  id: v.string(),
  project_id: v.string(),
  name: CommandNameSchema,
  description: v.nullable(v.string()),
  content: v.pipe(v.string(), v.minLength(1, 'Command content is required')),
  created_at: v.string(),
  updated_at: v.string(),
});
export type ProjectCommandType = v.InferOutput<typeof ProjectCommandSchema>;

/**
 * Create command request schema.
 */
export const CreateCommandSchema = v.object({
  name: CommandNameSchema,
  description: v.optional(v.nullable(v.string())),
  content: v.pipe(v.string(), v.minLength(1, 'Command content is required')),
});
export type CreateCommand = v.InferOutput<typeof CreateCommandSchema>;

/**
 * Update command request schema.
 */
export const UpdateCommandSchema = v.object({
  name: v.optional(CommandNameSchema),
  description: v.optional(v.nullable(v.string())),
  content: v.optional(v.pipe(v.string(), v.minLength(1, 'Command content is required'))),
});
export type UpdateCommand = v.InferOutput<typeof UpdateCommandSchema>;

/**
 * Command list response schema.
 */
export const CommandListSchema = v.array(ProjectCommandSchema);
export type CommandList = v.InferOutput<typeof CommandListSchema>;

/**
 * Validate command name.
 */
export function validateCommandName(name: string): boolean {
  try {
    v.parse(CommandNameSchema, name);
    return true;
  } catch {
    return false;
  }
}
