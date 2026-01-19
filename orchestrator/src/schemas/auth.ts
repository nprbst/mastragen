import * as v from 'valibot';

/**
 * Auth provider enum.
 */
export const AuthProviderSchema = v.picklist(['google', 'github', 'azure', 'custom']);
export type AuthProviderType = v.InferOutput<typeof AuthProviderSchema>;

/**
 * User schema (public response).
 */
export const UserPublicSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  name: v.nullable(v.string()),
  avatar_url: v.nullable(v.pipe(v.string(), v.url())),
  created_at: v.string(),
});
export type UserPublic = v.InferOutput<typeof UserPublicSchema>;

/**
 * User schema (internal).
 */
export const UserSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  name: v.nullable(v.string()),
  avatar_url: v.nullable(v.pipe(v.string(), v.url())),
  provider: AuthProviderSchema,
  provider_id: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
});
export type UserType = v.InferOutput<typeof UserSchema>;

/**
 * JWT payload schema.
 */
export const JwtPayloadSchema = v.object({
  sub: v.string(), // User ID
  email: v.pipe(v.string(), v.email()),
  name: v.optional(v.nullable(v.string())),
  iat: v.number(), // Issued at
  exp: v.number(), // Expiration
});
export type JwtPayload = v.InferOutput<typeof JwtPayloadSchema>;

/**
 * Login request schema.
 */
export const LoginRequestSchema = v.object({
  redirect_uri: v.optional(v.string()),
  provider: v.optional(AuthProviderSchema),
});
export type LoginRequest = v.InferOutput<typeof LoginRequestSchema>;

/**
 * Callback request schema (from OIDC provider).
 */
export const CallbackRequestSchema = v.object({
  code: v.string(),
  state: v.string(),
});
export type CallbackRequest = v.InferOutput<typeof CallbackRequestSchema>;

/**
 * Refresh token request schema.
 */
export const RefreshRequestSchema = v.object({
  refresh_token: v.optional(v.string()),
});
export type RefreshRequest = v.InferOutput<typeof RefreshRequestSchema>;

/**
 * Token response schema.
 */
export const TokenResponseSchema = v.object({
  accessToken: v.string(),
  expiresIn: v.number(),
  tokenType: v.literal('Bearer'),
});
export type TokenResponse = v.InferOutput<typeof TokenResponseSchema>;

/**
 * Auth error response schema.
 */
export const AuthErrorSchema = v.object({
  error: v.string(),
  error_description: v.optional(v.string()),
});
export type AuthError = v.InferOutput<typeof AuthErrorSchema>;

/**
 * Validate JWT payload.
 */
export function validateJwtPayload(payload: unknown): JwtPayload {
  return v.parse(JwtPayloadSchema, payload);
}

/**
 * Check if JWT is expired.
 */
export function isJwtExpired(payload: JwtPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}
