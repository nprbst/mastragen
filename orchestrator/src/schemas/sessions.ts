/**
 * Session-related schemas for API request/response validation.
 */
import * as v from 'valibot';
import {
  IdSchema,
  TimestampSchema,
  SessionStateSchema,
  ArtifactNameSchema,
  EnvironmentNameSchema,
} from './common.ts';

/**
 * Service URLs for active sessions.
 */
export const ServiceUrlsSchema = v.object({
  cui: v.string(),
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
});
export type CreateSessionRequest = v.InferOutput<typeof CreateSessionRequestSchema>;

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
 * Session with URLs (for active sessions).
 */
export const SessionWithUrlsResponseSchema = v.object({
  ...SessionResponseSchema.entries,
  urls: ServiceUrlsSchema,
});
export type SessionWithUrlsResponse = v.InferOutput<typeof SessionWithUrlsResponseSchema>;

/**
 * List sessions query filter.
 */
export const ListSessionsFilterSchema = v.object({
  state: v.optional(SessionStateSchema),
  projectId: v.optional(v.string()),
});
export type ListSessionsFilter = v.InferOutput<typeof ListSessionsFilterSchema>;

/**
 * Error response.
 */
export const ErrorResponseSchema = v.object({
  error: v.string(),
  issues: v.optional(v.array(v.string())),
  existingSessionId: v.optional(v.string()),
});
export type ErrorResponse = v.InferOutput<typeof ErrorResponseSchema>;
