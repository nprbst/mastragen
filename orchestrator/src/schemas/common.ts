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
 * Extended in Phase 3 with 'merged' and 'archived' states.
 */
export const SessionStateSchema = v.picklist([
  'active',
  'suspended',
  'pr_open',
  'merged',
  'archived',
  'closed',
]);
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

/**
 * Git commit SHA: 40-character lowercase hex string.
 */
export const GitShaSchema = v.pipe(
  v.string(),
  v.regex(/^[a-f0-9]{40}$/, 'Must be 40-character lowercase hex SHA')
);
export type GitSha = v.InferOutput<typeof GitShaSchema>;

/**
 * User ID: alphanumeric with underscores and hyphens, max 50 characters.
 */
export const UserIdSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-zA-Z0-9_-]+$/,
    'Must be alphanumeric with underscores and hyphens'
  ),
  v.maxLength(50, 'Must be 50 characters or less')
);
export type UserId = v.InferOutput<typeof UserIdSchema>;

/**
 * Git branch name: max 250 characters (Git limit).
 */
export const BranchNameSchema = v.pipe(
  v.string(),
  v.minLength(1, 'Branch name is required'),
  v.maxLength(250, 'Must be 250 characters or less')
);
export type BranchName = v.InferOutput<typeof BranchNameSchema>;
