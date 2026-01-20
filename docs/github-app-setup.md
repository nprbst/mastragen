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
