/**
 * Project schemas for API validation and type inference.
 */
import * as v from 'valibot';
import { IdSchema } from './common.ts';

/**
 * Create project request schema.
 */
export const CreateProjectRequestSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Project name is required')),
  githubRepo: v.pipe(
    v.string(),
    v.regex(/^[^/]+\/[^/]+$/, 'Must be in org/repo format')
  ),
  defaultBranch: v.optional(v.string(), 'main'),
  branchPrefix: v.optional(v.string(), 'mg/'),
  mastraPath: v.optional(v.string(), '.'),
  uiSandboxPath: v.optional(v.nullable(v.string())),
});
export type CreateProjectRequest = v.InferInput<typeof CreateProjectRequestSchema>;

/**
 * Add environment request schema.
 */
export const AddEnvironmentRequestSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Environment name is required')),
  envVars: v.optional(v.record(v.string(), v.string()), {}),
});
export type AddEnvironmentRequest = v.InferInput<typeof AddEnvironmentRequestSchema>;

/**
 * Environment response schema.
 */
export const EnvironmentResponseSchema = v.object({
  id: IdSchema,
  name: v.string(),
  envVars: v.record(v.string(), v.string()),
  createdAt: v.string(),
});
export type EnvironmentResponse = v.InferOutput<typeof EnvironmentResponseSchema>;

/**
 * Project response schema (for list endpoint).
 */
export const ProjectResponseSchema = v.object({
  id: IdSchema,
  name: v.string(),
  githubRepo: v.string(),
  defaultBranch: v.string(),
  branchPrefix: v.string(),
  mastraPath: v.string(),
  uiSandboxPath: v.nullable(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});
export type ProjectResponse = v.InferOutput<typeof ProjectResponseSchema>;

/**
 * Project with environments (for single project endpoint).
 */
export const ProjectWithEnvironmentsSchema = v.object({
  ...ProjectResponseSchema.entries,
  environments: v.array(v.string()),
});
export type ProjectWithEnvironments = v.InferOutput<typeof ProjectWithEnvironmentsSchema>;
