# Plan: Wire up GitHub App Authentication

## Summary

Enable GitHub App OAuth authentication for the mastragen web UI. This involves fixing a bug, updating configuration defaults, and creating documentation for other organizations to set up their own GitHub App.

## Code Changes

### 1. Fix URL parsing bug in login function
**File:** [web/src/lib/auth.ts:181](web/src/lib/auth.ts#L181)

The `login()` function creates a URL without a base, causing:
```
TypeError: "/api/auth/login" cannot be parsed as a URL.
```

**Fix:**
```typescript
// Before
const loginUrl = new URL(`${API_BASE}/auth/login`);

// After
const loginUrl = new URL(`${API_BASE}/auth/login`, window.location.origin);
```

### 2. Update default redirect URI port
**File:** [orchestrator/src/services/auth.ts:29](orchestrator/src/services/auth.ts#L29)

Change default from port 4000 to 3000:
```typescript
redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
```

## Documentation

### 3. Create `docs/github-app-setup.md`

Create comprehensive setup guide for organizations deploying Mastragen. Contents:

```markdown
# GitHub App Setup

Mastragen uses GitHub App OAuth for authentication. Each deployment needs its own GitHub App.

## Why a GitHub App?

- **Fine-grained permissions**: Request only the access you need
- **Installation-based access**: Users can only access repos where the app is installed
- **Organization support**: Works with personal accounts and organizations

## Creating Your GitHub App

### Step 1: Create the App

1. Go to **GitHub Settings → Developer settings → GitHub Apps → New GitHub App**
   - Or visit: https://github.com/settings/apps/new

2. Fill in the basic info:
   | Field | Value |
   |-------|-------|
   | **App name** | `your-org-mastragen` (must be unique on GitHub) |
   | **Homepage URL** | Your Mastragen deployment URL |
   | **Callback URL** | `https://your-domain.com/api/auth/callback` |

3. Configure OAuth settings:
   - ✅ **Expire user authorization tokens** (recommended)
   - ✅ **Request user authorization (OAuth) during installation**

4. Webhooks (optional for auth-only):
   - ❌ **Active** - Uncheck if you don't need webhook events

### Step 2: Set Permissions

**Repository permissions:**
| Permission | Access | Why |
|------------|--------|-----|
| Contents | Read & write | Access repository files |
| Metadata | Read-only | Required for all apps |

**Account permissions:**
| Permission | Access | Why |
|------------|--------|-----|
| Email addresses | Read-only | Identify users |

### Step 3: Installation Settings

- **Where can this app be installed?**
  - "Only on this account" for private/internal use
  - "Any account" if you want others to install it

### Step 4: Create the App

Click **Create GitHub App**

### Step 5: Get Your Credentials

On your new app's page:

1. Copy the **Client ID** (starts with `Iv1.`)
2. Under "Client secrets", click **Generate a new client secret**
   - ⚠️ Copy it immediately - it's only shown once!

## Environment Configuration

Add these to your `.env` file:

```bash
# GitHub App OAuth (required)
GITHUB_APP_CLIENT_ID=Iv1.your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=https://your-domain.com/api/auth/callback

# JWT signing secret (required)
# Generate with: openssl rand -base64 32
JWT_SECRET=your-secure-random-string
```

### Development Setup

For local development:
```bash
GITHUB_APP_CLIENT_ID=Iv1.your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/callback
JWT_SECRET=development-secret-change-in-production
```

## Installing the App

After creating your GitHub App:

1. Go to your app's settings page
2. Click **Install App** in the sidebar
3. Select the account/organization
4. Choose repositories:
   - "All repositories" or
   - "Only select repositories" → pick specific repos

Users who want to use Mastragen with their repos must also install your GitHub App.

## Troubleshooting

### "Invalid state parameter" error
- The OAuth state expired (10 minute timeout)
- Try logging in again

### "redirect_uri mismatch" error
- The `GITHUB_REDIRECT_URI` doesn't match your GitHub App's callback URL
- Update one or the other to match exactly

### User can't see their repos
- They need to install your GitHub App on their account/org
- Direct them to: `https://github.com/apps/your-app-name/installations/new`
```

### 4. Update `.env.example`
**File:** [.env.example](.env.example)

Add GitHub App section with reference to docs:
```bash
# GitHub App OAuth (required for authentication)
# See docs/github-app-setup.md for setup instructions
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/callback
JWT_SECRET=

# GitHub token (for repo access without app installation)
GITHUB_TOKEN=ghp_...
```

## Files to Modify/Create

| File | Action |
|------|--------|
| [web/src/lib/auth.ts](web/src/lib/auth.ts) | Fix URL constructor bug (line 181) |
| [orchestrator/src/services/auth.ts](orchestrator/src/services/auth.ts) | Update default redirect URI (line 29) |
| `docs/github-app-setup.md` | **Create** - Setup guide for other orgs |
| [.env.example](.env.example) | Add GitHub App variables with doc reference |

## Your Setup (nprbst)

After implementing the above:

1. Create GitHub App at https://github.com/settings/apps/new
2. Add credentials to your local `.env`
3. Install app on `nprbst/mastragen-test-proj`
4. Test the full OAuth flow

## Verification

1. Start dev server
2. Go to `http://localhost:3000/auth/login`
3. Click "Sign in with GitHub"
4. Complete GitHub OAuth consent
5. Verify redirect to dashboard with user info
6. Test `GET /api/auth/me` returns user
7. Test `GET /api/auth/installations` lists installations
