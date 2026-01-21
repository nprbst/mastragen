# GitHub App Setup

Mastragen uses a GitHub App for two purposes:
1. **User authentication** (OAuth) - Log users in via GitHub
2. **API access** (App installation) - Clone repos, create branches, make PRs

Each deployment needs its own GitHub App.

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
| Contents | Read & write | Clone repos, create branches, commit changes |
| Pull requests | Read & write | Create PRs from session branches |
| Metadata | Read-only | Required for all apps |

**Organization permissions:**

| Permission | Access | Why |
|------------|--------|-----|
| Members | Read-only | Verify org membership for access control |

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

1. Copy the **App ID** (numeric, e.g., `2698216`)
2. Copy the **Client ID** (starts with `Iv1.`)
3. Under "Client secrets", click **Generate a new client secret**
   - ⚠️ Copy it immediately - it's only shown once!
4. Under "Private keys", click **Generate a private key**
   - Downloads a `.pem` file - store this securely
   - This is used for the app to authenticate with GitHub's API

## Environment Configuration

Add these to your `.env` file:

```bash
# GitHub App - API authentication (for cloning, branches, PRs)
GITHUB_APP_ID=2698216
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
# Or use a file path:
# GITHUB_APP_PRIVATE_KEY_PATH=/path/to/your-app.pem

# GitHub App - OAuth (for user login)
GITHUB_APP_CLIENT_ID=Iv1.your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=https://your-domain.com/api/auth/callback

# JWT signing secret (for Mastragen session tokens)
# Generate with: openssl rand -base64 32
JWT_SECRET=your-secure-random-string
```

### Private Key Format

The private key can be provided as:
- **Inline**: Escape newlines as `\n` in the env var
- **File path**: Use `GITHUB_APP_PRIVATE_KEY_PATH` instead

To convert your `.pem` file to an escaped string:
```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.pem | pbcopy
```

### Development Setup

For local development:

```bash
GITHUB_APP_ID=2698216
GITHUB_APP_PRIVATE_KEY_PATH=./mastragen-dev.pem

GITHUB_APP_CLIENT_ID=Iv1.your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/callback

JWT_SECRET=development-secret-change-in-production
```

## Installing the App

After creating your GitHub App:

1. Go to your app's settings page: `https://github.com/settings/apps/YOUR-APP-NAME`
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
