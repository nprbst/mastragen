# Mastragen: Architecture Specification v4

**Version:** 4.0.0  
**Date:** January 2026  
**Status:** Ready for Implementation

---

## Executive Summary

Mastragen is a **general-purpose platform for Mastra-based AI development**. It enables developers to explore data analysis and automation tasks with Claude, then capture successful sessions as production-ready Mastra artifacts (tools, agents, workflows).

### Key Capabilities

1. **Multi-project support**: One Mastragen instance serves many Mastra projects
2. **Configurable per-project**: Git repos, workspace structure, environments, cui settings
3. **Direct sandbox access**: Users connect via Tailscale, no proxy layer
4. **Git-native persistence**: Branches store code + session history; PRs for promotion
5. **Session sharing**: Teammates can join a sandbox URL for pair debugging
6. **Multi-service sandbox**: Each sandbox exposes cui, Mastra Studio, Astro, and VS Code

### Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mastragen Platform                                                          │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────┐    │
│  │  Projects       │    │  Sandboxes (per session)                     │    │
│  │                 │    │                                              │    │
│  │  - Git repo     │───▶│  - cui (:3001)      - Claude chat           │    │
│  │  - Environments │    │  - Mastra (:4111)   - Tool/agent testing    │    │
│  │  - cui config   │    │  - Astro (:4321)    - UI prototyping        │    │
│  │  - MCP servers  │    │  - VS Code (:8080)  - IDE escape hatch      │    │
│  │  - Skills       │    │                                              │    │
│  └─────────────────┘    └─────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Storage: SQLite (default) or PostgreSQL                            │   │
│  │  Projects, Sessions, cui configs, Skills, Commands                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Entity

A **Project** represents a Mastra codebase that Mastragen manages. Each project configures:

```typescript
interface Project {
  id: string;
  name: string;
  
  // Git configuration
  githubRepo: string;              // "org/repo"
  defaultBranch: string;           // "main"
  branchPrefix: string;            // "mg/" or "experiment/"
  
  // Workspace structure (paths within repo)
  mastraPath: string;              // "." or "packages/ai" or "src/mastra"
  uiSandboxPath: string | null;    // "ui-sandbox" or null (disable Astro)
  uiSandboxTemplate: string | null; // "github:org/template" (init if missing)
  
  // cui configuration version (for cache invalidation)
  cuiConfigVersion: string | null;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectEnvironment {
  id: string;
  projectId: string;
  name: string;                    // "staging", "dev", "prod"
  envVars: Record<string, string>; // Non-secret env vars
  secretRefs: string[];            // K8s secret names to mount
}

interface ProjectMember {
  projectId: string;
  userId: string;
  role: 'admin' | 'member';
}
```

### Project Examples

**Monorepo with nested Mastra:**
```typescript
{
  name: "acme-platform",
  githubRepo: "acme-corp/platform",
  mastraPath: "packages/ai",
  uiSandboxPath: "packages/ai-playground",
  branchPrefix: "ai/",
}
```

**Standalone Mastra project:**
```typescript
{
  name: "august-ai",
  githubRepo: "august-health/ai-completions",
  mastraPath: ".",
  uiSandboxPath: "ui-sandbox",
  branchPrefix: "mg/",
}
```

**Backend-only (no UI sandbox):**
```typescript
{
  name: "data-pipelines",
  githubRepo: "org/data-pipelines",
  mastraPath: "src/mastra",
  uiSandboxPath: null,  // Astro container disabled
  branchPrefix: "pipeline/",
}
```

---

## cui Configuration

Each project configures cui (Claude's interface) independently. Configuration is stored in Mastragen's database, **not** in the project repo, allowing updates without commits.

### Configuration Components

```typescript
interface ProjectCuiConfig {
  projectId: string;
  
  // MCP servers to connect
  mcpServers: Record<string, McpServerConfig>;
  
  // CLAUDE.md context
  claudeContext: string | null;
  
  // Auto-approve patterns
  autoApprovePatterns: {
    fileOps?: string[];      // ["read", "write"]
    mcpTools?: string[];     // ["mastra.*", "postgres.query"]
    bash?: string[];         // ["bun *", "npm *", "git status"]
  } | null;
  
  // cui settings
  settings: {
    model?: string;
    thinkingBudget?: 'low' | 'medium' | 'high';
  } | null;
  
  updatedAt: Date;
}

interface McpServerConfig {
  // Stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  
  // SSE/HTTP transport
  url?: string;
  auth?: {
    type: 'bearer' | 'jwt';
    envVar: string;  // Read token from this env var
  };
  
  // Options
  alwaysEnabled?: boolean;
}
```

### Project Commands

Custom slash commands available in cui:

```typescript
interface ProjectCommand {
  id: string;
  projectId: string;
  name: string;           // "deploy-preview" (becomes /deploy-preview)
  description: string;
  content: string;        // Markdown command definition
}
```

### Project Skills

Custom skills (knowledge/instructions) for Claude:

```typescript
interface ProjectSkill {
  id: string;
  projectId: string;
  name: string;           // "domain-knowledge"
  content: string;        // SKILL.md content
}
```

### Built-in Skills & Commands

Mastragen ships with built-in capabilities available to all projects:

**Built-in Commands:**

| Command | Description |
|---------|-------------|
| `/suspend` | Save work, commit, terminate sandbox |
| `/pr [title]` | Create PR from session branch |
| `/share @user` | Share session with teammate |
| `/extract` | Capture working code as artifact definition |
| `/env` | Show current environment info |

**Built-in Skills:**

| Skill | Purpose |
|-------|---------|
| `mastra-development` | How to write tools, agents, workflows |
| `artifact-extraction` | When/how to capture work as artifacts |
| `session-management` | Checkpointing, PRs, collaboration patterns |

---

## Multi-Service Architecture

Each sandbox pod runs four services accessible via Tailscale on separate ports:

| Port | Service | Always Running? | Purpose |
|------|---------|-----------------|---------|
| `:3001` | **cui** | ✅ Yes | Claude chat interface for natural language development |
| `:4111` | **Mastra** | ✅ Yes | Tool/agent/workflow runtime + Studio UI for testing |
| `:4321` | **Astro** | ⚙️ If configured | UI component prototyping sandbox |
| `:8080` | **VS Code** | ⚡ On-demand | Full IDE escape hatch |

The workspace structure is determined by the Project configuration:

```
/workspace/
├── .git/                        # Git root
├── {mastraPath}/                # e.g., "." or "packages/ai"
│   ├── src/mastra/
│   │   ├── tools/
│   │   ├── agents/
│   │   └── workflows/
│   └── package.json
│
└── {uiSandboxPath}/             # e.g., "ui-sandbox" (optional)
    ├── src/
    │   ├── components/
    │   └── pages/
    └── package.json
```

Both directories are tracked in the same git branch, so a single PR can include both Mastra artifacts and their corresponding UI components.

### Service URLs

When a session is active, users access services directly via port:

```
https://sandbox-abc123.tailnet.ts.net:3001   → cui (Claude chat)
https://sandbox-abc123.tailnet.ts.net:4111   → Mastra Studio
https://sandbox-abc123.tailnet.ts.net:4321   → Astro (UI sandbox)
https://sandbox-abc123.tailnet.ts.net:8080   → VS Code (on-demand)
```

### Why Port-Based (Not Path-Based)

Each service expects to run at root path. Path-based routing would require:
- Complex WebSocket path rewriting
- `--base-path` flags that are often buggy (especially code-server)
- Asset path munging for Vite/Astro

Port-based routing is simpler, more reliable, and how these tools are designed to work.

### When to Use Each Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Typical Full-Stack AI Feature Workflow                                      │
│                                                                              │
│  1. Start in cui (:3001)                                                    │
│     - Describe what you want to build                                       │
│     - Claude writes Mastra tool/agent                                       │
│     - Iterate via conversation                                              │
│                                                                              │
│  2. Test in Mastra Studio (:4111)                                           │
│     - See your tools/agents appear (HMR)                                    │
│     - Test with real inputs                                                 │
│     - Verify response shapes                                                │
│                                                                              │
│  3. Prototype UI in Astro (:4321)                                           │
│     - Build React components that consume your tools                        │
│     - Test streaming, loading states, error handling                        │
│     - See components render with real Mastra data                           │
│                                                                              │
│  4. Escape to VS Code (:8080) when needed                                   │
│     - Complex refactoring across multiple files                             │
│     - Debugging with breakpoints                                            │
│     - Git operations beyond simple commits                                  │
│                                                                              │
│  5. Return to cui for iteration                                             │
│     - Claude sees your changes from any service                             │
│     - Continue natural language development                                 │
│                                                                              │
│  6. Create PR                                                               │
│     - Includes both Mastra artifacts AND UI components                      │
│     - Reviewers see the complete feature                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI Sandbox (Astro) - Optional

If `project.uiSandboxPath` is configured, the Astro dev server runs and provides a UI prototyping environment. Projects can:

1. **Use an existing directory** in their repo
2. **Initialize from a template** via `project.uiSandboxTemplate`
3. **Disable entirely** by setting `uiSandboxPath: null`

#### Typical Structure

```
{uiSandboxPath}/
├── src/
│   ├── components/           # React/Vue/Svelte components
│   │   ├── chat/
│   │   ├── tools/
│   │   └── ui/
│   ├── lib/
│   │   └── mastra.ts         # Mastra client for localhost:4111
│   └── pages/
│       └── index.astro       # Component playground
├── astro.config.mjs
└── package.json
```

#### Mastra Client Helper

Included in templates, or projects can create their own:

```typescript
// {uiSandboxPath}/src/lib/mastra.ts

const MASTRA_URL = import.meta.env.MASTRA_URL || 'http://localhost:4111';

export async function listTools() {
  const res = await fetch(`${MASTRA_URL}/api/tools`);
  return res.json();
}

export async function executeTool(toolId: string, input: Record<string, unknown>) {
  const res = await fetch(`${MASTRA_URL}/api/tools/${toolId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return res.json();
}

export async function chatWithAgent(agentId: string, message: string) {
  const res = await fetch(`${MASTRA_URL}/api/agents/${agentId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

// Streaming helper for SSE responses
export async function* streamAgentResponse(agentId: string, message: string) {
  const res = await fetch(`${MASTRA_URL}/api/agents/${agentId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
}
```

This gives Claude and developers a starting point. Components prototyped here eventually migrate to their destination frontend repos.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  User's Browser                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ▼                                           ▼
┌──────────────────────────────┐          ┌─────────────────────────────────┐
│  Landing Page                │          │  Sandbox (via Tailscale)        │
│  https://mastragen.       │          │  sandbox-abc123.tailnet.ts.net  │
│  august.health               │          │                                 │
│                              │          │  :3001 → cui (Claude chat)      │
│  - List my sessions          │  ───────▶│  :4111 → Mastra Studio          │
│  - Create new session        │  redirect│  :4321 → Astro (UI sandbox)     │
│  - Resume suspended session  │          │  :8080 → VS Code (on-demand)    │
│  - View PRs                  │          │                                 │
│  - Share session URL         │          │  All share /workspace volume    │
└──────────────────────────────┘          └─────────────────────────────────┘
              │                                           │
              │ API calls                                 │ on suspend/PR
              ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mastragen Orchestrator                                                      │
│                                                                              │
│  Endpoints:                                                                  │
│  - GET  /projects              List projects user can access                │
│  - POST /projects              Create project (admin)                       │
│  - GET  /projects/:id          Get project config                           │
│  - PUT  /projects/:id          Update project (admin)                       │
│                                                                              │
│  - POST /sessions              Create new sandbox (requires projectId)      │
│  - GET  /sessions              List user's sessions                         │
│  - POST /sessions/:id/resume   Resume suspended session                     │
│  - POST /sessions/:id/suspend  Commit, push, terminate pod                  │
│  - POST /sessions/:id/pr       Create PR from session branch                │
│  - POST /sessions/:id/share    Share session with teammate                  │
│                                                                              │
│  Responsibilities:                                                           │
│  - Project configuration management                                         │
│  - Kubernetes pod lifecycle (create, delete)                                │
│  - Tailscale device registration                                            │
│  - Git operations (branch, commit, push, PR)                                │
│  - cui config injection (MCP servers, skills, commands)                     │
│  - Session state tracking                                                   │
│                                                                              │
│  Storage: SQLite (default) or PostgreSQL                                    │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              │ K8s API + GitHub API
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Kubernetes: mastragen-sandboxes namespace                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Sandbox Pod: sandbox-{sessionId}                                    │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Shared Volume: /workspace                                     │ │   │
│  │  │  ├── {project.mastraPath}/      (tools, agents, workflows)     │ │   │
│  │  │  └── {project.uiSandboxPath}/   (optional, if configured)      │ │   │
│  │  │  Both tracked in same git branch                               │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │  cui config injected from Mastragen:                           │ │   │
│  │  │  - ~/.claude/settings.json                                     │ │   │
│  │  │  - ~/.claude/mcpServers.json                                   │ │   │
│  │  │  - ~/.claude/commands/*.md                                     │ │   │
│  │  │  - /mnt/skills/project/                                        │ │   │
│  │  │  - CLAUDE.md context                                           │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ cui         │ │ Mastra      │ │ Astro       │ │ code-server │   │   │
│  │  │ :3001       │ │ :4111       │ │ :4321       │ │ :8080       │   │   │
│  │  │             │ │             │ │ (optional)  │ │             │   │   │
│  │  │ Claude chat │ │ Studio +    │ │ UI sandbox  │ │ VS Code     │   │   │
│  │  │ + MCP       │ │ runtime     │ │ HMR         │ │ ON-DEMAND   │   │   │
│  │  │             │ │ HMR         │ │             │ │             │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Tailscale Sidecar                                             │ │   │
│  │  │  - Hostname: {sessionId}-mastragen-{env}.{tailnet}.ts.net      │ │   │
│  │  │  - Exposes ports: 4111, 4321, 8080                             │ │   │
│  │  │  - ACL-based access control                                    │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Caddy Sidecar                                                 │ │   │
│  │  │  - HTTPS termination via Caddy + Tailscale certs               │ │   │
│  │  │  - Reverse proxy to internal services                          │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Git Repository: {project.githubRepo}                                        │
│                                                                              │
│  {project.defaultBranch} ────────────────────────────────────────────────►  │
│    │                                                                         │
│    ├── {project.mastraPath}/            (Mastra tools, agents, workflows)   │
│    ├── {project.uiSandboxPath}/         (optional UI sandbox)               │
│    │                                                                         │
│    └── {project.branchPrefix}{user}/{name}-{id}   (Mastragen branch)        │
│          ├── {project.mastraPath}/                                          │
│          │     └── src/mastra/tools/new-tool.ts     ◄── new tool            │
│          ├── {project.uiSandboxPath}/               (if configured)         │
│          │     └── src/components/NewComponent.tsx  ◄── new component       │
│          └── .cui/                                   ◄── session history    │
│                                                                              │
│  On PR merge: squash commit includes all changes                            │
│               .cui/ excluded via export-ignore                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Landing Page

A simple web app for session management, organized by project.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mastragen                                              [nathan@acme] ▼     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  + New Session                                                       │   │
│  │                                                                      │   │
│  │  Project:      [ai-completions          ▼]                          │   │
│  │  Session name: [billing-feature           ]                         │   │
│  │  Environment:  [staging ▼]                                          │   │
│  │                                                                      │   │
│  │  [Create Session]                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  ai-completions                                   august-health/ai-...      │
│  ───────────────────────────────────────────────────────────────────────   │
│  ● billing-feature           Active     2 min ago      [staging]           │
│    Branch: mg/nathan/billing-feature-abc123                                │
│    Open: [cui :3001] [Mastra :4111] [Astro :4321] [VS Code :8080]          │
│    Actions: [Suspend] [Create PR] [Share]                                  │
│                                                                             │
│  ○ customer-health           Suspended  2 hours ago                        │
│    Branch: mg/nathan/customer-health-def456                                │
│    5 commits · Last: "feat(tools): add churn scoring"                      │
│    [Resume] [Create PR] [Archive]                                          │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  data-pipelines                                   acme-corp/data-...        │
│  ───────────────────────────────────────────────────────────────────────   │
│  ● invoice-processor         Active     5 min ago      [dev]               │
│    Branch: pipeline/nathan/invoice-processor-xyz789                        │
│    Open: [cui :3001] [Mastra :4111] [VS Code :8080]  (no Astro)            │
│    Actions: [Suspend] [Create PR] [Share]                                  │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  Shared With Me                                                             │
│  ───────────────────────────────────────────────────────────────────────   │
│  ● sarah's churn-predictor   Active     Shared by Sarah   [ai-completions] │
│    Open: [cui :3001] [Mastra :4111] [Astro :4321] [VS Code :8080]          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚙️ Manage Projects                          (admin only)            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Project Admin Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Project: ai-completions                                        [← Back]    │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│  Overview    │  Environments│  cui Config  │  Skills      │  Access        │
├──────────────┴──────────────┴──────────────┴──────────────┴────────────────┤
│                                                                             │
│  Git Repository                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Repo:           [august-health/ai-completions    ]                 │   │
│  │  Default branch: [main                            ]                 │   │
│  │  Branch prefix:  [mg/                             ]                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Workspace Structure                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Mastra path:     [.                              ]                 │   │
│  │  UI Sandbox path: [ui-sandbox                     ] (blank=disable) │   │
│  │  UI Template:     [github:org/astro-mastra-template]                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Save Changes]                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### cui Config Tab

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Project: ai-completions > cui Config                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MCP Servers                                                    [+ Add]    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ● mastra        http://localhost:4111/mcp        [Always on] [🔒]  │   │
│  │  ● postgres      @mcp/server-postgres             [Edit] [Delete]   │   │
│  │  ● internal-api  https://api.staging.company.com  [Edit] [Delete]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Custom Commands                                                [+ Add]    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  /deploy-preview   Deploy to preview environment     [Edit] [Delete]│   │
│  │  /seed-data        Seed test data for current tool   [Edit] [Delete]│   │
│  │  ─── Built-in (read-only) ───                                       │   │
│  │  /suspend          Save and suspend session                         │   │
│  │  /pr               Create PR from branch                            │   │
│  │  /share            Share session with teammate                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Context (CLAUDE.md)                                            [Edit]     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  # Project: ai-completions                                          │   │
│  │                                                                      │   │
│  │  ## Architecture                                                     │   │
│  │  - Tools in src/mastra/tools/ - stateless transformations           │   │
│  │  - Agents in src/mastra/agents/ - conversational interfaces         │   │
│  │  ...                                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Auto-Approve Patterns                                          [Edit]     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  File operations: read, write (within /workspace)                   │   │
│  │  MCP tools:       mastra.*, postgres.query                          │   │
│  │  Bash commands:   bun *, npm *, git status, git diff                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Service Links

When a session is active, the landing page shows direct links to each service:

| Button | URL | Purpose |
|--------|-----|---------|
| **Mastra :4111** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:4111` | Testing tools/agents/workflows |
| **Astro :4321** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:4321` | UI component prototyping |
| **VS Code :8080** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:8080` | Full IDE (starts on first access) |

#### Implementation

```tsx
// landing-page/src/app/page.tsx
import { getSessions, createSession } from '@/lib/api';
import { SessionList } from '@/components/SessionList';
import { NewSessionForm } from '@/components/NewSessionForm';

export default async function Home() {
  const sessions = await getSessions();
  
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Mastragen</h1>
      
      <NewSessionForm 
        onSubmit={async (name, env) => {
          'use server';
          const session = await createSession(name, env);
          redirect(session.cuiUrl);
        }}
      />
      
      <SessionList sessions={sessions} />
    </main>
  );
}
```

---

### 2. Sandbox Orchestrator

Lightweight service that manages sandbox lifecycle and git operations.

#### API Specification

```yaml
openapi: 3.0.0
info:
  title: Mastragen Orchestrator
  version: 2.0.0

paths:
  # ============ PROJECTS ============
  /projects:
    get:
      summary: List projects user has access to
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Project'
    
    post:
      summary: Create new project (admin only)
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProjectCreate'
      responses:
        201:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'

  /projects/{id}:
    get:
      summary: Get project details
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectWithConfig'
    
    put:
      summary: Update project (admin only)
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProjectUpdate'
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'

  /projects/{id}/environments:
    get:
      summary: List project environments
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/ProjectEnvironment'
    
    post:
      summary: Add environment to project
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProjectEnvironmentCreate'
      responses:
        201:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectEnvironment'

  /projects/{id}/cui-config:
    get:
      summary: Get project cui configuration
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CuiConfig'
    
    put:
      summary: Update cui configuration
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CuiConfigUpdate'
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CuiConfig'

  /projects/{id}/commands:
    get:
      summary: List project custom commands
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Command'
    
    post:
      summary: Add custom command
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CommandCreate'
      responses:
        201:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Command'

  /projects/{id}/skills:
    get:
      summary: List project skills
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Skill'
    
    post:
      summary: Add skill
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SkillCreate'
      responses:
        201:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Skill'

  # ============ SESSIONS ============
  /sessions:
    get:
      summary: List user's sessions (optionally filtered by project)
      parameters:
        - name: projectId
          in: query
          schema:
            type: string
        - name: state
          in: query
          schema:
            type: string
            enum: [active, suspended, pr_open, archived]
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Session'
    
    post:
      summary: Create new session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - projectId
                - artifactName
                - environment
              properties:
                projectId:
                  type: string
                  description: Project to create session in
                artifactName:
                  type: string
                environment:
                  type: string
                  description: Environment name (must exist in project)
      responses:
        201:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SessionWithUrl'

  /sessions/{id}/resume:
    post:
      summary: Resume suspended session
      parameters:
        - name: commitSha
          in: query
          description: Optional specific commit to resume from
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SessionWithUrl'

  /sessions/{id}/suspend:
    post:
      summary: Suspend active session
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'

  /sessions/{id}/pr:
    post:
      summary: Create PR from session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                description:
                  type: string
      responses:
        201:
          content:
            application/json:
              schema:
                type: object
                properties:
                  session:
                    $ref: '#/components/schemas/Session'
                  pr:
                    $ref: '#/components/schemas/PullRequest'

  /sessions/{id}/share:
    post:
      summary: Generate shareable URL for session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                userIds:
                  type: array
                  items:
                    type: string
                  description: User IDs to grant access
      responses:
        200:
          content:
            application/json:
              schema:
                type: object
                properties:
                  shareUrl:
                    type: string
                  sharedWith:
                    type: array
                    items:
                      type: string

components:
  schemas:
    # ============ PROJECTS ============
    Project:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        githubRepo:
          type: string
          description: "org/repo format"
        defaultBranch:
          type: string
        branchPrefix:
          type: string
        mastraPath:
          type: string
        uiSandboxPath:
          type: string
          nullable: true
        uiSandboxTemplate:
          type: string
          nullable: true
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    ProjectCreate:
      type: object
      required:
        - name
        - githubRepo
      properties:
        name:
          type: string
        githubRepo:
          type: string
        defaultBranch:
          type: string
          default: main
        branchPrefix:
          type: string
          default: "mg/"
        mastraPath:
          type: string
          default: "."
        uiSandboxPath:
          type: string
          nullable: true
        uiSandboxTemplate:
          type: string
          nullable: true

    ProjectWithConfig:
      allOf:
        - $ref: '#/components/schemas/Project'
        - type: object
          properties:
            environments:
              type: array
              items:
                $ref: '#/components/schemas/ProjectEnvironment'
            cuiConfig:
              $ref: '#/components/schemas/CuiConfig'

    ProjectEnvironment:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        envVars:
          type: object
          additionalProperties:
            type: string
        secretRefs:
          type: array
          items:
            type: string

    CuiConfig:
      type: object
      properties:
        mcpServers:
          type: object
          additionalProperties:
            $ref: '#/components/schemas/McpServerConfig'
        claudeContext:
          type: string
          nullable: true
          description: CLAUDE.md content
        autoApprovePatterns:
          type: object
          properties:
            fileOps:
              type: array
              items:
                type: string
            mcpTools:
              type: array
              items:
                type: string
            bash:
              type: array
              items:
                type: string

    McpServerConfig:
      type: object
      properties:
        command:
          type: string
        args:
          type: array
          items:
            type: string
        env:
          type: object
          additionalProperties:
            type: string
        url:
          type: string
        alwaysEnabled:
          type: boolean

    Command:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        description:
          type: string
        content:
          type: string

    Skill:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        content:
          type: string
          description: SKILL.md content

    # ============ SESSIONS ============
    Session:
      type: object
      properties:
        id:
          type: string
        projectId:
          type: string
        userId:
          type: string
        artifactName:
          type: string
        branchName:
          type: string
        state:
          type: string
          enum: [active, suspended, pr_open, merged, archived]
        environment:
          type: string
        lastCommitSha:
          type: string
        commitCount:
          type: integer
        prNumber:
          type: integer
        prUrl:
          type: string
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    
    SessionWithUrl:
      allOf:
        - $ref: '#/components/schemas/Session'
        - type: object
          properties:
            urls:
              type: object
              properties:
                cui:
                  type: string
                  description: Tailscale URL to access cui (:3001)
                mastra:
                  type: string
                  description: Tailscale URL to access Mastra Studio (:4111)
                astro:
                  type: string
                  description: Tailscale URL to access Astro UI sandbox (:4321)
                  nullable: true
                vscode:
                  type: string
                  description: Tailscale URL to access VS Code (:8080)
```

#### Implementation

```typescript
// orchestrator/src/index.ts
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { nanoid } from 'nanoid';
import { K8sClient } from './k8s';
import { GitHubClient } from './github';
import { TailscaleClient } from './tailscale';
import { SessionStore } from './store';

const app = new Hono();

app.use('/*', jwt({ secret: process.env.JWT_SECRET! }));

// Create new session
app.post('/sessions', async (c) => {
  const user = c.get('jwtPayload');
  const { projectId, artifactName, environment } = await c.req.json();
  
  // 1. Get project configuration
  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }
  
  // 2. Verify user has access to project
  const membership = await projects.getMembership(projectId, user.id);
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403);
  }
  
  // 3. Verify environment exists
  const env = await projects.getEnvironment(projectId, environment);
  if (!env) {
    return c.json({ error: 'Environment not found' }, 404);
  }
  
  const sessionId = nanoid(6);
  const branchName = `${project.branch_prefix}${user.id}/${artifactName}-${sessionId}`;
  
  // 4. Create git branch
  await github.createBranch({
    repo: project.github_repo,
    branch: branchName,
    fromBranch: project.default_branch,
  });
  
  // 5. Create session record
  const session = await sessions.create({
    projectId,
    userId: user.id,
    artifactName,
    branchName,
    environment,
  });
  
  // 6. Create sandbox pod with project config
  const pod = await k8s.createSandboxPod({
    sessionId,
    projectId,
    branchName,
    environment,
    project: {
      githubRepo: project.github_repo,
      mastraPath: project.mastra_path,
      uiSandboxPath: project.ui_sandbox_path,
      uiSandboxTemplate: project.ui_sandbox_template,
    },
    environmentSecret: env.secret_refs?.[0],  // K8s secret name
  });
  
  // 7. Wait for Tailscale to register
  const env = process.env.MASTRAGEN_ENV || 'local';
  const tailscaleHostname = `${sessionId}-mastragen-${env}.${process.env.TAILNET_DOMAIN}`;
  await tailscale.waitForDevice(`${sessionId}-mastragen-${env}`, { timeout: 60000 });

  // 8. Update session with pod info
  await sessions.update(sessionId, {
    pod_name: pod.name,
    tailscale_hostname: tailscaleHostname,
  });

  // 9. Return session with service URLs
  const hasAstro = !!project.ui_sandbox_path;
  return c.json({
    ...await sessions.findById(sessionId),
    urls: {
      mastra: `https://${tailscaleHostname}:4111`,
      astro: hasAstro ? `https://${tailscaleHostname}:4321` : null,
      vscode: `https://${tailscaleHostname}:8080`,
    },
  }, 201);
});

// Suspend session
app.post('/sessions/:id/suspend', async (c) => {
  const session = await sessions.findById(c.req.param('id'));
  
  if (session.state !== 'active') {
    return c.json({ error: 'Session not active' }, 400);
  }
  
  // 1. Trigger commit in pod (includes .cui/ session history)
  const commitResult = await k8s.execInPod(session.podName!, [
    '/scripts/suspend.sh'
  ]);
  
  // 2. Delete pod (Tailscale device auto-removed)
  await k8s.deletePod(session.podName!);
  
  // 3. Update session
  await store.update(session.id, {
    state: 'suspended',
    podName: null,
    tailscaleHostname: null,
    lastCommitSha: commitResult.sha,
    commitCount: commitResult.count,
  });
  
  return c.json(await store.get(session.id));
});

// Resume session
app.post('/sessions/:id/resume', async (c) => {
  const session = await store.get(c.req.param('id'));
  const { commitSha } = await c.req.json().catch(() => ({}));
  
  if (!['suspended', 'pr_open'].includes(session.state)) {
    return c.json({ error: 'Session not resumable' }, 400);
  }
  
  // 1. Create new pod
  // Get project for sandbox configuration
  const project = await projects.findById(session.project_id);
  
  const pod = await k8s.createSandboxPod({
    sessionId: session.id,
    projectId: session.project_id,
    branchName: session.branch_name,
    environment: session.environment,
    checkoutCommit: commitSha || session.last_commit_sha,
    project: {
      githubRepo: project.github_repo,
      mastraPath: project.mastra_path,
      uiSandboxPath: project.ui_sandbox_path,
      uiSandboxTemplate: project.ui_sandbox_template,
    },
  });
  
  // 2. Wait for Tailscale
  const env = process.env.MASTRAGEN_ENV || 'local';
  const tailscaleHostname = `${session.id}-mastragen-${env}.${process.env.TAILNET_DOMAIN}`;
  await tailscale.waitForDevice(`${session.id}-mastragen-${env}`, { timeout: 60000 });

  // 3. Update session
  await sessions.update(session.id, {
    state: 'active',
    pod_name: pod.name,
    tailscale_hostname: tailscaleHostname,
  });

  // 4. Return session with service URLs
  const hasAstro = !!project.ui_sandbox_path;
  return c.json({
    ...await sessions.findById(session.id),
    urls: {
      mastra: `https://${tailscaleHostname}:4111`,
      astro: hasAstro ? `https://${tailscaleHostname}:4321` : null,
      vscode: `https://${tailscaleHostname}:8080`,
    },
  });
});

// Create PR
app.post('/sessions/:id/pr', async (c) => {
  const session = await sessions.findById(c.req.param('id'));
  const project = await projects.findById(session.project_id);
  const { title, description } = await c.req.json();
  
  // Suspend first if active
  if (session.state === 'active') {
    // Trigger suspend flow
    await fetch(`${c.req.url.replace('/pr', '/suspend')}`, {
      method: 'POST',
      headers: c.req.raw.headers,
    });
  }
  
  // Create PR with squash merge settings
  const pr = await github.createPullRequest({
    repo: project.github_repo,
    head: session.branch_name,
    base: project.default_branch,
    title: title || `[Mastragen] ${session.artifact_name}`,
    body: await generatePRBody(session, description),
    // Note: .gitattributes or PR template should specify:
    // - Squash merge only
    // - Exclude .cui/ from squash commit
  });
  
  await sessions.update(session.id, {
    state: 'pr_open',
    pr_number: pr.number,
    pr_url: pr.html_url,
  });
  
  return c.json({
    session: await sessions.findById(session.id),
    pr,
  }, 201);
});

// Share session
app.post('/sessions/:id/share', async (c) => {
  const session = await sessions.findById(c.req.param('id'));
  const project = await projects.findById(session.project_id);
  const { userIds } = await c.req.json();
  
  if (session.state !== 'active') {
    return c.json({ error: 'Can only share active sessions' }, 400);
  }
  
  // Update Tailscale ACLs to allow these users
  const env = process.env.MASTRAGEN_ENV || 'local';
  await tailscale.grantAccess({
    device: `${session.id}-mastragen-${env}`,
    users: userIds,
  });

  // Record sharing in session
  await store.addSharedUsers(session.id, userIds);

  const hostname = session.tailscaleHostname;
  return c.json({
    urls: {
      mastra: `https://${hostname}:4111`,
      astro: `https://${hostname}:4321`,
      vscode: `https://${hostname}:8080`,
    },
    sharedWith: userIds,
  });
});

export default app;
```

---

### 3. Sandbox Container

Contains `cui`, Mastra, and all tools needed for artifact development.

#### Dockerfile

```dockerfile
# sandbox/Dockerfile
FROM node:20-slim AS base

# System dependencies
RUN apt-get update && apt-get install -y \
    curl git ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install cui-server globally
RUN npm install -g cui-server

# Create workspace
WORKDIR /workspace

# Copy scripts
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# Copy cui extensions (our customizations)
COPY cui-extensions/ /opt/cui-extensions/

# Ports
# 3001: cui web interface
# 4111: Mastra dev server
EXPOSE 3001 4111

ENTRYPOINT ["/scripts/entrypoint.sh"]
```

#### Entrypoint Script (cui container)

The init containers handle git clone and cui config injection. The cui container applies config and starts:

```bash
#!/bin/bash
# sandbox/scripts/entrypoint.sh
set -e

echo "=== Mastragen cui Starting ==="
echo "Session ID: $SESSION_ID"
echo "Project: $PROJECT_ID"
echo "Environment: $ENVIRONMENT"
echo "Mastra Path: $MASTRA_PATH"

# 1. Restore cui session if saved from previous run
if [ -d "/workspace/.cui-restore" ]; then
  echo "Restoring cui session history..."
  mkdir -p ~/.claude
  cp -r /workspace/.cui-restore/* ~/.claude/
fi

# 2. Apply injected cui configuration
mkdir -p ~/.claude

# MCP servers and settings from orchestrator
if [ -f "/cui-config/config.json" ]; then
  cp /cui-config/config.json ~/.claude/settings.json
fi

# Custom commands (project + built-in)
if [ -d "/cui-config/commands" ]; then
  mkdir -p ~/.claude/commands
  cp -r /cui-config/commands/* ~/.claude/commands/
fi

# CLAUDE.md context
if [ -f "/cui-config/CLAUDE.md" ]; then
  # Place in workspace root for cui to discover
  cp /cui-config/CLAUDE.md /workspace/CLAUDE.md
fi

# Project skills
if [ -d "/cui-config/skills" ]; then
  mkdir -p /mnt/skills/project
  cp -r /cui-config/skills/* /mnt/skills/project/
fi

# 3. Add session-specific config overlay
cat > ~/.claude/session.json << EOF
{
  "session": {
    "id": "$SESSION_ID",
    "projectId": "$PROJECT_ID",
    "environment": "$ENVIRONMENT",
    "branchName": "$BRANCH_NAME"
  },
  "workspace": {
    "root": "/workspace",
    "mastraPath": "$MASTRA_PATH"
  },
  "services": {
    "mastra": "http://localhost:4111",
    "astro": "http://localhost:4321",
    "orchestrator": "$ORCHESTRATOR_URL"
  }
}
EOF

# 4. Start cui-server
echo "Starting cui on :3001..."
cd /workspace
exec cui-server --port 3001 --host 0.0.0.0
```

#### Suspend Script

```bash
#!/bin/bash
# sandbox/scripts/suspend.sh
set -e

cd /workspace

# MASTRA_PATH from environment (e.g., "." or "packages/ai")
MASTRA_PATH="${MASTRA_PATH:-.}"

# 1. Copy cui session data to repo (inside mastra path)
echo "Saving cui session history to ${MASTRA_PATH}/.cui/..."
mkdir -p "${MASTRA_PATH}/.cui"
cp -r ~/.claude/* "${MASTRA_PATH}/.cui/" 2>/dev/null || true

# 2. Stage all changes
git add -A

# 3. Commit if there are changes
if git diff --staged --quiet; then
  echo "No changes to commit"
else
  git commit -m "chore: auto-save on suspend

Session: $SESSION_ID
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

# 4. Push to remote
git push origin "$BRANCH_NAME"

# 5. Output commit info for orchestrator
echo "SHA=$(git rev-parse HEAD)"
echo "COUNT=$(git rev-list --count HEAD ^origin/main)"
```

#### Kubernetes Pod Specification

```yaml
# k8s/sandbox-pod-template.yaml
apiVersion: v1
kind: Pod
metadata:
  name: sandbox-${SESSION_ID}
  namespace: mastragen-sandboxes
  labels:
    app: mastragen-sandbox
    sessionId: ${SESSION_ID}
    userId: ${USER_ID}
spec:
  serviceAccountName: sandbox-runner
  
  # Auto-terminate after 4 hours
  activeDeadlineSeconds: 14400
  
  # Allow spot instances
  tolerations:
    - key: kubernetes.io/spot
      operator: Exists
      effect: NoSchedule
  
  # Shared volume for all containers
  volumes:
    - name: workspace
      emptyDir: {}
    - name: tailscale-state
      emptyDir: {}
    - name: tailscale-config
      configMap:
        name: sandbox-tailscale-config-${SESSION_ID}
    - name: code-server-data
      emptyDir: {}
  
  # Init containers
  initContainers:
    # 1. Clone repository (dynamic based on project config)
    - name: git-clone
      image: alpine/git:latest
      command:
        - /bin/sh
        - -c
        - |
          # Clone the repository (project.githubRepo)
          git clone --branch "$BRANCH_NAME" \
            "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git" \
            /workspace
          
          cd /workspace
          
          if [ -n "$CHECKOUT_COMMIT" ]; then
            git checkout "$CHECKOUT_COMMIT"
          fi
          
          # Configure git for commits
          git config user.email "mastragen@$GITHUB_REPO"
          git config user.name "Mastragen ($SESSION_ID)"
          
          # Restore cui session if exists (located at mastraPath/.cui/)
          if [ -d "${MASTRA_PATH}/.cui" ]; then
            mkdir -p /workspace/.cui-restore
            cp -r "${MASTRA_PATH}/.cui/"* /workspace/.cui-restore/
          fi
      env:
        - name: GITHUB_REPO
          value: ${PROJECT_GITHUB_REPO}  # e.g., "august-health/ai-completions"
        - name: BRANCH_NAME
          value: ${BRANCH_NAME}
        - name: CHECKOUT_COMMIT
          value: ${CHECKOUT_COMMIT}
        - name: SESSION_ID
          value: ${SESSION_ID}
        - name: MASTRA_PATH
          value: ${PROJECT_MASTRA_PATH}  # e.g., "." or "packages/ai"
      envFrom:
        - secretRef:
            name: github-app-credentials
      volumeMounts:
        - name: workspace
          mountPath: /workspace

    # 2. Inject cui configuration (fetched from orchestrator API)
    - name: cui-config
      image: curlimages/curl:latest
      command:
        - /bin/sh
        - -c
        - |
          # Fetch cui config from orchestrator
          ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://mastragen-orchestrator:3000}"
          
          # Get MCP servers config
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/projects/${PROJECT_ID}/cui-config" \
            -o /cui-config/config.json
          
          # Get custom commands
          mkdir -p /cui-config/commands
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/projects/${PROJECT_ID}/commands" \
            -o /cui-config/commands.json
          
          # Unpack commands into individual files
          if [ -f /cui-config/commands.json ]; then
            # jq splits commands into individual .md files
            cat /cui-config/commands.json | jq -r '.[] | "/cui-config/commands/\(.name).md"' | \
              while read path; do
                name=$(basename "$path" .md)
                cat /cui-config/commands.json | jq -r ".[] | select(.name==\"$name\") | .content" > "$path"
              done
          fi
          
          # Get skills
          mkdir -p /cui-config/skills
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/projects/${PROJECT_ID}/skills" \
            -o /cui-config/skills.json
          
          # Unpack skills into directories
          if [ -f /cui-config/skills.json ]; then
            cat /cui-config/skills.json | jq -r '.[] | .name' | \
              while read name; do
                mkdir -p "/cui-config/skills/$name"
                cat /cui-config/skills.json | jq -r ".[] | select(.name==\"$name\") | .content" \
                  > "/cui-config/skills/$name/SKILL.md"
              done
          fi
          
          # Get CLAUDE.md context
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/projects/${PROJECT_ID}/claude-context" \
            -o /cui-config/CLAUDE.md
          
          # Fetch built-in commands and skills
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/builtin/commands" \
            -o /cui-config/builtin-commands.tar.gz
          tar -xzf /cui-config/builtin-commands.tar.gz -C /cui-config/commands/
          
          curl -s -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
            "${ORCHESTRATOR_URL}/internal/builtin/skills" \
            -o /cui-config/builtin-skills.tar.gz
          tar -xzf /cui-config/builtin-skills.tar.gz -C /cui-config/skills/
      env:
        - name: PROJECT_ID
          value: ${PROJECT_ID}
        - name: ORCHESTRATOR_URL
          value: ${ORCHESTRATOR_URL}
        - name: INTERNAL_TOKEN
          valueFrom:
            secretKeyRef:
              name: mastragen-internal
              key: token
      volumeMounts:
        - name: cui-config
          mountPath: /cui-config
  
  containers:
    # cui + Claude Agent SDK
    - name: cui
      image: mastragen/cui:latest
      ports:
        - containerPort: 3001
          name: cui
      env:
        - name: SESSION_ID
          value: ${SESSION_ID}
        - name: BRANCH_NAME
          value: ${BRANCH_NAME}
        - name: PROJECT_ID
          value: ${PROJECT_ID}
        - name: ENVIRONMENT
          value: ${ENVIRONMENT}
        - name: MASTRA_PATH
          value: ${PROJECT_MASTRA_PATH}
        - name: CLAUDE_CODE_USE_BEDROCK
          value: "1"
        - name: AWS_REGION
          value: us-east-1
        - name: MASTRA_URL
          value: http://localhost:4111
        - name: ORCHESTRATOR_URL
          value: ${ORCHESTRATOR_URL}
      envFrom:
        - secretRef:
            name: aws-bedrock-credentials
        - secretRef:
            name: github-app-credentials
        - secretRef:
            name: ${ENVIRONMENT_SECRET}  # Project-specific env secrets
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: 1
          memory: 2Gi
      volumeMounts:
        - name: workspace
          mountPath: /workspace
      workingDir: /workspace/mastra-project
      readinessProbe:
        httpGet:
          path: /
          port: 3001
        initialDelaySeconds: 30
        periodSeconds: 10
    
    # Mastra dev server with HMR
    - name: mastra
      image: oven/bun:1-slim
      ports:
        - containerPort: 4111
          name: mastra
      env:
        - name: MASTRA_PATH
          value: ${PROJECT_MASTRA_PATH}  # e.g., "." or "packages/ai"
        - name: ENVIRONMENT
          value: ${ENVIRONMENT}
      envFrom:
        - secretRef:
            name: ${ENVIRONMENT_SECRET}  # Project-specific env secrets
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          cpu: 1
          memory: 2Gi
      volumeMounts:
        - name: workspace
          mountPath: /workspace
      workingDir: /workspace/${PROJECT_MASTRA_PATH}
      command:
        - /bin/sh
        - -c
        - |
          cd /workspace/${MASTRA_PATH}
          bun install
          exec bun run mastra dev --port 4111 --host 0.0.0.0
      readinessProbe:
        httpGet:
          path: /
          port: 4111
        initialDelaySeconds: 60
        periodSeconds: 10
    
    # VS Code server - ON-DEMAND escape hatch for complex editing
    # Uses a lazy-start wrapper that only spawns code-server on first HTTP request
    # This saves ~256Mi RAM per sandbox when VS Code isn't being used
    - name: code-server
      image: mastragen/code-server:latest
      ports:
        - containerPort: 8080
          name: vscode
      env:
        - name: CODE_SERVER_ARGS
          value: "--auth none --disable-telemetry /workspace"
        - name: LAZY_START
          value: "true"  # Only start code-server on first request
      resources:
        # Minimal resources when idle (just the wrapper)
        requests:
          cpu: 10m
          memory: 32Mi
        # Allow scaling up when VS Code is active
        limits:
          cpu: 2
          memory: 4Gi
      volumeMounts:
        - name: workspace
          mountPath: /workspace
        - name: code-server-data
          mountPath: /home/coder/.local/share/code-server
      # Readiness only checks the wrapper, not code-server itself
      readinessProbe:
        httpGet:
          path: /health
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 60  # Check less frequently since it's optional
    
    # Astro dev server - UI component prototyping sandbox
    # CONDITIONAL: Only starts if project.uiSandboxPath is configured
    - name: astro
      image: node:20-slim
      ports:
        - containerPort: 4321
          name: astro
      env:
        - name: UI_SANDBOX_PATH
          value: ${PROJECT_UI_SANDBOX_PATH}  # e.g., "ui-sandbox" or empty
        - name: MASTRA_URL
          value: http://localhost:4111
        - name: ENVIRONMENT
          value: ${ENVIRONMENT}
      envFrom:
        - secretRef:
            name: ${ENVIRONMENT_SECRET}
      resources:
        requests:
          cpu: 100m
          memory: 256Mi
        limits:
          cpu: 1
          memory: 1Gi
      volumeMounts:
        - name: workspace
          mountPath: /workspace
      command:
        - /bin/sh
        - -c
        - |
          # Only start if UI sandbox path is configured
          if [ -z "$UI_SANDBOX_PATH" ]; then
            echo "UI sandbox not configured for this project. Sleeping..."
            exec sleep infinity
          fi
          
          cd /workspace/${UI_SANDBOX_PATH}
          
          # Initialize from template if directory is empty/missing
          if [ ! -f "package.json" ]; then
            if [ -n "$UI_SANDBOX_TEMPLATE" ]; then
              echo "Initializing from template: $UI_SANDBOX_TEMPLATE"
              npx degit "$UI_SANDBOX_TEMPLATE" .
            else
              echo "No package.json and no template configured. Sleeping..."
              exec sleep infinity
            fi
          fi
          
          npm install
          exec npm run dev -- --host 0.0.0.0 --port 4321
      readinessProbe:
        httpGet:
          path: /
          port: 4321
        initialDelaySeconds: 30
        periodSeconds: 10
    
    # Tailscale sidecar - exposes all ports to tailnet
    - name: tailscale
      image: tailscale/tailscale:latest
      env:
        - name: TS_AUTHKEY
          valueFrom:
            secretKeyRef:
              name: tailscale-auth
              key: authkey
        - name: TS_HOSTNAME
          value: ${SESSION_ID}-mastragen-${ENV}
        - name: TS_STATE_DIR
          value: /var/lib/tailscale
        - name: TS_USERSPACE
          value: "true"
        - name: TS_PERMIT_CERT_UID
          value: caddy  # Allow Caddy to fetch TLS certs
      securityContext:
        runAsUser: 1000
        runAsGroup: 1000
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
        limits:
          cpu: 200m
          memory: 256Mi
      volumeMounts:
        - name: tailscale-state
          mountPath: /var/lib/tailscale
        - name: tailscale-config
          mountPath: /config
```

#### Caddy ConfigMap (HTTPS Termination)

Caddy provides HTTPS termination using certificates from the Tailscale daemon. Each port is served on its own hostname:port combination (port-based routing per Constitution Principle III).

```yaml
# Created dynamically by orchestrator for each session
apiVersion: v1
kind: ConfigMap
metadata:
  name: sandbox-caddy-config-${SESSION_ID}
  namespace: mastragen-sandboxes
data:
  Caddyfile: |
    # Hostname pattern: {id}-mastragen-{env}.{tailnet}.ts.net
    # Caddy gets TLS certs from Tailscale daemon (requires TS_PERMIT_CERT_UID=caddy)

    # Mastra Studio
    ${SESSION_ID}-mastragen-${ENV}.${TAILNET_DOMAIN}:4111 {
        reverse_proxy localhost:4111
    }

    # Astro UI Sandbox
    ${SESSION_ID}-mastragen-${ENV}.${TAILNET_DOMAIN}:4321 {
        reverse_proxy localhost:4321
    }

    # VS Code Server
    ${SESSION_ID}-mastragen-${ENV}.${TAILNET_DOMAIN}:8080 {
        reverse_proxy localhost:8080
    }
```

**Tailscale Configuration**: The Tailscale sidecar must set `TS_PERMIT_CERT_UID=caddy` to allow the Caddy process to fetch certificates.

#### Service URLs

Once the sandbox is running, users access each service on its own port:

| Service | URL | Purpose |
|---------|-----|---------|
| **Mastra** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:4111` | Tool/agent testing + Studio UI |
| **Astro** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:4321` | React UI component prototyping |
| **VS Code** | `https://{id}-mastragen-{env}.{tailnet}.ts.net:8080` | Full IDE (starts on first access) |

All services share the same `/workspace` volume, so changes in VS Code are immediately visible in cui and trigger Mastra/Astro HMR.

#### Lazy-Start VS Code Server

Custom image that only starts code-server on first HTTP request:

```dockerfile
# sandbox/code-server/Dockerfile
FROM codercom/code-server:latest

USER root

# Install socat for the lazy-start wrapper
RUN apt-get update && apt-get install -y socat && rm -rf /var/lib/apt/lists/*

# Copy lazy-start script
COPY lazy-start.sh /usr/local/bin/lazy-start.sh
RUN chmod +x /usr/local/bin/lazy-start.sh

USER coder

ENTRYPOINT ["/usr/local/bin/lazy-start.sh"]
```

```bash
#!/bin/bash
# sandbox/code-server/lazy-start.sh
#
# Lazy-start wrapper for code-server
# Listens on :8080 but only spawns code-server when first request arrives
# This saves significant memory when VS Code isn't being used

PORT=8080
CODE_SERVER_STARTED=false
CODE_SERVER_PID=""

# Health check endpoint (always responds, even before code-server starts)
health_response() {
  echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\",\"codeServerStarted\":$CODE_SERVER_STARTED}"
}

# Start code-server if not already running
start_code_server() {
  if [ "$CODE_SERVER_STARTED" = false ]; then
    echo "[lazy-start] First request received, starting code-server..."
    
    # Start code-server in background
    code-server --bind-addr 127.0.0.1:8081 $CODE_SERVER_ARGS &
    CODE_SERVER_PID=$!
    
    # Wait for code-server to be ready
    until curl -s http://127.0.0.1:8081 > /dev/null 2>&1; do
      sleep 0.5
    done
    
    CODE_SERVER_STARTED=true
    echo "[lazy-start] code-server ready on :8081"
  fi
}

# Main loop - use socat to handle incoming connections
if [ "$LAZY_START" = "true" ]; then
  echo "[lazy-start] Running in lazy mode - code-server will start on first request"
  
  # Use a simple HTTP server for initial requests
  while true; do
    # Accept connection and read first line
    exec 3<>/dev/tcp/0.0.0.0/$PORT 2>/dev/null || {
      # Fallback: use socat for proper connection handling
      socat TCP-LISTEN:$PORT,reuseaddr,fork SYSTEM:'
        read request
        if echo "$request" | grep -q "GET /health"; then
          echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\"}"
        else
          # Start code-server and proxy
          pkill -f "socat.*8080" 2>/dev/null || true
          exec code-server --bind-addr 0.0.0.0:8080 '"$CODE_SERVER_ARGS"'
        fi
      '
      break
    }
  done
else
  # Non-lazy mode: start code-server immediately
  exec code-server --bind-addr 0.0.0.0:$PORT $CODE_SERVER_ARGS
fi
```

In practice, a simpler approach using nginx or a small Go binary as the wrapper might be more robust. Here's an alternative using a minimal Go wrapper:

```go
// sandbox/code-server/lazy-start.go
package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"sync"
)

var (
	codeServerStarted bool
	startMutex        sync.Mutex
)

func main() {
	port := "8080"
	codeServerPort := "8081"
	
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","codeServerStarted":%t}`, codeServerStarted)
	})
	
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		startMutex.Lock()
		if !codeServerStarted {
			// Start code-server
			args := os.Getenv("CODE_SERVER_ARGS")
			cmd := exec.Command("code-server", "--bind-addr", "127.0.0.1:"+codeServerPort)
			cmd.Args = append(cmd.Args, args)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Start(); err != nil {
				http.Error(w, "Failed to start code-server", 500)
				startMutex.Unlock()
				return
			}
			
			// Wait for ready
			for i := 0; i < 60; i++ {
				resp, err := http.Get("http://127.0.0.1:" + codeServerPort)
				if err == nil {
					resp.Body.Close()
					break
				}
				time.Sleep(500 * time.Millisecond)
			}
			
			codeServerStarted = true
			fmt.Println("[lazy-start] code-server started")
		}
		startMutex.Unlock()
		
		// Proxy request to code-server
		proxy := httputil.NewSingleHostReverseProxy(&url.URL{
			Scheme: "http",
			Host:   "127.0.0.1:" + codeServerPort,
		})
		proxy.ServeHTTP(w, r)
	})
	
	fmt.Printf("[lazy-start] Listening on :%s (code-server will start on first request)\n", port)
	http.ListenAndServe(":"+port, nil)
}
```

---

### 4. cui Extensions

We fork/extend `cui` to add Mastragen-specific functionality.

#### UI Sandbox Panel

```tsx
// cui-extensions/src/components/MastraPanel.tsx
import { useState, useEffect } from 'react';
import { useConfig } from '@/hooks/useConfig';

interface Artifact {
  id: string;
  name: string;
  type: 'tool' | 'agent' | 'workflow';
  description?: string;
}

export function MastraPanel() {
  const { mastraUrl, environment } = useConfig();
  const [artifacts, setArtifacts] = useState<{
    tools: Artifact[];
    agents: Artifact[];
    workflows: Artifact[];
  }>({ tools: [], agents: [], workflows: [] });
  
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  
  useEffect(() => {
    fetchArtifacts();
    // Poll for changes (HMR may add new artifacts)
    const interval = setInterval(fetchArtifacts, 5000);
    return () => clearInterval(interval);
  }, []);
  
  async function fetchArtifacts() {
    const [tools, agents, workflows] = await Promise.all([
      fetch(`${mastraUrl}/api/tools`).then(r => r.json()),
      fetch(`${mastraUrl}/api/agents`).then(r => r.json()),
      fetch(`${mastraUrl}/api/workflows`).then(r => r.json()),
    ]);
    setArtifacts({ tools, agents, workflows });
  }
  
  async function testTool(toolId: string, input: any) {
    const res = await fetch(`${mastraUrl}/api/tools/${toolId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    setTestResult(await res.json());
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Environment indicator */}
      <div className={`p-2 text-center text-sm font-medium ${
        environment === 'production' 
          ? 'bg-red-100 text-red-800' 
          : 'bg-green-100 text-green-800'
      }`}>
        {environment.toUpperCase()} Environment
      </div>
      
      {/* Artifact list */}
      <div className="flex-1 overflow-auto p-4">
        <ArtifactSection title="Tools" items={artifacts.tools} onSelect={setSelectedArtifact} />
        <ArtifactSection title="Agents" items={artifacts.agents} onSelect={setSelectedArtifact} />
        <ArtifactSection title="Workflows" items={artifacts.workflows} onSelect={setSelectedArtifact} />
      </div>
      
      {/* Test panel */}
      {selectedArtifact && (
        <div className="border-t p-4">
          <h4 className="font-medium mb-2">Test: {selectedArtifact.name}</h4>
          <textarea
            className="w-full p-2 border rounded mb-2 font-mono text-sm"
            rows={4}
            placeholder="Enter JSON input..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          <button
            className="w-full p-2 bg-blue-500 text-white rounded"
            onClick={() => testTool(selectedArtifact.id, JSON.parse(testInput))}
          >
            Run Test
          </button>
          {testResult && (
            <pre className="mt-2 p-2 bg-gray-100 rounded text-sm overflow-auto">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
```

#### Session Controls

```tsx
// cui-extensions/src/components/SessionControls.tsx
import { useConfig } from '@/hooks/useConfig';
import { useState } from 'react';

export function SessionControls() {
  const { sessionId, orchestratorUrl, tailnetDomain, env } = useConfig();
  const [loading, setLoading] = useState(false);

  const mastraUrl = `https://${sessionId}-mastragen-${env}.${tailnetDomain}:4111`;
  
  async function suspend() {
    setLoading(true);
    await fetch(`${orchestratorUrl}/sessions/${sessionId}/suspend`, {
      method: 'POST',
      credentials: 'include',
    });
    // Redirect to landing page
    window.location.href = process.env.LANDING_PAGE_URL!;
  }
  
  async function createPR() {
    const title = prompt('PR Title:');
    if (!title) return;
    
    setLoading(true);
    const res = await fetch(`${orchestratorUrl}/sessions/${sessionId}/pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title }),
    });
    const { pr } = await res.json();
    window.open(pr.html_url, '_blank');
    setLoading(false);
  }
  
  async function share() {
    const email = prompt('Share with (email):');
    if (!email) return;
    
    setLoading(true);
    const res = await fetch(`${orchestratorUrl}/sessions/${sessionId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userIds: [email] }),
    });
    const { cuiUrl, mastraUrl } = await res.json();
    await navigator.clipboard.writeText(`cui: ${cuiUrl}\nMastra: ${mastraUrl}`);
    alert('URLs copied to clipboard!');
    setLoading(false);
  }
  
  return (
    <div className="flex gap-2 p-2 border-t">
      <a
        href={mastraUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1 bg-purple-500 text-white rounded text-sm"
      >
        Mastra Studio ↗
      </a>
      <button
        onClick={suspend}
        disabled={loading}
        className="px-3 py-1 bg-yellow-500 text-white rounded text-sm"
      >
        Suspend
      </button>
      <button
        onClick={createPR}
        disabled={loading}
        className="px-3 py-1 bg-green-500 text-white rounded text-sm"
      >
        Create PR
      </button>
      <button
        onClick={share}
        disabled={loading}
        className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
      >
        Share
      </button>
    </div>
  );
}
```

---

### 5. Git Configuration

#### .gitattributes (in ai-completions repo)

```gitattributes
# Exclude cui session data from squash merges
# (retained in branch for session resume, excluded from main)
.cui/ export-ignore
.cui/** export-ignore

# Ensure consistent line endings
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
```

#### Branch Protection Rules

```yaml
# GitHub branch protection for main
branch: main
rules:
  required_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
  required_status_checks:
    strict: true
    contexts:
      - "typecheck"
      - "test"
      - "lint"
  restrictions:
    users: []
    teams: ["ai-team"]
  enforce_admins: false
  
  # Force squash merges (excludes .cui/ via export-ignore)
  allow_merge_commit: false
  allow_rebase_merge: false
  allow_squash_merge: true
  squash_merge_commit_title: PR_TITLE
  squash_merge_commit_message: PR_BODY
```

---

### 6. Tailscale Configuration

#### ACL Policy

```jsonc
// tailscale ACL policy
{
  "acls": [
    // Mastragen sandboxes accessible by their owners
    {
      "action": "accept",
      "src": ["tag:engineer"],
      "dst": ["tag:mastragen-sandbox:*"]
    },
    
    // Shared sandbox access (managed dynamically by orchestrator)
    {
      "action": "accept",
      "src": ["autogroup:shared"],
      "dst": ["tag:mastragen-sandbox:*"]
    }
  ],
  
  "tagOwners": {
    "tag:mastragen-sandbox": ["tag:orchestrator"],
    "tag:engineer": ["autogroup:member"]
  },
  
  // SSH disabled for sandboxes
  "ssh": []
}
```

---

## Database Schema (Kysely)

Mastragen uses **Kysely** for type-safe database access, supporting both SQLite (default) and PostgreSQL.

### TypeScript Types

```typescript
// orchestrator/src/db/types.ts
import { Generated, ColumnType } from 'kysely';

export interface Database {
  projects: ProjectTable;
  project_environments: ProjectEnvironmentTable;
  project_members: ProjectMemberTable;
  project_cui_configs: ProjectCuiConfigTable;
  project_commands: ProjectCommandTable;
  project_skills: ProjectSkillTable;
  sessions: SessionTable;
  session_shares: SessionShareTable;
}

interface ProjectTable {
  id: string;
  name: string;
  github_repo: string;
  default_branch: string;
  branch_prefix: string;
  mastra_path: string;
  ui_sandbox_path: string | null;
  ui_sandbox_template: string | null;
  cui_config_version: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

interface ProjectEnvironmentTable {
  id: string;
  project_id: string;
  name: string;
  env_vars: string;    // JSON
  secret_refs: string; // JSON
}

interface ProjectMemberTable {
  project_id: string;
  user_id: string;
  role: 'admin' | 'member';
}

interface ProjectCuiConfigTable {
  project_id: string;
  settings: string | null;           // JSON
  mcp_servers: string | null;        // JSON
  claude_context: string | null;
  auto_approve_patterns: string | null; // JSON
  updated_at: Generated<Date>;
}

interface ProjectCommandTable {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  content: string;
}

interface ProjectSkillTable {
  id: string;
  project_id: string;
  name: string;
  content: string;
}

interface SessionTable {
  id: string;
  project_id: string;
  user_id: string;
  artifact_name: string;
  branch_name: string;
  state: 'active' | 'suspended' | 'pr_open' | 'merged' | 'archived';
  environment: string;
  pod_name: string | null;
  tailscale_hostname: string | null;
  last_commit_sha: string | null;
  commit_count: number;
  pr_number: number | null;
  pr_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_activity_at: Generated<Date>;
}

interface SessionShareTable {
  session_id: string;
  shared_with_user_id: string;
  shared_at: Generated<Date>;
}
```

### Database Connection

```typescript
// orchestrator/src/db/index.ts
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import SQLite from 'better-sqlite3';
import { Pool } from 'pg';
import { Database } from './types';

export function createDb(): Kysely<Database> {
  const url = process.env.DATABASE_URL || 'sqlite:///data/mastragen.db';
  
  if (url.startsWith('postgres')) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: url }),
      }),
    });
  }
  
  const path = url.replace('sqlite://', '');
  const sqlite = new SQLite(path);
  sqlite.pragma('journal_mode = WAL');
  
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}
```

### Migration

```typescript
// orchestrator/src/db/migrations/001_initial.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Projects
  await db.schema
    .createTable('projects')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('github_repo', 'text', col => col.notNull())
    .addColumn('default_branch', 'text', col => col.defaultTo('main'))
    .addColumn('branch_prefix', 'text', col => col.defaultTo('mg/'))
    .addColumn('mastra_path', 'text', col => col.defaultTo('.'))
    .addColumn('ui_sandbox_path', 'text')
    .addColumn('ui_sandbox_template', 'text')
    .addColumn('cui_config_version', 'text')
    .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Project environments
  await db.schema
    .createTable('project_environments')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('project_id', 'text', col => col.references('projects.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('env_vars', 'text')
    .addColumn('secret_refs', 'text')
    .execute();

  // Project members
  await db.schema
    .createTable('project_members')
    .addColumn('project_id', 'text', col => col.references('projects.id').onDelete('cascade'))
    .addColumn('user_id', 'text', col => col.notNull())
    .addColumn('role', 'text', col => col.defaultTo('member'))
    .addPrimaryKeyConstraint('pk_project_members', ['project_id', 'user_id'])
    .execute();

  // cui configuration
  await db.schema
    .createTable('project_cui_configs')
    .addColumn('project_id', 'text', col => col.primaryKey().references('projects.id').onDelete('cascade'))
    .addColumn('settings', 'text')
    .addColumn('mcp_servers', 'text')
    .addColumn('claude_context', 'text')
    .addColumn('auto_approve_patterns', 'text')
    .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Project commands
  await db.schema
    .createTable('project_commands')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('project_id', 'text', col => col.references('projects.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('description', 'text')
    .addColumn('content', 'text', col => col.notNull())
    .execute();

  // Project skills
  await db.schema
    .createTable('project_skills')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('project_id', 'text', col => col.references('projects.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('content', 'text', col => col.notNull())
    .execute();

  // Sessions
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('project_id', 'text', col => col.references('projects.id').notNull())
    .addColumn('user_id', 'text', col => col.notNull())
    .addColumn('artifact_name', 'text', col => col.notNull())
    .addColumn('branch_name', 'text', col => col.notNull().unique())
    .addColumn('state', 'text', col => col.defaultTo('active'))
    .addColumn('environment', 'text', col => col.notNull())
    .addColumn('pod_name', 'text')
    .addColumn('tailscale_hostname', 'text')
    .addColumn('last_commit_sha', 'text')
    .addColumn('commit_count', 'integer', col => col.defaultTo(0))
    .addColumn('pr_number', 'integer')
    .addColumn('pr_url', 'text')
    .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('last_activity_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex('idx_sessions_project_user')
    .on('sessions')
    .columns(['project_id', 'user_id', 'state'])
    .execute();

  // Session shares
  await db.schema
    .createTable('session_shares')
    .addColumn('session_id', 'text', col => col.references('sessions.id').onDelete('cascade'))
    .addColumn('shared_with_user_id', 'text', col => col.notNull())
    .addColumn('shared_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint('pk_session_shares', ['session_id', 'shared_with_user_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('session_shares').execute();
  await db.schema.dropTable('sessions').execute();
  await db.schema.dropTable('project_skills').execute();
  await db.schema.dropTable('project_commands').execute();
  await db.schema.dropTable('project_cui_configs').execute();
  await db.schema.dropTable('project_members').execute();
  await db.schema.dropTable('project_environments').execute();
  await db.schema.dropTable('projects').execute();
}
```

### Repository Layer

```typescript
// orchestrator/src/repositories/projects.ts
import { Kysely } from 'kysely';
import { Database } from '../db/types';
import { nanoid } from 'nanoid';

export class ProjectRepository {
  constructor(private db: Kysely<Database>) {}

  async findById(id: string) {
    return this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByUser(userId: string) {
    return this.db
      .selectFrom('projects')
      .innerJoin('project_members', 'projects.id', 'project_members.project_id')
      .selectAll('projects')
      .where('project_members.user_id', '=', userId)
      .execute();
  }

  async getEnvironments(projectId: string) {
    return this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
  }

  async getCuiConfig(projectId: string) {
    return this.db
      .selectFrom('project_cui_configs')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  async getCommands(projectId: string) {
    return this.db
      .selectFrom('project_commands')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
  }

  async getSkills(projectId: string) {
    return this.db
      .selectFrom('project_skills')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
  }
}

// orchestrator/src/repositories/sessions.ts
export class SessionRepository {
  constructor(private db: Kysely<Database>) {}

  async create(session: {
    projectId: string;
    userId: string;
    artifactName: string;
    branchName: string;
    environment: string;
  }) {
    const id = nanoid(8);
    return this.db
      .insertInto('sessions')
      .values({
        id,
        project_id: session.projectId,
        user_id: session.userId,
        artifact_name: session.artifactName,
        branch_name: session.branchName,
        environment: session.environment,
        state: 'active',
        commit_count: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByProjectAndUser(projectId: string, userId: string, includeArchived = false) {
    let query = this.db
      .selectFrom('sessions')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId);
    
    if (!includeArchived) {
      query = query.where('state', '!=', 'archived');
    }
    
    return query.orderBy('updated_at', 'desc').execute();
  }

  async findByUser(userId: string) {
    return this.db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('state', '!=', 'archived')
      .orderBy('updated_at', 'desc')
      .execute();
  }

  async update(id: string, updates: Partial<SessionTable>) {
    return this.db
      .updateTable('sessions')
      .set({ ...updates, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async addShare(sessionId: string, userId: string) {
    return this.db
      .insertInto('session_shares')
      .values({ session_id: sessionId, shared_with_user_id: userId })
      .onConflict(oc => oc.doNothing())
      .execute();
  }

  async findSharedWithUser(userId: string) {
    return this.db
      .selectFrom('sessions')
      .innerJoin('session_shares', 'sessions.id', 'session_shares.session_id')
      .selectAll('sessions')
      .where('session_shares.shared_with_user_id', '=', userId)
      .where('sessions.state', '=', 'active')
      .execute();
  }
}
```

### Storage Configuration

| Environment | DATABASE_URL | Notes |
|-------------|--------------|-------|
| Local dev | `sqlite:///data/mastragen.db` | Default, zero config |
| Docker Compose | `sqlite:///data/mastragen.db` | PersistentVolume |
| K8s (simple) | `sqlite:///data/mastragen.db` | Single replica + PVC |
| K8s (production) | `postgres://...` | RDS, multi-replica |

---

## Implementation Phases

### Phase 1: Core Platform (Week 1-2)

- [ ] SQLite database with Kysely schema (projects, sessions, cui configs)
- [ ] Orchestrator API (Hono)
  - Project CRUD (admin)
  - Session lifecycle (create, suspend, resume, PR)
- [ ] Sandbox container image (cui, Mastra, Astro, code-server)
- [ ] Tailscale sidecar configuration (port-based routing)
- [ ] Kubernetes pod template (dynamic based on project config)
- [ ] Local development with Docker Compose

**Deliverable:** Single project can create/use sandboxes locally

### Phase 2: Git Integration (Week 2-3)

- [ ] GitHub App setup (repo access, branch/PR management)
- [ ] Dynamic branch creation based on `project.branchPrefix`
- [ ] Init container respects `project.mastraPath` and `project.uiSandboxPath`
- [ ] Commit on suspend (including .cui/ history)
- [ ] PR creation
- [ ] .gitattributes for squash merge exclusion

**Deliverable:** Sessions persist as branches, PRs work for any configured project

### Phase 3: cui Configuration (Week 3-4)

- [ ] cui config injection (MCP servers, commands, skills, CLAUDE.md)
- [ ] Built-in commands (/suspend, /pr, /share, /extract, /env)
- [ ] Built-in skills (mastra-development, artifact-extraction, session-management)
- [ ] Project-specific MCP server configuration
- [ ] Auto-approve patterns

**Deliverable:** cui fully configured per-project without repo changes

### Phase 4: Landing Page (Week 4-5)

- [ ] Next.js landing page
- [ ] Project selector in "New Session" form
- [ ] Sessions grouped by project
- [ ] Project admin pages (Git, Environments, cui Config, Skills, Access)
- [ ] Authentication (OIDC/SSO integration)

**Deliverable:** Full session and project management UI

### Phase 5: Sharing & Polish (Week 5-6)

- [ ] Session sharing via Tailscale ACLs
- [ ] "Shared with me" in landing page
- [ ] Idle session auto-suspend (configurable timeout)
- [ ] Monitoring and alerts
- [ ] Documentation

**Deliverable:** Production-ready multi-project platform

### Phase 6: Advanced Features (Future)

- [ ] UI sandbox templates library
- [ ] Project cloning (copy config to new project)
- [ ] Usage analytics per project
- [ ] Cost allocation
- [ ] Self-service project creation (with approval workflow)
- [ ] Documentation

**Deliverable:** Production-ready platform

---

## Security Considerations

### Network Security

- **Tailscale encryption**: All traffic encrypted end-to-end
- **ACL-based access**: Only session owner (+ explicit shares) can connect
- **No public exposure**: Sandboxes only accessible via Tailscale

### Authentication Flow

```
1. User authenticates via OIDC/SSO → JWT issued
2. JWT used for orchestrator API calls
3. Project-specific environment secrets injected at sandbox creation
4. Tailscale identity used for sandbox access (separate from JWT)
```

### Sandbox Isolation

- Each session in its own pod
- Network egress configurable per project
- Configurable pod lifetime limit
- Resource quotas enforced

---

## Local Development

### Docker Compose

For local development without Kubernetes:

```yaml
# docker-compose.yml
version: '3.8'

services:
  orchestrator:
    build: ./orchestrator
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=sqlite:///data/mastragen.db
      - JWT_SECRET=local-dev-secret
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_PRIVATE_KEY_PATH=/secrets/github-app.pem
      - SANDBOX_BACKEND=docker  # Use Docker instead of K8s
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - mastragen-data:/data
      - ./secrets:/secrets:ro
      - /var/run/docker.sock:/var/run/docker.sock
    
  # Landing page
  landing:
    build: ./landing
    ports:
      - "3001:3000"
    environment:
      - ORCHESTRATOR_URL=http://orchestrator:3000

volumes:
  mastragen-data:
```

### Running Locally

```bash
# 1. Configure GitHub App credentials
mkdir -p secrets
# Place github-app.pem in secrets/

# 2. Set environment variables
export GITHUB_APP_ID=your-app-id

# 3. Start services
docker-compose up -d

# 4. Access landing page
open http://localhost:3001

# 5. Create your first project
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-ai-project",
    "githubRepo": "myorg/my-mastra-project",
    "mastraPath": ".",
    "uiSandboxPath": "ui-sandbox"
  }'
```

When using Docker backend, sandboxes run as sibling containers instead of K8s pods. Tailscale is optional for local dev (direct localhost access).

---

## Cost Considerations

| Resource | Cost Driver | Mitigation |
|----------|-------------|------------|
| Pods | Runtime hours | Auto-suspend after idle (configurable) |
| Tailscale | Devices | Devices removed on pod termination |
| LLM API | Token usage | Per-session, pass-through |
| Git | Storage | Branches cleaned up after merge/archive |

---

## Appendix: Environment Variables

### Orchestrator

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite or PostgreSQL connection | `sqlite:///data/mastragen.db` |
| `JWT_SECRET` | For validating user tokens | Required |
| `GITHUB_APP_ID` | GitHub App for repo access | Required |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key | Required |
| `TAILNET_DOMAIN` | e.g., `tailnet-abc.ts.net` | Required (K8s) |
| `TAILSCALE_API_KEY` | For managing ACLs | Required (K8s) |
| `SANDBOX_BACKEND` | `kubernetes` or `docker` | `kubernetes` |
| `INTERNAL_TOKEN` | For sandbox → orchestrator calls | Auto-generated |

### Sandbox Container

| Variable | Description |
|----------|-------------|
| `SESSION_ID` | Unique session identifier |
| `PROJECT_ID` | Project this session belongs to |
| `BRANCH_NAME` | Git branch for this session |
| `ENVIRONMENT` | Environment name (from project config) |
| `PROJECT_GITHUB_REPO` | Repository in org/repo format |
| `PROJECT_MASTRA_PATH` | Path to Mastra directory in repo |
| `PROJECT_UI_SANDBOX_PATH` | Path to UI sandbox (optional) |
| `CHECKOUT_COMMIT` | Optional: resume from specific commit |
| `ORCHESTRATOR_URL` | For callbacks to orchestrator |
| `CLAUDE_CODE_USE_BEDROCK` | Set to `1` for AWS Bedrock |
| `AWS_REGION` | For Bedrock |

---

## References

- [cui - Web UI for Claude Code](https://github.com/wbopan/cui)
- [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview)
- [Tailscale Kubernetes](https://tailscale.com/kb/1185/kubernetes)
- [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve)
- [Mastra Documentation](https://mastra.ai/docs)
- [Kysely - Type-safe SQL query builder](https://kysely.dev/)
