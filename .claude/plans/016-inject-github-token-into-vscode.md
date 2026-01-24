# Plan: Inject GitHub Token and Git User Config into VSCode Container

## Problem Statement

The GitHub access token from the OAuth login flow is not being properly used in the VSCode container for git operations. Additionally, git user name and email are set to placeholder values instead of the authenticated user's actual identity.

## Root Cause Analysis

1. **Token Name Mismatch**:
   - User's GitHub token is passed as `GH_TOKEN` environment variable to containers
   - VSCode `entrypoint.sh` only checks for `GITHUB_TOKEN` (the orchestrator's token)
   - Result: User's personal token is ignored for git credentials

2. **Missing User Identity**:
   - User's name and email are stored in the database after OAuth
   - These values are NOT passed to the container
   - `entrypoint.sh` uses hardcoded placeholders: `mastragen@local` / `Mastragen`

## Implementation Steps

### 1. Update session creation route to fetch user name/email

**File:** [sessions.ts](orchestrator/src/routes/sessions.ts#L125-L134)

Extend the user info query to include `name` and `email`:

```typescript
let userGithubToken: string | undefined;
let userGitName: string | undefined;
let userGitEmail: string | undefined;
const user = getAuthUser(c);
if (user) {
  const dbUser = await db
    .selectFrom('users')
    .select(['github_access_token', 'name', 'email'])
    .where('id', '=', user.id)
    .executeTakeFirst();
  userGithubToken = dbUser?.github_access_token ?? undefined;
  userGitName = dbUser?.name ?? undefined;
  userGitEmail = dbUser?.email ?? undefined;
}
```

Pass to `sandboxService.create()`:
```typescript
const result = await sandboxService.create({
  ...body,
  claudeToken,
  userGithubToken,
  userGitName,
  userGitEmail,
});
```

### 2. Update resume route to pass user info

**File:** [sessions.ts](orchestrator/src/routes/sessions.ts#L263-L264)

Add the same user info fetching logic before calling `sandboxService.resume()`:

```typescript
const result = await sandboxService.resume(id, claudeToken, {
  userGithubToken,
  userGitName,
  userGitEmail,
});
```

### 3. Update sandbox service interfaces and methods

**File:** [sandbox.ts](orchestrator/src/services/sandbox.ts#L102-L109)

Extend `CreateSandboxInput`:
```typescript
export interface CreateSandboxInput {
  projectId: string;
  artifactName: string;
  environment: string;
  claudeToken?: string;
  userId?: string;
  userGithubToken?: string;
  userGitName?: string;
  userGitEmail?: string;
}
```

Add new `ResumeOptions` interface:
```typescript
export interface ResumeOptions {
  userGithubToken?: string;
  userGitName?: string;
  userGitEmail?: string;
}
```

### 4. Update `startContainers` to pass new env vars

**File:** [sandbox.ts](orchestrator/src/services/sandbox.ts#L943-L993)

Update method signature:
```typescript
private async startContainers(
  session: Session,
  project: Project,
  envVars: string,
  claudeToken?: string,
  userId?: string,
  userGithubToken?: string,
  userGitName?: string,
  userGitEmail?: string
): Promise<void> {
```

Update `baseEnv`:
```typescript
const baseEnv = [
  `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
  `GH_TOKEN=${userGithubToken || ''}`,
  `GIT_USER_NAME=${userGitName || ''}`,
  `GIT_USER_EMAIL=${userGitEmail || ''}`,
  `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
  ...Object.entries(parsedEnvVars).map(([k, v]) => `${k}=${v}`),
];
```

### 5. Update `resume` method signature

**File:** [sandbox.ts](orchestrator/src/services/sandbox.ts#L572)

```typescript
async resume(
  sessionId: string,
  claudeToken?: string,
  options?: ResumeOptions
): Promise<ResumeSandboxResult> {
```

Pass options to `startContainers` call.

### 6. Update VSCode container entrypoint

**File:** [entrypoint.sh](sandbox/code-server/entrypoint.sh#L4-L13)

Replace the existing git config block:
```bash
# Configure git credentials - prefer user token (GH_TOKEN) over orchestrator token (GITHUB_TOKEN)
EFFECTIVE_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -n "$EFFECTIVE_TOKEN" ]; then
    git config --global credential.helper store
    echo "https://x-access-token:${EFFECTIVE_TOKEN}@github.com" > ~/.git-credentials
fi

# Configure git user identity - use provided values or fall back to placeholders
if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
elif [ -z "$(git config --global user.email)" ]; then
    git config --global user.email "mastragen@local"
fi

if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
elif [ -z "$(git config --global user.name)" ]; then
    git config --global user.name "Mastragen"
fi
```

### 7. Update init container script

**File:** [clone.sh](sandbox/init/clone.sh#L15-L20)

```bash
# Configure git credentials - prefer user token (GH_TOKEN) over orchestrator token (GITHUB_TOKEN)
EFFECTIVE_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -n "$EFFECTIVE_TOKEN" ]; then
    echo "Configuring git credentials..."
    git config --global credential.helper store
    echo "https://x-access-token:${EFFECTIVE_TOKEN}@github.com" > ~/.git-credentials
fi
```

### 8. Update init container env vars in sandbox service

**File:** [sandbox.ts](orchestrator/src/services/sandbox.ts) - `runInitContainer` method

Pass `GH_TOKEN` to the init container:
```typescript
Env: [
  `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
  `GH_TOKEN=${userGithubToken || ''}`,
  `GITHUB_REPO=${githubRepo}`,
  ...(branch ? [`BRANCH=${branch}`] : []),
],
```

## Files to Modify

1. [orchestrator/src/routes/sessions.ts](orchestrator/src/routes/sessions.ts) - Session create/resume routes
2. [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts) - Interface and method updates
3. [sandbox/code-server/entrypoint.sh](sandbox/code-server/entrypoint.sh) - Git credential and user config
4. [sandbox/init/clone.sh](sandbox/init/clone.sh) - Token preference for cloning

## Verification

1. Create a new session with an authenticated user
2. Open VSCode container terminal and verify:
   - `echo $GH_TOKEN` shows the user's GitHub token
   - `git config user.name` shows the user's name
   - `git config user.email` shows the user's email
   - `cat ~/.git-credentials` shows the user's token
3. Make a git commit and verify author info matches the user
4. Resume a suspended session and verify git config persists
