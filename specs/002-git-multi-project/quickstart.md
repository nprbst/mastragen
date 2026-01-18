# Quickstart: Git & Multi-Project Support

**Feature Branch**: `002-git-multi-project`
**Created**: 2026-01-17

## Prerequisites

- **Bun** >= 1.0.0 (TypeScript runtime)
- **Docker** >= 24.0 (container orchestration)
- **Git** >= 2.40 (version control)
- **GitHub Account** with access to target repositories

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/org/mastragen.git
cd mastragen
git checkout 002-git-multi-project
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
bun install
```

### 3. Configure Environment

Create `orchestrator/.env`:

```bash
# Server
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/mastragen.db

# GitHub App (required for git operations)
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=your-installation-id

# Optional: Override for development
GITHUB_TOKEN=ghp_xxx  # Personal access token for testing
```

### 4. Initialize Database

```bash
cd orchestrator
bun run db:migrate
```

## Project Structure

```text
mastragen/
├── orchestrator/           # API server (Hono + Kysely)
│   ├── src/
│   │   ├── db/            # Database schema and migrations
│   │   ├── repositories/  # Data access layer
│   │   ├── routes/        # HTTP endpoints
│   │   ├── schemas/       # Valibot validation schemas
│   │   ├── services/      # Business logic (SandboxService, GitService, GitHubService)
│   │   └── config.ts      # Environment configuration
│   └── tests/             # Test suites
├── cli/                   # mgen CLI tool
├── sandbox/               # Container images
└── specs/                 # Feature specifications
    └── 002-git-multi-project/
        ├── spec.md        # Feature specification
        ├── plan.md        # Implementation plan
        ├── data-model.md  # Entity definitions
        ├── quickstart.md  # This file
        └── contracts/     # API contracts
```

## Development Commands

### Start Development Server

```bash
cd orchestrator
bun run dev
```

Server runs at `http://localhost:3000`.

### Run Tests

```bash
# All tests
cd orchestrator && bun test

# Specific test file
bun test tests/services/git.test.ts

# Watch mode
bun test --watch
```

### Run Migrations

```bash
cd orchestrator
bun run db:migrate
```

### Build for Production

```bash
cd orchestrator
bun run build
```

## Key Workflows

### Creating a Session with Git

```bash
# 1. Create a project (if not exists)
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-mastra-project",
    "githubRepo": "org/repo",
    "defaultBranch": "main",
    "branchPrefix": "mg/",
    "mastraPath": "."
  }'

# 2. Add an environment
curl -X POST http://localhost:3000/projects/{projectId}/environments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "development",
    "envVars": {}
  }'

# 3. Create a session (creates git branch)
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "abc123",
    "artifactName": "my-feature",
    "environment": "development",
    "userId": "user123"
  }'
```

### Suspend and Resume

```bash
# Suspend (commits and pushes changes)
curl -X POST http://localhost:3000/sessions/{sessionId}/suspend

# Resume (clones branch, starts containers)
curl -X POST http://localhost:3000/sessions/{sessionId}/resume

# Resume from specific commit
curl -X POST http://localhost:3000/sessions/{sessionId}/resume \
  -H "Content-Type: application/json" \
  -d '{"commitSha": "a1b2c3d4..."}'
```

### Create Pull Request

```bash
curl -X POST http://localhost:3000/sessions/{sessionId}/pull-request \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add my feature",
    "description": "This PR adds..."
  }'
```

## Testing Strategy

### Unit Tests

Test individual services in isolation:

```bash
bun test tests/services/git.test.ts
bun test tests/services/github.test.ts
```

### Integration Tests

Test route handlers with mocked services:

```bash
bun test tests/routes/sessions-git.test.ts
```

### E2E Tests

Full workflow tests (requires Docker):

```bash
bun test tests/e2e/git-workflow.test.ts
```

## Common Tasks

### Add a New Migration

```bash
# Create migration file
touch orchestrator/src/db/migrations/002_git_fields.ts

# Edit and export migration
# Run migrations
bun run db:migrate
```

### Add a New Service

1. Create service file: `orchestrator/src/services/myservice.ts`
2. Create test file: `orchestrator/tests/services/myservice.test.ts`
3. Wire into SandboxService or routes as needed

### Debug Git Operations

```bash
# Check Docker container logs
docker logs session-{id}

# Execute git commands in container
docker exec -it session-{id} git status
docker exec -it session-{id} git log --oneline -5
```

## Troubleshooting

### Database Lock Errors

```bash
# Remove stale database lock
rm orchestrator/data/mastragen.db-shm
rm orchestrator/data/mastragen.db-wal
```

### Docker Permission Issues

```bash
# Ensure Docker socket is accessible
sudo chmod 666 /var/run/docker.sock
```

### GitHub Rate Limits

The GitHubService uses exponential backoff (max 3 attempts over ~30s). Check `.env` for valid GitHub App credentials.

### Session Resume Fails

1. Check session state is `suspended` or `pr_open`
2. Verify no other pod has the session active
3. Check GitHub branch exists: `gh api repos/{owner}/{repo}/branches/{branchName}`
