# Claude Max Authentication UX for cui-server

## Overview

Enable users to authenticate with their Claude Max subscription from within Mastragen sandbox containers using `claude setup-token` OAuth tokens.

## Background

`claude setup-token` generates a long-lived OAuth token (valid 1 year) that works like an API key:
```
claude setup-token
---
✓ Long-lived authentication token created successfully!

Your OAuth token (valid for 1 year):
sk-ant-oat01-...
```

This token is passed via `CLAUDE_CODE_OAUTH_TOKEN` environment variable.

**Security requirement:** Token must NOT be persisted in git or workspace. User re-supplies on each session resume.

---

## UX Flow

### CLI: Session Create (with cached token)
```
$ mgen session create
? Select a project: my-project
? Artifact name: feature-x
? Environment: development

Found Claude token in ~/.claude/.token
? Use cached token (sk-ant-oat01-...XXXX)? [Y/n/enter new]

✓ Session created!
  CUI: http://localhost:3001#token=abc123
  Claude Max: Authenticated ✓
```

### CLI: Session Create (no cached token)
```
$ mgen session create
? Select a project: my-project
? Artifact name: feature-x
? Environment: development

? Enter Claude token (from `claude setup-token`), or press Enter to skip:
  sk-ant-oat01-...

? Save token to ~/.claude/.token for future sessions? [Y/n]

✓ Session created!
  CUI: http://localhost:3001#token=abc123
  Claude Max: Authenticated ✓
```

### CLI: Session Resume
```
$ mgen session resume
? Select session: my-project/feature-x (suspended)

? Use cached token (sk-ant-oat01-...XXXX)? [Y/n/enter new]

✓ Session resumed!
  CUI: http://localhost:3001#token=abc123
  Claude Max: Authenticated ✓
```

### Web UI: Session Create
The orchestrator web UI will include a token input field:
- Optional text input for Claude OAuth token
- Masked/password field for security
- Placeholder text: "Paste token from `claude setup-token`"
- Token passed in POST /sessions request body

### Token Skipped
If user skips the token prompt:
- Session starts without Claude Max auth
- Falls back to `ANTHROPIC_API_KEY` if configured in project environment
- User can authenticate later by restarting session with token

---

## Implementation

### 1. CLI Changes

**File:** `cli/src/utils/claude-token.ts` (NEW)

Token caching utilities:
```typescript
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TOKEN_PATH = join(homedir(), '.claude', '.token');

export function getCachedToken(): string | null {
  if (!existsSync(TOKEN_PATH)) return null;
  return readFileSync(TOKEN_PATH, 'utf-8').trim();
}

export function saveCachedToken(token: string): void {
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

export function truncateToken(token: string): string {
  // Show first 15 chars + last 4: "sk-ant-oat01-Uq...XXXX"
  if (token.length <= 20) return token;
  return `${token.slice(0, 15)}...${token.slice(-4)}`;
}
```

**File:** `cli/src/commands/session.ts`

Add token prompt logic:
```typescript
import { getCachedToken, saveCachedToken, truncateToken } from '../utils/claude-token';

// Token prompt helper
async function promptForClaudeToken(): Promise<string | undefined> {
  const cached = getCachedToken();

  if (cached) {
    const useCached = await p.select({
      message: `Use cached Claude token (${truncateToken(cached)})?`,
      options: [
        { value: 'yes', label: 'Yes, use cached token' },
        { value: 'new', label: 'Enter a different token' },
        { value: 'skip', label: 'Skip (no Claude Max)' },
      ],
    });

    if (useCached === 'yes') return cached;
    if (useCached === 'skip') return undefined;
  }

  const token = await p.password({
    message: 'Enter Claude token (from `claude setup-token`), or press Enter to skip:',
  });

  if (token && !cached) {
    const save = await p.confirm({
      message: 'Save token to ~/.claude/.token for future sessions?',
      initialValue: true,
    });
    if (save) saveCachedToken(token);
  }

  return token || undefined;
}
```

**File:** `cli/src/client.ts`

Update request types:
```typescript
interface CreateSessionRequest {
  projectId: string;
  artifactName: string;
  environment: string;
  claudeToken?: string;  // NEW
}

interface ResumeSessionRequest {
  claudeToken?: string;  // NEW
}
```

### 2. Orchestrator API Changes

**File:** `orchestrator/src/schemas/index.ts`

Update request schemas:
```typescript
export const CreateSessionRequestSchema = v.object({
  projectId: v.string(),
  artifactName: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
  environment: v.string(),
  claudeToken: v.optional(v.string()),  // NEW
});

export const ResumeSessionRequestSchema = v.object({
  claudeToken: v.optional(v.string()),  // NEW
});
```

**File:** `orchestrator/src/routes/sessions.ts`

Accept token in request body for POST `/sessions` and POST `/sessions/:id/resume`.

### 3. Sandbox Service Changes

**File:** `orchestrator/src/services/sandbox.ts`

Pass token to container startup:

```typescript
// In create() and resume()
async create(options: {
  projectId: string;
  artifactName: string;
  environment: string;
  claudeToken?: string;  // NEW
}) {
  // ...existing code...

  // Start containers with token if provided
  await this.startContainers(session, parsedEnvVars, options.claudeToken);
}

// In startContainers()
private async startContainers(
  session: Session,
  envVars: Record<string, string>,
  claudeToken?: string
) {
  const cuiEnv = {
    ...envVars,
    CUI_AUTH_TOKEN: session.cui_auth_token,
  };

  // Add Claude OAuth token if provided (uses Max subscription)
  if (claudeToken) {
    cuiEnv.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;
  }

  // ...rest of container startup
}
```

### 4. Response Enhancement

**File:** `orchestrator/src/schemas/index.ts`

Add auth status to session response:
```typescript
export interface SessionWithUrlsResponse extends SessionResponse {
  urls: ServiceUrls;
  claudeAuth?: {
    authenticated: boolean;
    method: 'oauth_token' | 'api_key' | 'none';  // oauth_token = Claude Max subscription
  };
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| [cli/src/utils/claude-token.ts](cli/src/utils/claude-token.ts) | NEW - Token caching utilities |
| [cli/src/commands/session.ts](cli/src/commands/session.ts) | Add token prompt to create/resume |
| [cli/src/client.ts](cli/src/client.ts) | Add claudeToken to request types |
| [orchestrator/src/schemas/index.ts](orchestrator/src/schemas/index.ts) | Add claudeToken to request schemas |
| [orchestrator/src/routes/sessions.ts](orchestrator/src/routes/sessions.ts) | Accept token in create/resume |
| [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts) | Pass token to container env |

---

## Security Notes

1. **Token not persisted** - Only lives in container memory during active session
2. **Not in git** - Token passed via env var, never written to workspace
3. **Re-entry on resume** - User must re-supply token each resume (by design)
4. **Masked input** - CLI uses `p.password()` to hide token during entry
5. **Optional** - Users can skip and use API key or no auth

---

## Verification Plan

### Manual Testing
1. Run `claude setup-token` locally, copy the token
2. Create session: `mgen session create` - enter token when prompted
3. Verify CUI works with Claude Max subscription
4. Suspend session: `mgen session suspend`
5. Resume session: `mgen session resume` - re-enter token
6. Verify CUI still works
7. Test skip path - create session without token, verify fallback behavior

### Unit Tests
1. CLI prompts for token at correct points
2. Token passed correctly in API requests
3. Token injected into container env vars
4. Session works without token (fallback path)

### Integration Tests
1. Full create flow with token
2. Full resume flow with token re-entry
3. Create → suspend → resume cycle

---

## Implementation Order

1. **Schema updates** - Add claudeToken to request schemas
2. **Sandbox service** - Pass token to container startup
3. **Routes** - Accept token in create/resume endpoints
4. **CLI client** - Add token to request types
5. **CLI token utils** - Create claude-token.ts with caching logic
6. **CLI commands** - Add token prompts to create/resume
7. **Tests** - Unit and integration tests

---

## Reference

- [Claude Code Action - Setup Guide](https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md)
