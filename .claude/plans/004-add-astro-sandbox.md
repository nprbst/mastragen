# Plan: Add Astro UI Prototyping Sandbox to mastragen-test-proj

**Feature**: Astro UI sandbox for prototyping components that integrate with Mastra agents
**Scope**: Changes to both `mastragen-test-proj` (new UI package) and `mastragen-001-core-platform-foundation` (container updates)

## Summary

Add a `packages/ui` Astro project to `mastragen-test-proj` that provides:
- A starter UI sandbox for prototyping components
- Integration with Mastra agents/workflows via API calls
- Persistence in the same PR branches as other Mastra work

## Architecture

```
mastragen-test-proj/
├── packages/
│   └── ui/                    # NEW: Astro UI sandbox
│       ├── package.json
│       ├── astro.config.mjs
│       ├── tailwind.config.mjs
│       ├── src/
│       │   ├── components/    # React interactive components
│       │   ├── layouts/       # Astro layouts
│       │   ├── lib/           # Mastra API client
│       │   └── pages/         # Astro pages
│       └── public/
└── src/mastra/                # Existing (unchanged)
```

**Container Communication**:
- Astro runs on `:4321`, calls Mastra API at `:4111`
- In Docker: `http://mastra:4111` (service name resolution)
- Local dev: `http://localhost:4111`

## Implementation Tasks

### Phase 1: mastragen-test-proj Setup

| Task | File | Description |
|------|------|-------------|
| 1.1 | `package.json` | Add workspaces config and `dev:ui` script |
| 1.2 | `packages/ui/package.json` | Create Astro package with dependencies |
| 1.3 | `packages/ui/astro.config.mjs` | Configure Astro + React + Tailwind |
| 1.4 | `packages/ui/tailwind.config.mjs` | Tailwind configuration |
| 1.5 | `packages/ui/tsconfig.json` | TypeScript config with path aliases |

### Phase 2: Mastra Integration Layer

| Task | File | Description |
|------|------|-------------|
| 2.1 | `packages/ui/src/lib/mastra-client.ts` | API client for calling Mastra agents/workflows |
| 2.2 | `packages/ui/src/styles/global.css` | Tailwind directives |

### Phase 3: Starter Components & Pages

| Task | File | Description |
|------|------|-------------|
| 3.1 | `packages/ui/src/layouts/Layout.astro` | Base layout with navigation |
| 3.2 | `packages/ui/src/pages/index.astro` | Dashboard page |
| 3.3 | `packages/ui/src/pages/chat.astro` | Agent chat interface |
| 3.4 | `packages/ui/src/pages/workflows.astro` | Workflow runner page |
| 3.5 | `packages/ui/src/components/Chat.tsx` | Interactive chat with streaming |
| 3.6 | `packages/ui/src/components/WeatherCard.tsx` | Weather display component |
| 3.7 | `packages/ui/src/components/WorkflowRunner.tsx` | Workflow execution UI |

### Phase 4: Container Updates (mastragen-001-core-platform-foundation)

| Task | File | Description |
|------|------|-------------|
| 4.1 | `sandbox/astro/entrypoint.sh` | Add `UI_SANDBOX_PATH` handling |
| 4.2 | `docker-compose.yml` | Add `UI_SANDBOX_PATH` and `MASTRA_API_URL` env vars |

## Tech Stack Decisions

| Choice | Rationale |
|--------|-----------|
| `packages/ui` directory | Establishes monorepo pattern, clean separation from Mastra code |
| Astro 5 + React | Islands architecture for interactive components where needed |
| Tailwind | Rapid styling without designing CSS architecture |
| API calls (not imports) | Containers are separate services; matches production deployment |

## File Modifications Summary

**mastragen-test-proj** (new files):
- `packages/ui/` - entire new directory (~10 files)
- `package.json` - add workspaces config

**mastragen-001-core-platform-foundation** (updates):
- `sandbox/astro/entrypoint.sh` - add UI_SANDBOX_PATH cd and MASTRA_API_URL
- `docker-compose.yml` - add environment variables to astro service

## Verification

1. **Local dev test**:
   ```bash
   cd mastragen-test-proj
   bun run dev        # Terminal 1: Mastra on :4111
   npm run dev:ui     # Terminal 2: Astro on :4321
   ```
   - Visit http://localhost:4321
   - Test chat with weather agent
   - Run weather workflow

2. **Container test**:
   - Create session via orchestrator with `ui_sandbox_path: "packages/ui"`
   - Verify Astro container starts and serves on :4321
   - Test Mastra API calls work via Docker networking

3. **Git workflow test**:
   - Make UI changes in packages/ui
   - Commit to feature branch
   - Verify both Mastra and UI changes are in same PR
