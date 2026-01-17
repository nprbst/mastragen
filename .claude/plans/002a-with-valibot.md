# Implementation Plan: Valibot Integration + `mgen` CLI

**Feature**: Add Valibot for wire/db types, then complete CLI
**Approach**: TDD with Valibot schemas as source of truth

## Overview

1. Add Valibot to orchestrator for schema validation at API boundaries
2. Create shared schemas that derive TypeScript types
3. Complete CLI using shared types

## Part 1: Valibot Integration

### Current State
- Types defined in `orchestrator/src/db/types.ts` (Kysely)
- Types duplicated in `cli/src/client.ts` (wire types)
- Manual validation in `orchestrator/src/routes/sessions.ts`

### Strategy
- Valibot schemas become the source of truth for wire types
- Use `v.InferOutput<typeof Schema>` to derive TypeScript types
- Kysely types remain for DB operations, constrained via `satisfies`

### Directory Structure (New Files)
```
orchestrator/
├── src/
│   ├── schemas/
│   │   ├── index.ts           # Re-exports all schemas
│   │   ├── common.ts          # Shared types (IDs, timestamps)
│   │   ├── health.ts          # Health response schema
│   │   └── sessions.ts        # Session request/response schemas
│   └── routes/
│       └── sessions.ts        # Updated to use schemas
```

### Schemas to Create

**[orchestrator/src/schemas/common.ts](orchestrator/src/schemas/common.ts)**
```typescript
import * as v from 'valibot'

// 6-char hex ID (matches SQLite randomblob default)
export const IdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Fa-f0-9]{6}$/, 'Must be 6-character hex ID')
)
export type Id = v.InferOutput<typeof IdSchema>

// ISO datetime string
export const TimestampSchema = v.pipe(v.string(), v.isoTimestamp())
export type Timestamp = v.InferOutput<typeof TimestampSchema>

// Session state enum
export const SessionStateSchema = v.picklist(['active', 'suspended'])
export type SessionState = v.InferOutput<typeof SessionStateSchema>

// Artifact name: lowercase alphanumeric with hyphens, 1-50 chars
export const ArtifactNameSchema = v.pipe(
  v.string(),
  v.regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Lowercase alphanumeric with hyphens'),
  v.maxLength(50)
)
```

**[orchestrator/src/schemas/health.ts](orchestrator/src/schemas/health.ts)**
```typescript
import * as v from 'valibot'

export const HealthStatusSchema = v.object({
  status: v.picklist(['ok', 'unhealthy']),
  database: v.picklist(['connected', 'disconnected']),
  docker: v.picklist(['connected', 'disconnected']),
  version: v.string(),
  error: v.optional(v.string()),
})
export type HealthStatus = v.InferOutput<typeof HealthStatusSchema>
```

**[orchestrator/src/schemas/sessions.ts](orchestrator/src/schemas/sessions.ts)**
```typescript
import * as v from 'valibot'
import { IdSchema, TimestampSchema, SessionStateSchema, ArtifactNameSchema } from './common.ts'

// Service URLs
export const ServiceUrlsSchema = v.object({
  cui: v.pipe(v.string(), v.url()),
  mastra: v.pipe(v.string(), v.url()),
  vscode: v.pipe(v.string(), v.url()),
})
export type ServiceUrls = v.InferOutput<typeof ServiceUrlsSchema>

// Create session request
export const CreateSessionRequestSchema = v.object({
  projectId: IdSchema,
  artifactName: ArtifactNameSchema,
  environment: v.pipe(v.string(), v.minLength(1)),
})
export type CreateSessionRequest = v.InferOutput<typeof CreateSessionRequestSchema>

// Session response (API format with camelCase)
export const SessionResponseSchema = v.object({
  id: IdSchema,
  projectId: IdSchema,
  artifactName: v.string(),
  environment: v.string(),
  state: SessionStateSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type SessionResponse = v.InferOutput<typeof SessionResponseSchema>

// Session with URLs
export const SessionWithUrlsResponseSchema = v.object({
  ...SessionResponseSchema.entries,
  urls: ServiceUrlsSchema,
})
export type SessionWithUrlsResponse = v.InferOutput<typeof SessionWithUrlsResponseSchema>

// List sessions filter
export const ListSessionsFilterSchema = v.object({
  state: v.optional(SessionStateSchema),
  projectId: v.optional(IdSchema),
})
export type ListSessionsFilter = v.InferOutput<typeof ListSessionsFilterSchema>
```

### Route Updates

Update `orchestrator/src/routes/sessions.ts` to use Valibot validation:

```typescript
import * as v from 'valibot'
import { CreateSessionRequestSchema } from '../schemas/sessions.ts'

// In POST /sessions handler:
app.post('/', async (c) => {
  const rawBody = await c.req.json()
  const result = v.safeParse(CreateSessionRequestSchema, rawBody)

  if (!result.success) {
    return c.json({
      error: 'Validation failed',
      issues: result.issues.map(i => i.message)
    }, 400)
  }

  const body = result.output
  // ... rest of handler uses validated body
})
```

### CLI Updates

Update `cli/src/client.ts` to import types from orchestrator schemas:

```typescript
// Remove duplicate type definitions
// Import from orchestrator (or we can create a shared package later)
export type {
  HealthStatus,
  SessionResponse as Session,
  SessionWithUrlsResponse as SessionWithUrls,
  CreateSessionRequest,
  ListSessionsFilter,
} from '../../orchestrator/src/schemas/index.ts'
```

---

## Part 2: CLI Completion (Existing Plan)

### Current Progress
- [x] cli/package.json created
- [x] cli/tsconfig.json created
- [x] cli/src/config.ts created
- [x] cli/tests/client.test.ts created (16 tests passing)
- [x] cli/src/client.ts created
- [x] cli/src/output.ts created

### Remaining Steps

**Step 1: Commands (TDD)**
- Write tests for health command
- Write tests for session subcommands
- Implement commands

**Files:**
- [cli/tests/commands/health.test.ts](cli/tests/commands/health.test.ts)
- [cli/tests/commands/session.test.ts](cli/tests/commands/session.test.ts)
- [cli/src/commands/health.ts](cli/src/commands/health.ts)
- [cli/src/commands/session.ts](cli/src/commands/session.ts)

**Step 2: CLI Entry Point**
- Wire up Commander.js
- Add global options (--api-url, --json)

**Files:**
- [cli/src/index.ts](cli/src/index.ts)

---

## Implementation Order

1. **Add Valibot to orchestrator** - `bun add valibot`
2. **Create schemas** - `orchestrator/src/schemas/*.ts`
3. **Update routes** - Replace manual validation with Valibot
4. **Update CLI client** - Use shared types
5. **Complete CLI commands** - health, session subcommands
6. **Wire up entry point** - Commander.js integration

## Dependencies

**Orchestrator (add):**
```json
"dependencies": {
  "valibot": "^1.0.0"
}
```

**CLI (existing):**
```json
"dependencies": {
  "commander": "^12.0.0"
}
```

## Verification

1. **Schema tests**: Add tests for schema validation
   ```bash
   cd orchestrator && bun test tests/schemas/
   ```

2. **Route tests**: Existing tests should still pass
   ```bash
   cd orchestrator && bun test
   ```

3. **CLI tests**:
   ```bash
   cd cli && bun test
   ```

4. **Manual validation**:
   ```bash
   cd orchestrator && bun run dev &
   cd cli && bun run src/index.ts health
   bun run src/index.ts session create -p 79F4EF -n test-cli -e dev
   bun run src/index.ts session list
   ```

## Critical Files

| File | Purpose |
|------|---------|
| `orchestrator/src/schemas/sessions.ts` | Wire type schemas |
| `orchestrator/src/schemas/common.ts` | Shared primitives |
| `orchestrator/src/routes/sessions.ts` | Route validation |
| `cli/src/client.ts` | Type imports |
| `cli/src/commands/session.ts` | CLI commands |
| `cli/src/index.ts` | CLI entry point |
