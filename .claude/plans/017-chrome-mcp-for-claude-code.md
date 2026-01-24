# Plan: Chrome DevTools MCP for Claude Code Browser Vision

## Goal
Enable Claude Code running in the VSCode container to "see" and interact with the Astro preview via Chrome DevTools MCP.

## Approach: Dual-Mode Support

Support two modes that users can choose between:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Sidecar** | Chrome container in the sandbox | Automatic, isolated, no local setup |
| **Local** | User's Chrome on Mac via Tailscale | Shared view, see what Claude sees |

---

## Implementation

### Phase 1: CLI Machine Identity Detection

**Files:**
- [cli/src/utils/tailscale.ts](cli/src/utils/tailscale.ts) (new)
- [cli/src/commands/session.ts](cli/src/commands/session.ts) (modify)

**Changes:**
1. Create utility to detect local Tailscale hostname:
   ```typescript
   // cli/src/utils/tailscale.ts
   export async function getLocalTailscaleHostname(): Promise<string | null> {
     const result = await $`tailscale status --json`.quiet();
     const status = JSON.parse(result.stdout);
     return status.Self?.HostName || null;
   }
   ```

2. Send hostname when creating session (optional field)

### Phase 2: Database Schema

**Files:**
- [orchestrator/src/db/migrations/](orchestrator/src/db/migrations/) (new migration)
- [orchestrator/src/db/types.ts](orchestrator/src/db/types.ts)

**Changes:**
1. Add `chrome_mode` column to sessions: `'sidecar' | 'local' | null`
2. Add `user_tailscale_hostname` column to sessions (for local mode)

### Phase 3: Chrome Sidecar Container

**Files:**
- [docker-compose.yml](docker-compose.yml)
- [orchestrator/src/services/k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts)
- [orchestrator/src/services/sandbox.ts](orchestrator/src/services/sandbox.ts)

**Docker Compose addition:**
```yaml
chrome:
  image: ghcr.io/browserless/chromium:latest
  ports:
    - "9222:3000"
  environment:
    - CONNECTION_TIMEOUT=300000
    - MAX_CONCURRENT_SESSIONS=2
    - PREBOOT_CHROME=true
  networks:
    - mastragen
  profiles:
    - sandbox
```

**K8s pod addition:** Add chrome container with same config to `buildPodSpec()`

### Phase 4: MCP Server Configuration

**Files:**
- [orchestrator/src/services/claude-injection.ts](orchestrator/src/services/claude-injection.ts)

**Changes:**
1. Update `generateMcpServers()` to check session's chrome_mode
2. Configure MCP server endpoint based on mode:
   - Sidecar: `--browserUrl=http://chrome:3000`
   - Local: `--browserUrl=http://{userTailscaleHostname}.{tailnet}.ts.net:9222`

```typescript
const DEFAULT_MCP_SERVERS: Record<string, McpServerConfig> = {
  // ... existing servers ...
  'chrome-devtools': {
    command: 'npx',
    args: [
      'chrome-devtools-mcp@latest',
      `--browserUrl=${chromeEndpoint}`,  // Dynamic based on mode
    ],
  },
};
```

### Phase 5: CLI Chrome Launch Command

**Files:**
- [cli/src/commands/chrome.ts](cli/src/commands/chrome.ts) (new)
- [cli/src/utils/browser.ts](cli/src/utils/browser.ts) (modify)

**New CLI command:**
```bash
# Launch Chrome with debugging enabled, bound to Tailscale interface
mastragen chrome start

# Stop the debugging Chrome instance
mastragen chrome stop
```

**Implementation:**
1. Detect Tailscale interface IP (`tailscale ip -4`)
2. Launch Chrome with `--remote-debugging-port=9222 --remote-debugging-address={tailscale-ip}`
3. Optionally navigate to a default URL

### Phase 6: Update CLAUDE.md with Browser Instructions

**Files:**
- [orchestrator/src/services/claude-injection.ts](orchestrator/src/services/claude-injection.ts)

Add to generated CLAUDE.md:
```markdown
## Browser Preview Access

You have access to Chrome DevTools via MCP. To see the Astro preview:

1. Navigate to the preview: use `navigate_page` with URL `http://astro:4321`
2. Take a screenshot: use `take_screenshot`
3. Check console: use `list_console_messages`
```

---

## Critical Files Summary

| File | Change |
|------|--------|
| `docker-compose.yml` | Add chrome sidecar service |
| `orchestrator/src/services/claude-injection.ts` | Dynamic MCP endpoint based on chrome_mode |
| `orchestrator/src/services/k8s-sandbox.ts` | Chrome container in K8s pod |
| `orchestrator/src/services/sandbox.ts` | Chrome container for Docker sandbox |
| `orchestrator/src/db/migrations/` | Add chrome_mode + user_tailscale_hostname columns |
| `orchestrator/src/routes/sessions.ts` | Accept chrome_mode + hostname in create request |
| `orchestrator/src/routes/chrome-setup.ts` | **New** - Dynamic script generation + postback endpoints |
| `cli/src/commands/chrome.ts` | **New** - CLI command for local mode |
| `cli/src/utils/tailscale.ts` | **New** - Tailscale hostname/IP detection |
| `web/src/components/NewSessionForm.tsx` | Local Chrome option + `curl` command display |

---

## Verification

1. **Sidecar mode (Docker):**
   ```bash
   docker compose --profile sandbox up
   # In Claude Code: "Navigate to http://astro:4321 and take a screenshot"
   ```

2. **Local mode via CLI:**
   ```bash
   mastragen chrome start
   mastragen session create --chrome-mode=local
   # In Claude Code: "Take a screenshot of the current page"
   # Verify screenshot matches what you see in Chrome
   ```

3. **Local mode via Web UI:**
   - Create session in web UI, select "Local Chrome"
   - Copy the displayed `curl ... | bash` command
   - Run in terminal on Mac
   - Verify Chrome launches and web UI shows "Connected"
   - In Claude Code: "Take a screenshot" - verify it shows your Chrome

---

## Design Decisions

1. **Local mode is default** - Auto-detect Tailscale and prefer user's Chrome. Fall back to sidecar if Tailscale unavailable or Chrome not running.

2. **Security: Bind to Tailscale IP only** - Chrome binds specifically to the Tailscale interface IP (100.x.x.x), not 0.0.0.0. This ensures only Tailnet peers can connect.

---

## Detailed Implementation: CLI Chrome Command

The `mastragen chrome start` command will:

```typescript
// 1. Get Tailscale IP
const tailscaleIp = await $`tailscale ip -4`.text().trim();

// 2. Find Chrome path (existing util)
const chromePath = await findChromePath();

// 3. Launch with debugging bound to Tailscale IP only
await Bun.spawn([
  chromePath,
  `--remote-debugging-port=9222`,
  `--remote-debugging-address=${tailscaleIp}`,
  '--no-first-run',
  '--no-default-browser-check',
]);
```

This ensures Chrome debugging is **only accessible via Tailscale**, not from other networks on the Mac.

---

## Mode Detection Logic

When a session starts, the orchestrator determines Chrome mode:

```
1. CLI provides user_tailscale_hostname?
   ├─ YES → Use local mode (user's Chrome via Tailscale)
   └─ NO  → Use sidecar mode (Chrome container)
```

For local mode to work:
- User must run `mastragen chrome start` before creating session
- CLI detects Tailscale hostname and sends it with session creation
- MCP server configured to connect to user's Chrome

Fallback behavior:
- If local Chrome is unreachable, Claude Code will see MCP connection errors
- User can restart session with `--chrome-mode=sidecar` to use container Chrome

---

## Web UI Users: Dynamic Helper Script

**Approach:** Provide a `curl <url> | bash` command that automates local Chrome setup and posts back the connection info.

### User Flow

1. User creates session in web UI, selects "Local Chrome" mode
2. Web UI displays:
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ Connect Your Local Chrome                               │
   │                                                         │
   │ Run this command in your terminal:                      │
   │                                                         │
   │  curl -sL https://mastragen.dev/chrome/abc123 | bash   │
   │                                                         │
   │ ⏳ Waiting for connection...                            │
   └─────────────────────────────────────────────────────────┘
   ```
3. User runs the command on their Mac
4. Script executes, Chrome launches, info posts back
5. Web UI detects connection, session starts with local Chrome

### Dynamic Script Generation

**Endpoint:** `GET /api/chrome-setup/:token`

The token encodes:
- Session ID (or pending session reference)
- User ID (for validation)
- Expiry timestamp

**Generated script:**
```bash
#!/bin/bash
set -e

# Validate Tailscale is running
if ! command -v tailscale &> /dev/null; then
  echo "❌ Tailscale not found. Install from https://tailscale.com"
  exit 1
fi

# Get Tailscale IP and hostname
TS_IP=$(tailscale ip -4 2>/dev/null)
TS_HOSTNAME=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')

if [ -z "$TS_IP" ]; then
  echo "❌ Tailscale not connected. Run: tailscale up"
  exit 1
fi

echo "✓ Tailscale: $TS_HOSTNAME ($TS_IP)"

# Find Chrome
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  echo "❌ Chrome not found at $CHROME_PATH"
  exit 1
fi

# Launch Chrome with debugging bound to Tailscale IP
echo "🚀 Launching Chrome with DevTools on $TS_IP:9222..."
"$CHROME_PATH" \
  --remote-debugging-port=9222 \
  --remote-debugging-address="$TS_IP" \
  --no-first-run \
  --no-default-browser-check &

# Wait for Chrome to start
sleep 2

# Post connection info back to orchestrator
echo "📡 Registering with Mastragen..."
curl -sX POST "https://mastragen.dev/api/chrome-setup/{{TOKEN}}/connect" \
  -H "Content-Type: application/json" \
  -d "{\"hostname\": \"$TS_HOSTNAME\", \"ip\": \"$TS_IP\", \"port\": 9222}"

echo "✅ Connected! Chrome DevTools available to your session."
echo "   Keep this terminal open while using the session."
```

### Orchestrator Endpoints

**Files:**
- [orchestrator/src/routes/chrome-setup.ts](orchestrator/src/routes/chrome-setup.ts) (new)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chrome-setup/:token` | GET | Returns dynamically generated bash script |
| `/api/chrome-setup/:token/connect` | POST | Receives hostname/IP postback, updates session |
| `/api/chrome-setup/:token/status` | GET | Polling endpoint for web UI to check connection status |

### Session Creation Flow (Web UI)

1. User clicks "Create Session" with local Chrome option
2. Backend creates session in `pending_chrome` state
3. Backend generates setup token (JWT with session ID, user ID, expiry)
4. Frontend displays `curl` command and polls `/status` endpoint
5. User runs script → script POSTs to `/connect`
6. Backend updates session with `user_tailscale_hostname`, transitions to `starting`
7. Frontend sees status change, session launches

### Security Considerations

- Token is single-use and expires after 5 minutes
- Token is tied to authenticated user (validated on postback)
- Script only runs on user's machine (they execute it)
- Chrome binds to Tailscale IP only (not 0.0.0.0)
