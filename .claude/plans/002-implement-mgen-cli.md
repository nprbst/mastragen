# Implementation Plan: `mgen` CLI

**Feature**: CLI interface for Mastragen orchestrator REST API
**Approach**: TDD with Commander.js on Bun

## Overview

Create an `mgen` CLI that wraps all orchestrator REST endpoints, providing a developer-friendly interface for session management.

## Directory Structure

```
cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry point with Commander.js
│   ├── client.ts             # HTTP client wrapper
│   ├── config.ts             # CLI configuration (API URL, etc.)
│   ├── output.ts             # Output formatting utilities
│   └── commands/
│       ├── health.ts         # mgen health
│       └── session.ts        # mgen session create|list|get|suspend|resume
└── tests/
    ├── client.test.ts
    └── commands/
        └── session.test.ts
```

## Commands

### `mgen health`
```bash
mgen health
# Output: ✓ Orchestrator healthy (db: connected, docker: disconnected)
```

### `mgen session create`
```bash
mgen session create --project <id> --name <artifact-name> --env <environment>
# or shorthand:
mgen session create -p <id> -n <name> -e dev

# Output:
# Session created: abc123
# State: active
# URLs:
#   cui:    http://localhost:3001
#   mastra: http://localhost:4111
#   vscode: http://localhost:8080
```

### `mgen session list`
```bash
mgen session list [--state active|suspended] [--project <id>]
# or:
mgen session ls -s active

# Output (table format):
# ID      PROJECT  ARTIFACT    ENV  STATE     CREATED
# abc123  proj01   my-feature  dev  active    2024-01-17 13:28
# def456  proj01   other       dev  suspended 2024-01-17 12:00
```

### `mgen session get <id>`
```bash
mgen session get abc123

# Output:
# Session: abc123
# Project: proj01
# Artifact: my-feature
# Environment: dev
# State: active
# Created: 2024-01-17T13:28:00Z
# URLs:
#   cui:    http://localhost:3001
#   ...
```

### `mgen session suspend <id>`
```bash
mgen session suspend abc123
# Output: ✓ Session abc123 suspended
```

### `mgen session resume <id>`
```bash
mgen session resume abc123
# Output:
# ✓ Session abc123 resumed
# URLs:
#   cui:    http://localhost:3001
#   ...
```

## Configuration

The CLI reads config from (in priority order):
1. CLI flags: `--api-url http://...`
2. Environment: `MGEN_API_URL`
3. Default: `http://localhost:3000`

## Implementation Steps

### Step 1: Project Setup
- Create `cli/` directory
- Initialize with `bun init`
- Install: `commander`, `chalk` (or `picocolors` for smaller size)
- Add to root workspace

**Files:**
- [cli/package.json](cli/package.json)
- [cli/tsconfig.json](cli/tsconfig.json)

### Step 2: HTTP Client (TDD)
- Write tests for API client
- Implement typed client for all endpoints

**Files:**
- [cli/tests/client.test.ts](cli/tests/client.test.ts) (test first)
- [cli/src/client.ts](cli/src/client.ts)
- [cli/src/config.ts](cli/src/config.ts)

### Step 3: Output Formatting
- Table formatting for lists
- JSON output option (`--json`)
- Color-coded status indicators

**Files:**
- [cli/src/output.ts](cli/src/output.ts)

### Step 4: Commands (TDD)
- Write tests for each command
- Implement health command
- Implement session subcommands

**Files:**
- [cli/tests/commands/session.test.ts](cli/tests/commands/session.test.ts) (test first)
- [cli/src/commands/health.ts](cli/src/commands/health.ts)
- [cli/src/commands/session.ts](cli/src/commands/session.ts)

### Step 5: CLI Entry Point
- Wire up Commander.js
- Add global options (--api-url, --json)
- Add bin entry for `mgen`

**Files:**
- [cli/src/index.ts](cli/src/index.ts)

### Step 6: Integration
- Add `bin` field to package.json
- Add scripts: `dev`, `build`, `test`
- Update root package.json workspace

## API Endpoints Covered

| Command | Method | Endpoint |
|---------|--------|----------|
| `health` | GET | `/health` |
| `session create` | POST | `/sessions` |
| `session list` | GET | `/sessions` |
| `session get` | GET | `/sessions/:id` |
| `session suspend` | POST | `/sessions/:id/suspend` |
| `session resume` | POST | `/sessions/:id/resume` |

## Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Note: Using Bun's built-in `console` styling instead of chalk to keep dependencies minimal.

## Verification

1. **Unit tests**: `cd cli && bun test`
2. **Manual validation**:
   ```bash
   # Start orchestrator
   docker compose up -d orchestrator
   cd orchestrator && bun run db:seed

   # Test CLI
   cd cli
   bun run src/index.ts health
   bun run src/index.ts session create -p 79F4EF -n test-cli -e dev
   bun run src/index.ts session list
   bun run src/index.ts session suspend <id>
   bun run src/index.ts session resume <id>
   ```

3. **After bin setup**:
   ```bash
   bun link  # or npm link
   mgen health
   mgen session list
   ```
