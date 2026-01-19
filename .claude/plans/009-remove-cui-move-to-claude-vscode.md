# Plan: Remove CUI Container, Move Claude Code to VS Code Container

## Summary
Abandon the `cui` container in favor of Claude Code for VSCode inside code-server. Move all Claude commands, skills, MCPs, and configuration to the vscode container. Rename "cui" references to "claude" throughout.

## Key Decisions
- **Config system**: Keep and rename from `cui` → `claude`
- **Commands/Skills**: Inject into `/home/coder/.claude/` (not workspace)
- **History service**: Adapt for VS Code container

---

## Phase 1: Update VS Code Container for Claude Configuration

### 1.1 Update `docker-compose.yml`
- Add environment variables: `ANTHROPIC_API_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Remove `cui` service definition (lines 25-43)
- Remove `cui-claude` volume (line 107)
- No new volume needed - workspace volume + history service handles persistence

### 1.2 Update `sandbox/code-server/Dockerfile`
- Create `/home/coder/.claude` directory structure
- Create `/home/coder/.claude/commands` for custom commands

### 1.3 Update `sandbox/code-server/entrypoint.sh`
- Add git credential configuration (from GITHUB_TOKEN)
- Source environment variables from `/home/coder/.claude/env.sh` if present
- Ensure `.claude/projects/-workspace` directory exists

### 1.4 Delete `sandbox/cui/` directory entirely

---

## Phase 2: Database Migration (004_rename_cui_to_claude.ts)

### 2.1 Create new migration
- Rename table `project_cui_config` → `project_claude_config`
- Drop column `sessions.cui_auth_token`

### 2.2 Update `orchestrator/src/db/types.ts`
- Rename `ProjectCuiConfigTable` → `ProjectClaudeConfigTable`
- Remove `cui_auth_token` from `SessionsTable`
- Update type aliases

---

## Phase 3: Rename Orchestrator Services

### 3.1 Rename files
- `cui-injection.ts` → `claude-injection.ts`
- `cui-history.ts` → `claude-history.ts`
- `repositories/project-cui-config.ts` → `repositories/project-claude-config.ts`
- `schemas/cui-config.ts` → `schemas/claude-config.ts`
- `routes/cui-config.ts` → `routes/claude-config.ts`

### 3.2 Update `orchestrator/src/services/sandbox.ts`
- Remove CUI from `PORTS` constant (delete `cui: 3001`)
- Remove CUI from `IMAGES` constant (delete `cui: 'sandbox-cui'`)
- Update `ServiceUrls` interface: remove `cui` field
- Update `getServiceUrls()`: remove cui URL generation
- Update `startContainers()`: remove CUI container creation, inject config into vscode container instead
- Rename `injectCuiConfig()` → `injectClaudeConfig()`, target `/home/coder/.claude/` paths
- Update `CuiHistoryServiceInterface` → `ClaudeHistoryServiceInterface`
- Update suspend/resume to use vscode container for history

### 3.3 Update `orchestrator/src/services/claude-injection.ts` (renamed)
- Rename class `CuiInjectionService` → `ClaudeInjectionService`
- Update paths from `/home/bun/.claude/` → `/home/coder/.claude/`
- Add injection of commands from `cui-commands/` directory
- Add injection of skills from `cui-skills/` directory

### 3.4 Update `orchestrator/src/services/claude-history.ts` (renamed)
- Rename class `CuiHistoryService` → `ClaudeHistoryService`
- Update container target from cui to vscode
- Update paths from `/home/bun/.claude/` → `/home/coder/.claude/`

### 3.5 Update `orchestrator/src/repositories/sessions.ts`
- Remove `cui_auth_token` from insert/update operations

### 3.6 Update `orchestrator/src/schemas/sessions.ts`
- Remove `cui` from `ServiceUrlsSchema`

### 3.7 Update exports in index files
- `services/index.ts`: Update exports
- `repositories/index.ts`: Update exports
- `schemas/index.ts`: Update exports
- `routes/index.ts`: Update route mounting

---

## Phase 4: Update CLI

### 4.1 Update `cli/src/utils/browser.ts`
- Remove `'cui'` from `ServiceName` type
- Update `resolveServices()` to remove cui handling

### 4.2 Update `cli/src/output.ts`
- Remove CUI URL from `formatSessionCreated()`
- Remove CUI URL from `formatSession()`
- Remove CUI URL from `formatResumed()`
- Remove `cui` from `waitForPorts()` services list

### 4.3 Update `cli/src/commands/session.ts`
- Update `--open` option docs to remove cui references

### 4.4 Update `cli/src/client.ts`
- Update types to match new ServiceUrls without cui

---

## Phase 5: Update Landing Page

### 5.1 Rename `landing-page/src/components/admin/CuiConfigTab.tsx` → `ClaudeConfigTab.tsx`
- Update component name
- Update API endpoints from `/cui-config` → `/claude-config`
- Update labels from "cui" → "Claude"

### 5.2 Update `landing-page/src/components/ProjectTabs.tsx`
- Update import
- Change tab id from `'cui-config'` → `'claude-config'`
- Update tab label from `'cui Config'` → `'Claude Config'`

---

## Phase 6: Move Commands and Skills

### 6.1 Keep `cui-commands/` and `cui-skills/` directories
- Rename to `claude-commands/` and `claude-skills/`
- These will be injected into `/home/coder/.claude/` by `ClaudeInjectionService`

### 6.2 Update injection to copy commands/skills to container (not workspace)
- Commands go to `/home/coder/.claude/commands/`
- Skills content gets appended to `/home/coder/.claude/CLAUDE.md` (global instructions)
- This keeps the workspace clean - nothing injected into the git repo

---

## Phase 7: Update Tests

### 7.1 Rename test files
- `cui-history.test.ts` → `claude-history.test.ts`
- `cui-injection.test.ts` → `claude-injection.test.ts`
- `cui-injection-skills.test.ts` → `claude-injection-skills.test.ts`
- `cui-config.test.ts` → `claude-config.test.ts`

### 7.2 Update test references
- Update all imports and references from cui → claude
- Update mock container names
- Update path assertions

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| [docker-compose.yml](docker-compose.yml) | Remove cui service and volume, add env vars to code-server |
| [sandbox/code-server/Dockerfile](sandbox/code-server/Dockerfile) | Add .claude directory setup |
| [sandbox/code-server/entrypoint.sh](sandbox/code-server/entrypoint.sh) | Add git config, env sourcing |
| [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts) | Core changes: remove cui, inject to vscode |
| [orchestrator/src/db/types.ts](orchestrator/src/db/types.ts) | Rename types, remove cui_auth_token |
| [orchestrator/src/schemas/sessions.ts](orchestrator/src/schemas/sessions.ts) | Remove cui from ServiceUrlsSchema |
| [cli/src/utils/browser.ts](cli/src/utils/browser.ts) | Remove cui from ServiceName |
| [cli/src/output.ts](cli/src/output.ts) | Remove cui URL display |

## Directories to Delete
- `sandbox/cui/` - entire directory

## Directories to Rename
- `cui-commands/` → `claude-commands/`
- `cui-skills/` → `claude-skills/`

---

## Verification

1. **Build containers**: `docker compose build code-server`
2. **Start sandbox**: `docker compose --profile sandbox up`
3. **Verify VS Code**: Open http://localhost:8080, confirm Claude Code extension loads
4. **Verify config injection**: Check `/home/coder/.claude/settings.json` exists in container
5. **Verify CLAUDE.md**: Check `/home/coder/.claude/CLAUDE.md` is generated with skills content
6. **Verify commands**: Check `/home/coder/.claude/commands/` has injected commands
7. **Run tests**: `bun test` in orchestrator and cli directories
8. **Test CLI**: `mastragen session create` - verify no cui URL in output
9. **Test landing page**: Verify "Claude Config" tab works
