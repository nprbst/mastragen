/**
 * Common schema primitives shared across the API.
 */
import * as v from 'valibot';

/**
 * 6-character hex ID (matches SQLite randomblob default).
 */
export const IdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Fa-f0-9]{6}$/, 'Must be 6-character hex ID')
);
export type Id = v.InferOutput<typeof IdSchema>;

/**
 * ISO datetime string.
 */
export const TimestampSchema = v.string();
export type Timestamp = v.InferOutput<typeof TimestampSchema>;

/**
 * Session state enum.
 */
export const SessionStateSchema = v.picklist(['active', 'suspended']);
export type SessionState = v.InferOutput<typeof SessionStateSchema>;

/**
 * Artifact name: lowercase alphanumeric with hyphens, 1-50 chars.
 * Must start and end with alphanumeric, or be a single alphanumeric character.
 */
export const ArtifactNameSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric'
  ),
  v.maxLength(50, 'Must be 50 characters or less')
);
export type ArtifactName = v.InferOutput<typeof ArtifactNameSchema>;

/**
 * Environment name.
 */
export const EnvironmentNameSchema = v.pipe(
  v.string(),
  v.minLength(1, 'Environment name is required')
);
export type EnvironmentName = v.InferOutput<typeof EnvironmentNameSchema>;
