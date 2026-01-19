# Quickstart: cui Configuration & Landing Page (Phase 3)

**Feature**: 003-cui-config-landing-page
**Date**: 2026-01-18

## Prerequisites

### Runtime Requirements
- **Bun**: 1.x or later
- **Node.js**: 20.x or later (for Next.js landing page)
- **Docker**: 24.x or later
- **Git**: 2.x or later

### Environment Variables

Create a `.env` file in the repository root:

```bash
# Orchestrator
DATABASE_PATH=./data/mastragen.db
ORCHESTRATOR_PORT=8000
ORCHESTRATOR_HOST=0.0.0.0

# Authentication (OIDC)
OIDC_PROVIDER=google  # or github, azure
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:8000/auth/callback
JWT_SECRET=your-jwt-secret-at-least-32-chars

# GitHub (for git operations)
GITHUB_TOKEN=ghp_your_github_token
GITHUB_APP_ID=your-app-id  # if using GitHub App
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...

# Tailscale (for session sharing)
TAILSCALE_API_KEY=tskey-api-...
TAILSCALE_TAILNET=your-tailnet-name

# Claude/Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Landing Page
PUBLIC_ORCHESTRATOR_URL=http://localhost:8000
```

### External Services

1. **OIDC Provider**: Configure OAuth application in Google/GitHub/Azure
2. **GitHub**: Personal access token or GitHub App credentials
3. **Tailscale**: API key from [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
4. **Anthropic**: API key from [Anthropic Console](https://console.anthropic.com/)

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/mastragen.git
cd mastragen
git checkout 003-cui-config-landing-page
```

### 2. Install Dependencies

```bash
# Root workspace
bun install

# Orchestrator
cd orchestrator && bun install && cd ..

# Landing Page (when created)
cd landing-page && bun install && cd ..
```

### 3. Initialize Database

```bash
cd orchestrator
bun run db:migrate
bun run db:seed  # Optional: seed with test data
cd ..
```

## Development Commands

### Orchestrator (Backend)

```bash
cd orchestrator

# Start development server (with hot reload)
bun run dev

# Run tests
bun test                    # All tests
bun test:watch             # Watch mode
bun test tests/unit        # Unit tests only
bun test tests/integration # Integration tests
bun test tests/e2e         # End-to-end tests

# Linting & Formatting
bun run check              # Biome check
bun run check:fix          # Auto-fix issues
bun run typecheck          # TypeScript check

# Full preflight (before commit)
bun run preflight
```

### Landing Page (Frontend - Astro)

```bash
cd landing-page

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview

# Run tests
bun test

# Linting & type check
bun run check
```

### Full Stack Development

From repository root:

```bash
# Start all services (orchestrator + landing page)
bun run dev

# Or manually in separate terminals:
# Terminal 1: cd orchestrator && bun run dev
# Terminal 2: cd landing-page && npm run dev
```

## Project Structure

```text
mastragen/
├── orchestrator/              # Backend API (Hono + Bun)
│   ├── src/
│   │   ├── db/               # Database (Kysely + SQLite)
│   │   │   ├── migrations/   # Schema migrations
│   │   │   └── types.ts      # Type definitions
│   │   ├── routes/           # API route handlers
│   │   ├── services/         # Business logic
│   │   ├── repositories/     # Data access layer
│   │   ├── schemas/          # Valibot validation schemas
│   │   └── middleware/       # Hono middleware
│   └── tests/                # Test files
│
├── landing-page/             # Frontend (Astro + React)
│   ├── src/
│   │   ├── pages/           # Astro pages (file-based routing)
│   │   ├── layouts/         # Astro layouts
│   │   ├── components/      # React islands + Astro components
│   │   └── lib/             # oRPC client & utilities
│   └── tests/
│
├── cli/                      # CLI tool (existing)
├── sandbox/                  # Container definitions (existing)
│
├── cui-commands/             # Built-in slash commands
│   ├── suspend.md
│   ├── pr.md
│   ├── share.md
│   ├── extract.md
│   └── env.md
│
├── cui-skills/               # Built-in skills
│   ├── mastra-development.md
│   ├── artifact-extraction.md
│   └── session-management.md
│
└── specs/                    # Feature specifications
    └── 003-cui-config-landing-page/
```

## Common Tasks

### Adding a New API Route

1. Create route file in `orchestrator/src/routes/`
2. Add Valibot schema in `orchestrator/src/schemas/`
3. Register route in `orchestrator/src/index.ts`
4. Write tests in `orchestrator/tests/routes/`

### Adding a New Database Table

1. Create migration in `orchestrator/src/db/migrations/`
2. Add types in `orchestrator/src/db/types.ts`
3. Create repository in `orchestrator/src/repositories/`
4. Run `bun run db:migrate`

### Adding a Landing Page Route

1. Create `.astro` page in `landing-page/src/pages/`
2. For interactive components, create React `.tsx` in `landing-page/src/components/`
3. Use `client:load` directive to hydrate React islands
4. oRPC client auto-generates types from orchestrator

**Example Astro page with React island:**
```astro
---
// src/pages/sessions/new.astro
import Layout from '../layouts/Layout.astro';
import NewSessionForm from '../components/NewSessionForm.tsx';
---
<Layout title="New Session">
  <h1>Create New Session</h1>
  <NewSessionForm client:load />
</Layout>
```

### Adding a Built-in Command

1. Create markdown file in `cui-commands/`
2. Follow template structure (see existing commands)
3. Command will be auto-injected to all new sessions

### Adding a Built-in Skill

1. Create markdown file in `cui-skills/`
2. Document knowledge/patterns/guidance
3. Skill will be auto-injected to all new sessions

## Testing

### Test Structure

```text
tests/
├── unit/                 # Fast, isolated unit tests
├── integration/          # Tests with real DB
└── e2e/                  # Full API tests
```

### Running Specific Tests

```bash
# Single file
bun test tests/routes/auth.test.ts

# Pattern match
bun test --grep "should authenticate"

# With coverage
bun test --coverage
```

### Test Utilities

```typescript
// tests/helpers/db.ts - Test database setup
import { createTestDatabase } from './helpers/db';
const db = await createTestDatabase();

// tests/helpers/auth.ts - Mock authentication
import { createTestUser, createTestToken } from './helpers/auth';
const user = await createTestUser(db);
const token = createTestToken(user);
```

## Debugging

### Orchestrator Logs

```bash
# Verbose logging
DEBUG=* bun run dev

# Specific module
DEBUG=mastragen:auth bun run dev
```

### Database Inspection

```bash
# SQLite CLI
sqlite3 ./data/mastragen.db

# Common queries
.tables
SELECT * FROM sessions WHERE state = 'active';
SELECT * FROM users;
```

### Network Debugging

```bash
# Test API endpoints
curl http://localhost:8000/health
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/sessions
```

## Deployment

### Build

```bash
# Orchestrator (Bun bundles automatically)
cd orchestrator && bun build src/index.ts --outdir=dist

# Landing Page
cd landing-page && npm run build
```

### Environment Configuration

Production environment variables:
- Set `NODE_ENV=production`
- Use real OIDC credentials
- Configure production database path
- Set secure JWT secret (32+ chars)
- Enable HTTPS for all URLs

## Troubleshooting

### Common Issues

**"Database is locked"**
- Only one process can write to SQLite at a time
- Ensure no other development server is running

**"OIDC callback failed"**
- Verify redirect URI matches provider configuration
- Check client ID and secret

**"Session container won't start"**
- Ensure Docker daemon is running
- Check for port conflicts (3001, 4111, 4321, 8080)
- Verify sandbox images are built

**"Tailscale share not working"**
- Verify API key has correct permissions
- Check user exists in tailnet
- Review ACL configuration

## Resources

- [Hono Documentation](https://hono.dev/)
- [Kysely Documentation](https://kysely.dev/)
- [better-auth Documentation](https://better-auth.com/)
- [Astro Documentation](https://docs.astro.build/)
- [Astro + React](https://docs.astro.build/en/guides/integrations-guide/react/)
- [oRPC Documentation](https://orpc.dev/)
- [Tailscale API](https://tailscale.com/api)
