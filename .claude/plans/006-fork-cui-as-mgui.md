# mgui: Forked cui with Mastragen Chrome

## Overview

Fork [cui-server](https://github.com/wbopan/cui) (Apache-2.0) and create `mgui` - a mastragen-branded Claude UI with integrated session chrome and ui-sandbox preview sidebar.

**Timing**: New phase between Phase 3 (cui Configuration & Landing Page) and Phase 4 (Production Readiness)

## Goals

1. Unified "IDE-like" experience without iframe complexity
2. Session context always visible (status, git branch, quick actions)
3. Integrated ui-sandbox preview without tab switching
4. Mastragen-branded experience

## Scope

### Session Chrome (Top Bar)

A persistent header bar containing:

| Element | Description |
|---------|-------------|
| Session name | Current session identifier |
| Git branch | e.g., `mg/nathan/feature-abc` |
| Service health | ●/◯ indicators for cui, mastra, astro, vscode |
| Quick actions | Buttons (see below) |

**Quick Action Buttons:**
- **Suspend** - Pause session, commit work
- **Create PR** - Open PR from session branch
- **Open Mastra** - New tab to Mastra Studio (port 4111)
- **Open VS Code** - New tab to code-server (port 8080)
- **Toggle Sandbox** - Show/hide ui-sandbox sidebar

### Sandbox Sidebar

- Right-side panel with embedded ui-sandbox (iframe to port 4321)
- Collapsible via toggle button
- Resizable (drag border)
- Only shown when project has `ui_sandbox_path` configured
- Remembers collapsed/expanded state

## Implementation Plan

### Phase 1: Fork & Setup
1. Fork github.com/wbopan/cui to nprbst/mgui (or mastragen org)
2. Rename package to `mgui` in package.json
3. Update branding (logo, title, colors if desired)
4. Build and verify it runs identically to upstream cui
5. Create new Dockerfile in `sandbox/mgui/` using local build

### Phase 2: Session Chrome
1. Study cui codebase structure (React? Solid? etc.)
2. Add top bar component with session info placeholder
3. Wire up session context (passed via env vars or API)
   - Session name: `MGUI_SESSION_NAME`
   - Git branch: `MGUI_GIT_BRANCH`
   - Service URLs: existing env vars
4. Add service health indicators (poll health endpoints)
5. Add quick action buttons
   - Suspend: POST to orchestrator API
   - Create PR: POST to orchestrator API (or `gh` CLI)
   - Open Mastra/VS Code: `window.open()` to URLs
   - Toggle Sandbox: local state

### Phase 3: Sandbox Sidebar
1. Add collapsible right panel component
2. Embed ui-sandbox via iframe (use `ASTRO_URL` or derive from port)
3. Add resize handle (drag to adjust width)
4. Persist collapsed state in localStorage
5. Conditionally render based on `MGUI_HAS_UI_SANDBOX` env var

### Phase 4: Integration
1. Update `docker-compose.yml` to use mgui image instead of cui
2. Update orchestrator to pass new env vars to mgui container
3. Update sandbox service to build/use mgui container
4. Test end-to-end: session create → mgui with chrome → sidebar works

### Phase 5: Polish
1. Keyboard shortcuts (e.g., ⌘\ to toggle sidebar)
2. Loading states for quick actions
3. Error handling (service unavailable, API failures)
4. Responsive behavior (sidebar hidden on narrow screens?)

## Files to Modify

**New files:**
- `sandbox/mgui/Dockerfile` - Container definition
- `sandbox/mgui/entrypoint.sh` - Startup script
- `packages/mgui/` - Forked cui source (or separate repo)

**Modified files:**
- [docker-compose.yml](docker-compose.yml) - Replace cui service with mgui
- [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts) - Pass new env vars
- [orchestrator/src/schemas/sessions.ts](orchestrator/src/schemas/sessions.ts) - Add mgui-specific fields if needed

## Environment Variables (mgui container)

| Variable | Description |
|----------|-------------|
| `CUI_AUTH_TOKEN` | Existing auth token (keep for compatibility) |
| `MGUI_SESSION_NAME` | Display name for session |
| `MGUI_GIT_BRANCH` | Current git branch |
| `MGUI_HAS_UI_SANDBOX` | "true" if ui-sandbox is configured |
| `MASTRA_URL` | URL to Mastra Studio |
| `ASTRO_URL` | URL to ui-sandbox |
| `VSCODE_URL` | URL to code-server |
| `ORCHESTRATOR_URL` | API endpoint for suspend/PR actions |

## Verification

1. **Chrome renders**: Session name, branch, health indicators visible
2. **Quick actions work**:
   - Suspend pauses session and shows confirmation
   - Create PR opens GitHub PR creation
   - Open Mastra/VS Code opens new tabs
   - Toggle shows/hides sidebar
3. **Sidebar works**:
   - ui-sandbox loads in iframe
   - Resize works
   - Collapse/expand persists across page refresh
4. **No regressions**: Core cui chat functionality unchanged

## Open Questions

1. **Upstream sync strategy**: Stay close to upstream or hard fork?
2. **Repo location**: Monorepo (`packages/mgui`) or separate repo?
3. **Auth flow**: Does cui auth need changes for orchestrator API calls?

## Dependencies

- Requires Phase 2 (git integration) for branch display and PR creation
- Requires Phase 3 (cui configuration) patterns for env var injection
- ui-sandbox must be running for sidebar to work (graceful fallback if not)
