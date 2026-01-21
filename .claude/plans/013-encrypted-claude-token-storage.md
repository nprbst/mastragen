# Implementation Plan: Claude Code Token Storage (Encrypted)

## Goal

Store the Claude Code Token securely in localStorage using asymmetric encryption:
- **Encrypted at rest**: Token encrypted with orchestrator's public key before storage
- **Transparent**: User knows their token is being stored
- **Opt-in**: User explicitly chooses to store the token
- **Clearable**: User can easily clear their stored token

## Security Model

```
┌─────────────────────┐                    ┌─────────────────────┐
│       Browser       │                    │    Orchestrator     │
├─────────────────────┤                    ├─────────────────────┤
│                     │  GET /public-key   │                     │
│  Fetch public key ──┼───────────────────►│  Return RSA pub key │
│                     │◄───────────────────┼──                   │
│                     │                    │                     │
│  Encrypt token      │                    │                     │
│  with public key    │                    │                     │
│         │           │                    │                     │
│         ▼           │                    │                     │
│  Store encrypted    │  POST /sessions    │                     │
│  in localStorage    │  {encryptedToken}  │  Decrypt with       │
│         │           ├───────────────────►│  private key        │
│         └───────────┤                    │                     │
└─────────────────────┘                    └─────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| [orchestrator/src/lib/crypto.ts](orchestrator/src/lib/crypto.ts) | NEW: RSA key management and decryption |
| [orchestrator/src/routes/encryption.ts](orchestrator/src/routes/encryption.ts) | NEW: Public key endpoint |
| [orchestrator/src/index.ts](orchestrator/src/index.ts) | Register encryption routes |
| [orchestrator/src/routes/sessions.ts](orchestrator/src/routes/sessions.ts) | Accept and decrypt encrypted tokens |
| [web/src/lib/crypto.ts](web/src/lib/crypto.ts) | NEW: Web Crypto encryption utilities |
| [web/src/lib/auth.ts](web/src/lib/auth.ts) | Token storage with encryption |
| [web/src/components/NewSessionForm.tsx](web/src/components/NewSessionForm.tsx) | Pre-fill, remember checkbox, clear option |
| [web/src/components/SessionCard.tsx](web/src/components/SessionCard.tsx) | Check for stored token on resume, prompt if missing |

---

## Implementation

### 0. Backend: RSA Key Management (`orchestrator/src/lib/crypto.ts`)

```typescript
import crypto from 'crypto';

// Key pair stored in memory, generated at startup or loaded from env
let keyPair: { publicKey: string; privateKey: string } | null = null;

export function initializeKeyPair(): void {
  const envPublicKey = process.env.ENCRYPTION_PUBLIC_KEY;
  const envPrivateKey = process.env.ENCRYPTION_PRIVATE_KEY;

  if (envPublicKey && envPrivateKey) {
    // Load from environment (production)
    keyPair = {
      publicKey: envPublicKey,
      privateKey: envPrivateKey,
    };
  } else {
    // Generate new key pair (development)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyPair = { publicKey, privateKey };
    console.warn('Generated ephemeral RSA key pair. Set ENCRYPTION_PUBLIC_KEY and ENCRYPTION_PRIVATE_KEY for persistence.');
  }
}

export function getPublicKey(): string {
  if (!keyPair) throw new Error('Key pair not initialized');
  return keyPair.publicKey;
}

export function decryptToken(encryptedBase64: string): string {
  if (!keyPair) throw new Error('Key pair not initialized');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: keyPair.privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encrypted
  );
  return decrypted.toString('utf8');
}
```

### 0b. Backend: Encryption Routes (`orchestrator/src/routes/encryption.ts`)

```typescript
import { Hono } from 'hono';
import { getPublicKey } from '../lib/crypto';

export function encryptionRoutes(): Hono {
  const app = new Hono();

  // Public endpoint - no auth required
  app.get('/public-key', (c) => {
    return c.json({ publicKey: getPublicKey() });
  });

  return app;
}
```

### 0c. Backend: Update Sessions Routes

Modify `orchestrator/src/routes/sessions.ts` to accept `encryptedClaudeToken`:

```typescript
// In CreateSessionRequestSchema or ResumeSessionRequestSchema
encryptedClaudeToken: v.optional(v.string()),

// In handler
import { decryptToken } from '../lib/crypto';

// Decrypt if encrypted token provided
let claudeToken = body.claudeToken;
if (body.encryptedClaudeToken) {
  try {
    claudeToken = decryptToken(body.encryptedClaudeToken);
  } catch (err) {
    return c.json({ error: 'Invalid encrypted token' }, 400);
  }
}
```

### 1. Frontend: Web Crypto Utilities (`web/src/lib/crypto.ts`)

NEW file for browser-side encryption:

```typescript
const API_BASE = '/api';
let cachedPublicKey: CryptoKey | null = null;

// Fetch and cache the orchestrator's public key
async function getPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey;

  const res = await fetch(`${API_BASE}/encryption/public-key`);
  if (!res.ok) throw new Error('Failed to fetch public key');

  const { publicKey: pemKey } = await res.json();

  // Convert PEM to ArrayBuffer for Web Crypto
  const pemContents = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  cachedPublicKey = await crypto.subtle.importKey(
    'spki',
    binaryDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  return cachedPublicKey;
}

// Encrypt a token with the orchestrator's public key
export async function encryptToken(plaintext: string): Promise<string> {
  const publicKey = await getPublicKey();
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encoded
  );
  // Return as base64 for transport/storage
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Clear cached key (useful if key rotation happens)
export function clearCachedPublicKey(): void {
  cachedPublicKey = null;
}
```

### 2. Token Storage API (`auth.ts`)

Update auth.ts to store/retrieve encrypted tokens:

```typescript
import { encryptToken } from './crypto';

const CLAUDE_TOKEN_KEY = 'mastragen_claude_token';

// Store encrypted token (async because encryption requires Web Crypto)
export async function setStoredClaudeToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const encrypted = await encryptToken(token);
  localStorage.setItem(CLAUDE_TOKEN_KEY, encrypted);
}

// Get encrypted token (returns encrypted string, backend will decrypt)
export function getStoredClaudeToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CLAUDE_TOKEN_KEY);
}

export function clearStoredClaudeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CLAUDE_TOKEN_KEY);
}

export function hasStoredClaudeToken(): boolean {
  return getStoredClaudeToken() !== null;
}
```

### 3. NewSessionForm.tsx Updates

**Key change**: When a stored token exists, we have the encrypted version. When user enters a new token, we encrypt it before sending.

**State changes:**
```typescript
import { encryptToken } from '../lib/crypto';
import { getStoredClaudeToken, setStoredClaudeToken, clearStoredClaudeToken, hasStoredClaudeToken } from '../lib/auth';

const [rememberToken, setRememberToken] = useState(false);
const [hasStoredToken, setHasStoredToken] = useState(false);

// Check for stored token on mount
useEffect(() => {
  if (hasStoredClaudeToken()) {
    setHasStoredToken(true);
    setRememberToken(true);
    // Don't pre-fill the input - user sees placeholder indicating token is stored
  }
}, []);
```

**In handleSubmit - encrypt and send:**
```typescript
// Determine which token to use
let encryptedToken: string;
if (hasStoredToken && !claudeToken.trim()) {
  // Use stored (already encrypted) token
  encryptedToken = getStoredClaudeToken()!;
} else {
  // Encrypt the newly entered token
  encryptedToken = await encryptToken(claudeToken);
  // Save if "remember" is checked
  if (rememberToken) {
    await setStoredClaudeToken(claudeToken);
  }
}

const res = await fetch(`${API_BASE}/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...createAuthHeaders() },
  body: JSON.stringify({
    projectId: selectedProjectId,
    artifactName: sessionName,
    environment: selectedEnvironment,
    encryptedClaudeToken: encryptedToken, // Send encrypted, not plaintext
    userId: authState.user?.id,
  }),
});
```

**UI - Token field with remember checkbox and clear option:**
```tsx
<div>
  <label htmlFor="claudeToken" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
    Claude Code Token
  </label>
  <input
    type="password"
    id="claudeToken"
    value={claudeToken}
    onChange={(e) => setClaudeToken(e.target.value)}
    placeholder={storedToken ? '••••••••••••' : 'sk-ant-...'}
    className="block w-full rounded-md border ..."
    required
  />
  <div className="mt-2 flex items-center justify-between">
    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary">
      <input
        type="checkbox"
        checked={rememberToken}
        onChange={(e) => setRememberToken(e.target.checked)}
        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      Remember token in this browser
    </label>
    {storedToken && (
      <button
        type="button"
        onClick={() => {
          clearStoredClaudeToken();
          setClaudeToken('');
          setRememberToken(false);
        }}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        Clear stored token
      </button>
    )}
  </div>
  <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
    Run <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1 rounded font-mono">claude setup-token</code> to generate a token
  </p>
</div>
```

### 4. SessionCard.tsx Resume Flow

**Add imports and state for token prompt:**
```typescript
import { encryptToken } from '../lib/crypto';
import { getStoredClaudeToken, setStoredClaudeToken, hasStoredClaudeToken } from '../lib/auth';

const [showTokenPrompt, setShowTokenPrompt] = useState(false);
const [resumeToken, setResumeToken] = useState('');
const [rememberResumeToken, setRememberResumeToken] = useState(false);
```

**Modified handleResume:**
```typescript
async function handleResume() {
  // Check for stored (encrypted) token first
  const storedEncryptedToken = getStoredClaudeToken();

  if (!storedEncryptedToken && !resumeToken) {
    // No token available - show prompt
    setShowTokenPrompt(true);
    return;
  }

  setResuming(true);
  setResumeError(null);

  try {
    // Determine encrypted token to send
    let encryptedToken: string;
    if (resumeToken) {
      // User entered a new token - encrypt it
      encryptedToken = await encryptToken(resumeToken);
      // Save if "remember" is checked
      if (rememberResumeToken) {
        await setStoredClaudeToken(resumeToken);
      }
    } else {
      // Use stored (already encrypted) token
      encryptedToken = storedEncryptedToken!;
    }

    const res = await fetch(`${API_BASE}/sessions/${session.id}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(),
      },
      body: JSON.stringify({
        encryptedClaudeToken: encryptedToken, // Send encrypted
      }),
    });
    // ... rest of resume logic
  } catch (err) {
    // ...
  }
}
```

**Token prompt UI (shown inline when no token stored):**
```tsx
{showTokenPrompt && (
  <div className="mt-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded p-3">
    <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
      Claude Code Token required
    </label>
    <div className="flex gap-2">
      <input
        type="password"
        value={resumeToken}
        onChange={(e) => setResumeToken(e.target.value)}
        placeholder="sk-ant-..."
        className="flex-1 text-xs rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-2 py-1"
      />
      <button
        type="button"
        onClick={handleResume}
        disabled={!resumeToken.trim()}
        className="text-xs px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
      >
        Resume
      </button>
    </div>
    <label className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
      <input
        type="checkbox"
        checked={rememberResumeToken}
        onChange={(e) => setRememberResumeToken(e.target.checked)}
        className="rounded border-gray-300 text-primary-600 text-xs"
      />
      Remember for future sessions
    </label>
  </div>
)}
```

---

## User Flow

### New Session (token not stored)
1. User fills out form, enters Claude token
2. Checks "Remember token in this browser" (opt-in)
3. Submits → token encrypted with public key → stored in localStorage
4. Encrypted token sent to backend → decrypted with private key
5. Future visits: placeholder shows "Using stored token"

### New Session (token stored)
1. Token field shows placeholder "Using stored token"
2. "Clear stored token" link visible
3. User can enter a new token to override
4. Checkbox already checked

### Resume Session (token stored)
1. Click "Resume session"
2. Encrypted token sent automatically from storage
3. Backend decrypts → services start, stoplight shows

### Resume Session (no token stored)
1. Click "Resume session"
2. Inline prompt appears for token
3. User enters token, optionally checks "Remember"
4. Token encrypted → sent to backend
5. If "Remember" checked, encrypted token saved for next time

---

## Key Management (Production)

For production deployment, generate a persistent key pair:

```bash
# Generate RSA key pair
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Set as environment variables (or load from secrets manager)
export ENCRYPTION_PRIVATE_KEY=$(cat private.pem)
export ENCRYPTION_PUBLIC_KEY=$(cat public.pem)
```

In development, keys are generated at startup and logged with a warning.

---

## Verification

1. **Backend key endpoint**: `curl /api/encryption/public-key` returns a valid PEM public key
2. **New session with remember**: Create session, check "Remember", inspect localStorage - value should be base64 encrypted blob
3. **New session uses stored**: Refresh page, submit without entering token - should work using stored encrypted token
4. **Clear token**: Click "Clear stored token", verify localStorage key is removed
5. **Resume with stored token**: Resume a suspended session, verify it works without prompting
6. **Resume without token**: Clear stored token, try resume, verify prompt appears
7. **Decryption works**: Backend logs should show decrypted token being used (dev only)
