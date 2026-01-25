/**
 * Chrome Setup Routes
 *
 * Provides endpoints for web UI users to set up local Chrome with DevTools
 * debugging via Tailscale. Generates dynamic bash scripts that users can
 * run to launch Chrome and register their connection info.
 */
import { Hono } from 'hono';
import * as jose from 'jose';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.ts';
import { getAuthUser, requireAuth } from '../middleware/auth.ts';
import { SessionsRepository } from '../repositories/sessions.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const CHROME_SETUP_TOKEN_EXPIRY = 300; // 5 minutes

// In-memory store for pending chrome setup sessions
// Maps token -> { sessionId, userId, status, hostname?, ip? }
const pendingSetups = new Map<
  string,
  {
    sessionId: string;
    userId: string;
    status: 'pending' | 'connected';
    hostname?: string;
    ip?: string;
    createdAt: number;
  }
>();

// Clean up old pending setups every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [token, setup] of pendingSetups.entries()) {
      if (now - setup.createdAt > CHROME_SETUP_TOKEN_EXPIRY * 1000 * 2) {
        pendingSetups.delete(token);
      }
    }
  },
  5 * 60 * 1000
);

/**
 * Get the secret key for JWT operations.
 */
function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET);
}

/**
 * Create a chrome setup token.
 */
async function createSetupToken(sessionId: string, userId: string): Promise<string> {
  const jwt = await new jose.SignJWT({
    type: 'chrome_setup',
    sessionId,
    userId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHROME_SETUP_TOKEN_EXPIRY}s`)
    .sign(getSecretKey());

  return jwt;
}

/**
 * Verify a chrome setup token.
 */
async function verifySetupToken(token: string): Promise<{
  sessionId: string;
  userId: string;
} | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });

    if (payload.type !== 'chrome_setup') {
      return null;
    }

    return {
      sessionId: payload.sessionId as string,
      userId: payload.userId as string,
    };
  } catch {
    return null;
  }
}

/**
 * Generate the bash script for setting up Chrome.
 */
function generateSetupScript(token: string, apiUrl: string): string {
  return `#!/bin/bash
set -e

echo "Mastragen Chrome Setup"
echo "======================"
echo ""

# Validate Tailscale is installed
if ! command -v tailscale &> /dev/null; then
  echo "Error: Tailscale not found."
  echo "Install from: https://tailscale.com/download"
  exit 1
fi

# Check if jq is available (for JSON parsing)
if ! command -v jq &> /dev/null; then
  echo "Error: jq not found."
  echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
  exit 1
fi

# Get Tailscale IP and hostname
TS_IP=$(tailscale ip -4 2>/dev/null || true)
TS_HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' | sed 's/\\.$//' || true)

if [ -z "$TS_IP" ]; then
  echo "Error: Tailscale not connected."
  echo "Run: tailscale up"
  exit 1
fi

echo "Tailscale: $TS_HOSTNAME ($TS_IP)"
echo ""

# Find Chrome on macOS
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
  # Try user Applications folder
  CHROME_PATH="$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi
if [ ! -f "$CHROME_PATH" ]; then
  echo "Error: Chrome not found."
  echo "Install from: https://www.google.com/chrome"
  exit 1
fi

echo "Found Chrome: $CHROME_PATH"
echo ""

# Launch Chrome with DevTools bound to Tailscale IP
echo "Launching Chrome with DevTools on $TS_IP:9222..."
"$CHROME_PATH" \\
  --remote-debugging-port=9222 \\
  --remote-debugging-address="$TS_IP" \\
  --no-first-run \\
  --no-default-browser-check &

CHROME_PID=$!
echo "Chrome started (PID: $CHROME_PID)"
echo ""

# Wait for Chrome to be ready
sleep 2

# Register with Mastragen
echo "Registering with Mastragen..."
RESPONSE=$(curl -sX POST "${apiUrl}/api/chrome-setup/${token}/connect" \\
  -H "Content-Type: application/json" \\
  -d "{\\"hostname\\": \\"$TS_HOSTNAME\\", \\"ip\\": \\"$TS_IP\\", \\"port\\": 9222}" \\
  -w "\\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "Connected! Chrome DevTools available to your session."
  echo "Keep this terminal open while using the session."
  echo ""
  echo "Press Ctrl+C to stop Chrome and disconnect."

  # Wait for Chrome process
  wait $CHROME_PID 2>/dev/null || true
  echo "Chrome exited."
else
  echo "Error: Failed to register with Mastragen."
  echo "Response: $BODY"
  kill $CHROME_PID 2>/dev/null || true
  exit 1
fi
`;
}

/**
 * Create chrome setup routes.
 */
export function chromeSetupRoutes(db: Kysely<Database>): Hono {
  const app = new Hono();
  const sessionsRepo = new SessionsRepository(db);

  /**
   * POST /chrome-setup/init
   * Initialize a chrome setup flow for a session.
   * Returns the token and curl command for the user to run.
   */
  app.post('/init', requireAuth(), async (c) => {
    const user = getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json<{ sessionId: string }>();
    if (!body.sessionId) {
      return c.json({ error: 'Missing sessionId' }, 400);
    }

    // Verify user owns/has access to the session
    const session = await sessionsRepo.findById(body.sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.user_id !== user.id) {
      return c.json({ error: 'Not authorized for this session' }, 403);
    }

    // Generate setup token
    const token = await createSetupToken(body.sessionId, user.id);

    // Store in pending setups
    pendingSetups.set(token, {
      sessionId: body.sessionId,
      userId: user.id,
      status: 'pending',
      createdAt: Date.now(),
    });

    // Get API URL for the script
    const apiUrl = process.env.ORCHESTRATOR_URL || `${c.req.url.split('/api')[0]}`;

    return c.json({
      token,
      curlCommand: `curl -sL ${apiUrl}/api/chrome-setup/${token} | bash`,
      expiresIn: CHROME_SETUP_TOKEN_EXPIRY,
    });
  });

  /**
   * GET /chrome-setup/:token
   * Returns the bash script for setting up Chrome.
   * This is what users curl and pipe to bash.
   */
  app.get('/:token', async (c) => {
    const token = c.req.param('token');

    // Verify token
    const payload = await verifySetupToken(token);
    if (!payload) {
      return c.text('# Error: Invalid or expired token\nexit 1', 400);
    }

    // Check pending setup exists
    const setup = pendingSetups.get(token);
    if (!setup) {
      return c.text('# Error: Setup session not found or expired\nexit 1', 400);
    }

    // Get API URL
    const apiUrl = process.env.ORCHESTRATOR_URL || `${c.req.url.split('/api')[0]}`;

    // Return the script
    c.header('Content-Type', 'text/plain');
    return c.text(generateSetupScript(token, apiUrl));
  });

  /**
   * POST /chrome-setup/:token/connect
   * Receives the postback from the bash script with Chrome connection info.
   */
  app.post('/:token/connect', async (c) => {
    const token = c.req.param('token');

    // Verify token
    const payload = await verifySetupToken(token);
    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Check pending setup exists
    const setup = pendingSetups.get(token);
    if (!setup) {
      return c.json({ error: 'Setup session not found or expired' }, 400);
    }

    const body = await c.req.json<{
      hostname: string;
      ip: string;
      port: number;
    }>();

    if (!body.hostname || !body.ip) {
      return c.json({ error: 'Missing hostname or ip' }, 400);
    }

    // Update session with chrome info
    await sessionsRepo.update(payload.sessionId, {
      chrome_mode: 'local',
      user_tailscale_hostname: body.hostname,
    });

    // Update pending setup status
    setup.status = 'connected';
    setup.hostname = body.hostname;
    setup.ip = body.ip;

    return c.json({
      success: true,
      message: 'Chrome connected successfully',
    });
  });

  /**
   * GET /chrome-setup/:token/status
   * Polling endpoint for web UI to check if Chrome is connected.
   */
  app.get('/:token/status', async (c) => {
    const token = c.req.param('token');

    // Verify token (but allow checking status with expired tokens)
    const payload = await verifySetupToken(token);

    // Check pending setup
    const setup = pendingSetups.get(token);
    if (!setup) {
      return c.json({
        status: 'expired',
        message: 'Setup session not found or expired',
      });
    }

    return c.json({
      status: setup.status,
      hostname: setup.hostname,
      ip: setup.ip,
      sessionId: setup.sessionId,
      expired: !payload,
    });
  });

  return app;
}
