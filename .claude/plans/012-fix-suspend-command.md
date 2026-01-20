# Fix /suspend Command: Environment Variables & Session Authentication

## Problem Statement

The `/suspend` command (and other sandbox-to-orchestrator commands like `/pr`) cannot work because:

1. **Environment variables not available in user shells** - `env.sh` is sourced in entrypoint but new VS Code terminal sessions don't inherit the variables
2. **MASTRAGEN_USER_TOKEN is a placeholder** - Currently just `session-token-{sessionId}`, not a valid token
3. **Session endpoints have no auth middleware** - `/suspend`, `/resume`, `/pr` endpoints accept any request

## Solution

### Part 1: Fix Environment Variable Inheritance

**File:** `sandbox/code-server/entrypoint.sh`

Add sourcing of `env.sh` to `.bashrc` so all new terminal sessions have the variables:

```bash
# After the existing source block (lines 19-22), add:
# Ensure session env vars are available in all new shell sessions
if [ -f /home/coder/.claude/env.sh ]; then
    if ! grep -q "source /home/coder/.claude/env.sh" ~/.bashrc 2>/dev/null; then
        echo "" >> ~/.bashrc
        echo "# Session environment variables (injected by mastragen)" >> ~/.bashrc
        echo "source /home/coder/.claude/env.sh" >> ~/.bashrc
    fi
fi
```

### Part 2: Generate Session-Scoped JWT

**File:** `orchestrator/src/services/auth.ts`

Add a new method to generate session-scoped tokens:

```typescript
async generateSessionToken(sessionId: string, userId: string): Promise<string> {
  const jwt = new SignJWT({
    sessionId,
    userId,
    type: 'session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // Match session lifetime
    .setSubject(sessionId);

  return jwt.sign(this.secret);
}
```

Add verification for session tokens:

```typescript
async verifySessionToken(token: string): Promise<{ sessionId: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, this.secret);
    if (payload.type !== 'session') return null;
    return {
      sessionId: payload.sessionId as string,
      userId: payload.userId as string,
    };
  } catch {
    return null;
  }
}
```

### Part 3: Inject Real Token

**File:** `orchestrator/src/services/claude-injection.ts`

Update `getSessionEnvVars` to accept and use a real token:

```typescript
async getSessionEnvVars(config: SessionEnvVarsConfig & { sessionToken?: string }): Promise<Record<string, string>> {
  // ... existing code ...

  envVars.MASTRAGEN_SESSION_ID = config.sessionId;
  envVars.MASTRAGEN_API_URL = apiUrl;
  envVars.MASTRAGEN_USER_TOKEN = config.sessionToken ?? ''; // Real token, not placeholder

  return envVars;
}
```

**File:** `orchestrator/src/services/sandbox.ts`

Generate the session token in `injectClaudeConfig`:

```typescript
private async injectClaudeConfig(...) {
  // ... existing code ...

  // Generate session-scoped JWT for API authentication
  const authService = new AuthService(this.db);
  const sessionToken = await authService.generateSessionToken(sessionId, config.userId ?? '');

  const envVars = await this.claudeInjectionService.getSessionEnvVars({
    projectId: config.projectId,
    environment: config.environment,
    sessionId,
    userId: config.userId ?? '',
    sessionToken, // Pass the real token
  });

  // ... rest of existing code ...
}
```

### Part 4: Return Session Token in API Response

The CLI needs the session token to make authenticated requests. Return it in the create/resume response.

**File:** `orchestrator/src/schemas/sessions.ts`

Add `sessionToken` to the response schema:

```typescript
export const SessionWithUrlsResponseSchema = z.object({
  session: SessionSchema,
  urls: ServiceUrlsSchema,
  sessionToken: z.string().optional(), // JWT for session-scoped auth
});
```

**File:** `orchestrator/src/routes/sessions.ts`

Generate and return the token in POST `/sessions` and POST `/sessions/:id/resume`:

```typescript
// In POST /sessions handler:
const authService = new AuthService(db);
const sessionToken = await authService.generateSessionToken(result.session.id, input.userId ?? '');

return c.json({
  session: result.session,
  urls: result.urls,
  sessionToken,
});
```

### Part 5: CLI Token Storage and Usage

**File:** `cli/src/client.ts`

Store session token locally and include in subsequent requests:

```typescript
// After createSession() succeeds, store the token
async createSession(input: CreateSessionInput): Promise<SessionWithUrls> {
  const response = await this.post('/sessions', input);

  // Store session token for later use
  if (response.sessionToken) {
    await this.storeSessionToken(response.session.id, response.sessionToken);
  }

  return response;
}

// Include token in session-scoped requests
async suspendSession(id: string, message?: string): Promise<Session> {
  const token = await this.getSessionToken(id);
  return this.post(`/sessions/${id}/suspend`, { message }, token);
}
```

**File:** `cli/src/utils/session-token.ts` (new file)

Token storage utilities (similar pattern to `claude-token.ts`):

```typescript
import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';

const SESSION_TOKENS_DIR = join(homedir(), '.mgen', 'sessions');

export async function storeSessionToken(sessionId: string, token: string): Promise<void> {
  await mkdir(SESSION_TOKENS_DIR, { recursive: true });
  await writeFile(join(SESSION_TOKENS_DIR, sessionId), token, 'utf-8');
}

export async function getSessionToken(sessionId: string): Promise<string | null> {
  try {
    return await readFile(join(SESSION_TOKENS_DIR, sessionId), 'utf-8');
  } catch {
    return null;
  }
}
```

### Part 6: Add Session Auth Middleware

**File:** `orchestrator/src/middleware/auth.ts`

Add session-scoped auth middleware:

```typescript
export function requireSessionAuth(): MiddlewareHandler<Variables> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);
    const authService = new AuthService(c.get('db'));
    const session = await authService.verifySessionToken(token);

    if (!session) {
      return c.json({ error: 'Invalid session token' }, 401);
    }

    // Verify the session ID in the token matches the route parameter
    const sessionId = c.req.param('id');
    if (session.sessionId !== sessionId) {
      return c.json({ error: 'Token does not match session' }, 403);
    }

    c.set('sessionAuth', session);
    await next();
  };
}
```

**File:** `orchestrator/src/routes/sessions.ts`

Add middleware to session endpoints:

```typescript
// POST /sessions/:id/suspend
sessions.post('/:id/suspend', requireSessionAuth(), async (c) => { ... });

// POST /sessions/:id/resume
sessions.post('/:id/resume', requireSessionAuth(), async (c) => { ... });

// POST /sessions/:id/pr
sessions.post('/:id/pr', requireSessionAuth(), async (c) => { ... });

// POST /sessions/:id/activity
sessions.post('/:id/activity', requireSessionAuth(), async (c) => { ... });
```

## Files to Modify

| File | Change |
|------|--------|
| `sandbox/code-server/entrypoint.sh` | Source env.sh in .bashrc |
| `orchestrator/src/services/auth.ts` | Add `generateSessionToken()` and `verifySessionToken()` |
| `orchestrator/src/services/claude-injection.ts` | Accept sessionToken param, remove placeholder |
| `orchestrator/src/services/sandbox.ts` | Generate and pass session token |
| `orchestrator/src/middleware/auth.ts` | Add `requireSessionAuth()` middleware |
| `orchestrator/src/routes/sessions.ts` | Apply middleware, return token in response |
| `orchestrator/src/schemas/sessions.ts` | Add `sessionToken` to response schema |
| `cli/src/client.ts` | Store and use session tokens |
| `cli/src/utils/session-token.ts` | New file for token storage utilities |

## Verification

### In-Sandbox Testing (Claude commands)
1. **Build and start** the orchestrator and sandbox containers
2. **Create a new session** via `mgen session create`
3. **Open VS Code terminal** in the sandbox
4. **Verify env vars**: `echo $MASTRAGEN_USER_TOKEN` should show a JWT (not placeholder)
5. **Test /suspend**: Run `/suspend` command - should authenticate successfully

### CLI Testing
6. **Create session**: `mgen session create` - should store token in `~/.mgen/sessions/`
7. **Resume session**: `mgen session resume <id>` - should use stored token
8. **Verify token file**: `cat ~/.mgen/sessions/<session-id>` - should show JWT

### Security Testing
9. **Test invalid token**: Manually curl with wrong token - should get 401
10. **Test wrong session**: Use valid token for session A against session B endpoint - should get 403
11. **Test no token**: Curl without Authorization header - should get 401
