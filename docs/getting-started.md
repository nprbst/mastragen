# Getting Started with Mastragen

This guide walks you through setting up Mastragen and creating your first project and session.

## Overview

Mastragen helps developers explore data analysis and automation with Claude, then capture successful work as production-ready Mastra artifacts. The system consists of three components:

- **CLI** (`mgen`) - Command-line tool for managing projects and sessions
- **Web Dashboard** - Browser interface for viewing sessions and configuring projects
- **Orchestrator** - API server that coordinates sandbox environments

## Prerequisites

- **Bun 1.3+** - JavaScript runtime ([bun.sh](https://bun.sh))
- **Docker** - For running sandbox containers
- **GitHub account** - With a GitHub App installed (see [GitHub App Setup](./github-app-setup.md))
- **Tailscale** (optional) - For secure sandbox access

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/nprbst/mastragen.git
cd mastragen

# Install dependencies for all packages
bun install
```

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Required environment variables:
- `GITHUB_APP_ID` - Your GitHub App ID
- `GITHUB_CLIENT_ID` - OAuth client ID
- `GITHUB_CLIENT_SECRET` - OAuth client secret
- `GITHUB_PRIVATE_KEY` - App private key (base64 encoded)

See [GitHub App Setup](./github-app-setup.md) for details.

### 3. Start Services

```bash
# Start the orchestrator (API server)
cd orchestrator && bun run dev

# In another terminal, start the web dashboard
cd web && bun run dev
```

The web dashboard will be available at http://localhost:4321

## Your First Project

Projects represent a Mastra codebase configuration pointing to a GitHub repository. You create projects via the CLI.

### Creating a Project

Run the interactive project creation:

```bash
mgen project create
```

You'll be prompted for:

| Field | Description | Example |
|-------|-------------|---------|
| **Project name** | Human-readable name (must be unique) | `my-analytics` |
| **GitHub repository** | Repo in `org/repo` format | `myorg/my-mastra-project` |
| **UI sandbox path** | Optional path to UI code | `packages/ui` |

Or use flags for non-interactive creation:

```bash
mgen project create \
  --name my-analytics \
  --repo myorg/my-mastra-project \
  --branch main \
  --prefix mg/ \
  --mastra-path src/mastra
```

### Project Fields Explained

| Field | Default | Purpose |
|-------|---------|---------|
| `name` | (required) | Unique identifier for the project |
| `githubRepo` | (required) | GitHub repository in `org/repo` format |
| `defaultBranch` | `main` | Base branch for new sessions |
| `branchPrefix` | `mg/` | Prefix for session branches (e.g., `mg/my-feature`) |
| `mastraPath` | `.` | Path to Mastra code within the repository |
| `uiSandboxPath` | (none) | Path to UI sandbox code (enables Astro service) |

### Adding Environments

Each project needs at least one environment before you can create sessions. Environments hold configuration like environment variables.

```bash
mgen project env add
```

You'll be prompted to select a project and enter an environment name (e.g., `dev`, `staging`, `prod`).

Or use flags:

```bash
mgen project env add <project-id> \
  --name dev \
  --env-var API_KEY=your-key \
  --env-var DEBUG=true
```

### Verify Your Project

List all projects:

```bash
mgen project list
```

View project details:

```bash
mgen project get <project-id>
```

Or view in the web dashboard at http://localhost:4321/projects/<project-id>

## Your First Session

Sessions are isolated development environments where you work with Claude on a specific artifact.

### Create via Web Dashboard

1. Navigate to http://localhost:4321
2. Click **New Session**
3. Select your project
4. Select an environment
5. Enter an artifact name (lowercase, hyphens allowed)
6. Click **Create Session**

### Create via CLI

```bash
mgen session create
```

You'll be prompted for project, environment, artifact name, and optionally a Claude token.

Or use flags:

```bash
mgen session create \
  --project my-analytics \
  --name my-feature \
  --env dev \
  --cached-token \
  --open all
```

The `--open all` flag opens VS Code, Mastra Studio, and Astro (if configured) in Chrome.

### What Happens When You Create a Session

1. **Branch created** - A new branch (e.g., `mg/my-feature`) is created from the default branch
2. **Sandbox provisioned** - Docker containers are started with your code
3. **Services available** - VS Code, Mastra Studio, and optionally Astro become accessible

### Accessing Session Services

Each session provides access to:

| Service | Purpose |
|---------|---------|
| **VS Code** | Claude Code IDE for development |
| **Mastra Studio** | Mastra workflow visualization and testing |
| **Astro** | UI sandbox (if `uiSandboxPath` is configured) |

Service URLs are displayed after session creation and in the web dashboard.

## Project Administration

The web dashboard provides a project admin interface at `/projects/<project-id>` with five tabs:

### Overview Tab
Edit project settings: name, GitHub repo, default branch, branch prefix, and paths.

### Environments Tab
Manage environments and their variables. Add new environments or modify existing ones.

### Claude Config Tab
Configure Claude Code settings:
- **MCP servers** - Model Context Protocol servers to enable
- **CLAUDE.md** - Project-specific instructions for Claude
- **Auto-approve patterns** - Commands Claude can run without confirmation

### Skills Tab
Upload custom skills (domain knowledge files) that Claude can use during sessions.

### Access Tab
Manage team members and their permission levels (admin/member).

## Adding a Second Project

To add another project to the system:

```bash
mgen project create --name second-project --repo myorg/another-repo
mgen project env add --name dev
```

Then create sessions in either project as needed.

## CLI Reference

### Project Commands

```bash
mgen project create          # Create a new project
mgen project list            # List all projects (alias: ls)
mgen project get [id]        # View project details
mgen project env add [id]    # Add environment to project
mgen project env list [id]   # List environments (alias: ls)
```

### Session Commands

```bash
mgen session create          # Create a new session
mgen session list            # List all sessions (alias: ls)
mgen session resume [id]     # Resume a suspended session
mgen session suspend [id]    # Suspend a running session
```

### Common Options

- `--json` - Output as JSON (for scripting)
- `--help` - Show help for any command

## Next Steps

- Configure Claude settings for your project in the web dashboard
- Create sessions and start developing with Claude
- Review the [Architecture Documentation](./mastragen-architecture-v4.md) for deeper understanding
