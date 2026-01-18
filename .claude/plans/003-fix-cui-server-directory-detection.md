# Plan: Fix cui-server Directory Detection + Welcome Onboarding Session

## Problem

The cui-server's directory dropdown is empty because it scans `~/.claude/projects/` for existing Claude Code session history. In the Docker container, this directory doesn't exist or is empty, so no working directories appear in the dropdown.

## Root Cause Analysis

Based on [cui documentation](https://github.com/wbopan/cui):
- cui-server scans `~/.claude/projects/` for directories with session history
- Directory names are path-encoded (e.g., `/workspace` → `-workspace`)
- Each project folder contains session `.jsonl` files

The current Docker setup:
- Mounts `/workspace` as the working directory
- Does NOT persist or initialize `~/.claude/` in the container
- Result: empty dropdown since no session history exists

## Solution

1. Initialize the `~/.claude/projects/-workspace/` directory structure when the cui container starts
2. Create a **Welcome onboarding session** that introduces users to the Mastragen sandbox capabilities

### Implementation

#### 1. Create a Welcome Session JSONL file

**New file:** `sandbox/cui/welcome-session.jsonl`

A pre-built conversation that welcomes users and explains what they can do. The format matches Claude Code's session format:

```jsonl
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/workspace","sessionId":"welcome-00000000-0000-0000-0000-000000000000","version":"2.1.11","gitBranch":"","slug":"welcome-to-mastragen","type":"user","message":{"role":"user","content":"Hi! What can I do in this Mastragen sandbox?"},"uuid":"00000001-0000-0000-0000-000000000000","timestamp":"2026-01-01T00:00:00.000Z"}
{"parentUuid":"00000001-0000-0000-0000-000000000000","isSidechain":false,"userType":"external","cwd":"/workspace","sessionId":"welcome-00000000-0000-0000-0000-000000000000","version":"2.1.11","gitBranch":"","slug":"welcome-to-mastragen","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Welcome to your Mastragen sandbox! Here's what you can do:\n\n**Your workspace** (`/workspace`) contains your project repository, ready for development.\n\n**Available services:**\n- **Mastra Studio** (port 4111) - Visual AI workflow builder\n- **Astro Preview** (port 4321) - Live preview of your web UI\n- **VS Code** (port 8080) - Full IDE in your browser\n\n**What I can help with:**\n- Explore and understand your codebase\n- Build and test Mastra AI workflows\n- Write and refactor code\n- Run commands, tests, and builds\n- Debug issues\n\nWhat would you like to work on?"}]},"uuid":"00000002-0000-0000-0000-000000000000","timestamp":"2026-01-01T00:00:01.000Z"}
```

#### 2. Update cui Dockerfile

**File:** [sandbox/cui/Dockerfile](sandbox/cui/Dockerfile)

```dockerfile
# Create .claude directory structure for cui-server directory detection
RUN mkdir -p /root/.claude/projects/-workspace

# Copy welcome session file
COPY welcome-session.jsonl /root/.claude/projects/-workspace/welcome-00000000-0000-0000-0000-000000000000.jsonl
```

#### 3. Update cui entrypoint to ensure directory exists

**File:** [sandbox/cui/entrypoint.sh](sandbox/cui/entrypoint.sh)

Add before exec:
```bash
# Ensure .claude directory structure exists for cui-server directory detection
mkdir -p /root/.claude/projects/-workspace

# Copy welcome session if not already present (preserves existing sessions on restart)
if [ ! -f /root/.claude/projects/-workspace/welcome-*.jsonl ]; then
    cp /welcome-session.jsonl "/root/.claude/projects/-workspace/welcome-00000000-0000-0000-0000-000000000000.jsonl" 2>/dev/null || true
fi
```

#### 4. Add .claude volume mount for persistence

**File:** [docker-compose.yml](docker-compose.yml)

Add volume to cui service:
```yaml
cui:
  volumes:
    - workspace:/workspace
    - cui-claude:/root/.claude  # Persist Claude session data
```

And add the volume definition:
```yaml
volumes:
  workspace:
  cui-claude:  # Persist cui session history
```

## Files to Modify

1. **NEW:** `sandbox/cui/welcome-session.jsonl` - Welcome onboarding session
2. [sandbox/cui/Dockerfile](sandbox/cui/Dockerfile) - Add directory creation and copy welcome session
3. [sandbox/cui/entrypoint.sh](sandbox/cui/entrypoint.sh) - Ensure directory on startup
4. [docker-compose.yml](docker-compose.yml) - Add volume for persistence

## Verification

1. Build and start the cui container:
   ```bash
   docker compose --profile sandbox build cui
   docker compose --profile sandbox up cui -d
   ```

2. Open cui-server at http://localhost:3001

3. Check the directory dropdown - `/workspace` should appear as an option

4. Click on the session labeled "welcome-to-mastragen" - should show the onboarding conversation

5. Verify by inspecting container:
   ```bash
   docker compose --profile sandbox exec cui ls -la /root/.claude/projects/-workspace/
   # Should show: welcome-00000000-0000-0000-0000-000000000000.jsonl
   ```
