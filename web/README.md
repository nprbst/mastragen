# Mastragen Web Dashboard

Astro 5 SSR + React dashboard for managing Mastra development sessions.

## Quick Start

### Prerequisites

- Bun 1.3+
- Running orchestrator (`cd ../orchestrator && bun run dev`)
- GitHub App configured (see [GitHub App Setup](../docs/github-app-setup.md))

### Development

```bash
bun install
bun run dev
```

The dashboard will be available at http://localhost:4321

### Build

```bash
bun run build
bun run preview
```

## Stack

- **Astro 5** with React islands for interactivity
- **Tailwind CSS** for styling
- **oRPC client** for type-safe orchestrator communication
- **GitHub OAuth** for authentication

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Sessions dashboard - view and manage all sessions |
| `/sessions/new` | Create a new session |
| `/projects/[id]` | Project administration settings |
| `/auth/login` | GitHub OAuth login |
| `/auth/callback` | OAuth callback handler |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PUBLIC_ORCHESTRATOR_URL` | URL to the orchestrator API (default: `http://localhost:3000`) |

## Project Administration

The project admin page (`/projects/[id]`) provides 5 configuration tabs:

- **Overview** - Project name, GitHub repo, branch settings, paths
- **Environments** - Manage environment variables per environment
- **Claude Config** - MCP servers, CLAUDE.md content, auto-approve patterns
- **Skills** - Custom skills for Claude Code sessions
- **Access** - Team member management and permissions

## Related Documentation

- [Getting Started Guide](../docs/getting-started.md) - First-time setup and adding projects
- [GitHub App Setup](../docs/github-app-setup.md) - OAuth and API access configuration
- [Architecture](../docs/mastragen-architecture-v4.md) - Technical design specification
