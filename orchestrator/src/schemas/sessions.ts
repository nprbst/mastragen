/**
 * Session-related schemas for API request/response validation.
 */
import * as v from 'valibot';
import {
  ArtifactNameSchema,
  EnvironmentNameSchema,
  GitShaSchema,
  IdSchema,
  SessionStateSchema,
  TimestampSchema,
  UserIdSchema,
} from './common.ts';

/**
 * Service URLs for active sessions.
 */
export const ServiceUrlsSchema = v.object({
  mastra: v.string(),
  astro: v.nullable(v.string()),
  vscode: v.string(),
});
export type ServiceUrls = v.InferOutput<typeof ServiceUrlsSchema>;

/**
 * Create session request body.
 */
export const CreateSessionRequestSchema = v.object({
  projectId: IdSchema,
  artifactName: ArtifactNameSchema,
  environment: EnvironmentNameSchema,
  userId: v.optional(UserIdSchema),
  claudeToken: v.string(),
});
export type CreateSessionRequest = v.InferOutput<typeof CreateSessionRequestSchema>;

/**
 * Create session with git request body (requires userId for git-enabled sessions).
 */
export const CreateSessionWithGitRequestSchema = v.object({
  projectId: IdSchema,
  artifactName: ArtifactNameSchema,
  environment: EnvironmentNameSchema,
  userId: UserIdSchema,
  claudeToken: v.string(),
});
export type CreateSessionWithGitRequest = v.InferOutput<typeof CreateSessionWithGitRequestSchema>;

/**
 * Resume session request body (optional commitSha to resume from specific commit).
 */
export const ResumeSessionRequestSchema = v.object({
  commitSha: v.optional(GitShaSchema),
  claudeToken: v.optional(v.string()),
});
export type ResumeSessionRequest = v.InferOutput<typeof ResumeSessionRequestSchema>;

/**
 * Session response (API format with camelCase).
 */
export const SessionResponseSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  artifactName: v.string(),
  environment: v.string(),
  state: SessionStateSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type SessionResponse = v.InferOutput<typeof SessionResponseSchema>;

/**
 * Session with git fields (for git-enabled sessions).
 */
export const SessionWithGitResponseSchema = v.object({
  ...SessionResponseSchema.entries,
  userId: v.nullable(v.string()),
  branchName: v.nullable(v.string()),
  lastCommitSha: v.nullable(v.string()),
  commitCount: v.number(),
  prNumber: v.nullable(v.number()),
  prUrl: v.nullable(v.string()),
});
export type SessionWithGitResponse = v.InferOutput<typeof SessionWithGitResponseSchema>;

/**
 * Suspend session response (includes git fields).
 */
export const SuspendSessionResponseSchema = SessionWithGitResponseSchema;
export type SuspendSessionResponse = v.InferOutput<typeof SuspendSessionResponseSchema>;

/**
 * Session with URLs (for active sessions).
 */
export const SessionWithUrlsResponseSchema = v.object({
  ...SessionResponseSchema.entries,
  urls: ServiceUrlsSchema,
  sessionToken: v.optional(v.string()),
});
export type SessionWithUrlsResponse = v.InferOutput<typeof SessionWithUrlsResponseSchema>;

/**
 * Session with URLs and git fields (for active git-enabled sessions).
 */
export const SessionWithUrlsAndGitResponseSchema = v.object({
  ...SessionWithGitResponseSchema.entries,
  urls: ServiceUrlsSchema,
  sessionToken: v.optional(v.string()),
});
export type SessionWithUrlsAndGitResponse = v.InferOutput<typeof SessionWithUrlsAndGitResponseSchema>;

/**
 * List sessions query filter with pagination.
 */
export const ListSessionsFilterSchema = v.object({
  state: v.optional(SessionStateSchema),
  projectId: v.optional(v.string()),
  userId: v.optional(v.string()),
  sharedWithMe: v.optional(v.picklist(['true', 'false'])),
  includeProject: v.optional(v.picklist(['true', 'false'])),
  limit: v.optional(v.pipe(v.string(), v.transform((s) => Number.parseInt(s, 10)))),
  offset: v.optional(v.pipe(v.string(), v.transform((s) => Number.parseInt(s, 10)))),
});
export type ListSessionsFilter = v.InferOutput<typeof ListSessionsFilterSchema>;

/**
 * Create PR request body (T054).
 */
export const CreatePRRequestSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.maxLength(256))),
  description: v.optional(v.pipe(v.string(), v.maxLength(65536))),
});
export type CreatePRRequest = v.InferOutput<typeof CreatePRRequestSchema>;

/**
 * PR info schema (T055).
 */
export const PRInfoSchema = v.object({
  number: v.number(),
  url: v.string(),
  title: v.string(),
  state: v.picklist(['open', 'closed', 'merged']),
});
export type PRInfo = v.InferOutput<typeof PRInfoSchema>;

/**
 * Pull request response (T055).
 */
export const PullRequestResponseSchema = v.object({
  session: SessionWithGitResponseSchema,
  pr: PRInfoSchema,
});
export type PullRequestResponse = v.InferOutput<typeof PullRequestResponseSchema>;

/**
 * Error response.
 */
export const ErrorResponseSchema = v.object({
  error: v.string(),
  issues: v.optional(v.array(v.string())),
  existingSessionId: v.optional(v.string()),
});
export type ErrorResponse = v.InferOutput<typeof ErrorResponseSchema>;
