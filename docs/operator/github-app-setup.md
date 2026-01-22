# GitHub App Setup Guide

This guide covers creating and configuring a GitHub App for Mastragen.

## Overview

Mastragen uses a GitHub App for:
- **Authentication** - Users sign in with their GitHub accounts
- **Repository Access** - Clone and push to repositories
- **Webhooks** - Receive notifications about repository events
- **API Access** - Create branches, pull requests, and manage repositories

## Creating the GitHub App

### 1. Navigate to GitHub Settings

1. Go to your GitHub organization settings
2. Click **Developer settings** → **GitHub Apps**
3. Click **New GitHub App**

### 2. Configure Basic Settings

| Field | Value |
|-------|-------|
| **GitHub App name** | `Mastragen` (or your preferred name) |
| **Description** | AI-powered development platform |
| **Homepage URL** | `https://mastragen-{env}.{tailnet}.ts.net` |

### 3. Configure Callback URLs

**Callback URL:**
```
https://mastragen-{env}.{tailnet}.ts.net/api/auth/callback
```

**Setup URL (optional):**
```
https://mastragen-{env}.{tailnet}.ts.net/setup
```

### 4. Configure Webhooks

**Webhook URL:**
```
https://mastragen-{env}.{tailnet}.ts.net/api/webhooks/github
```

**Webhook secret:** Generate a secure random string:
```bash
openssl rand -hex 32
```

**Subscribe to events:**
- [x] Push
- [x] Pull request
- [x] Repository
- [x] Installation
- [x] Installation repositories

### 5. Configure Permissions

#### Repository Permissions

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| **Contents** | Read & write | Clone, commit, push |
| **Pull requests** | Read & write | Create and manage PRs |
| **Metadata** | Read-only | Repository info |
| **Commit statuses** | Read & write | CI status updates |
| **Checks** | Read & write | Check runs (optional) |

#### Organization Permissions

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| **Members** | Read-only | Team access verification |

#### Account Permissions

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| **Email addresses** | Read-only | User identification |

### 6. Configure Installation Options

- [x] **Any account** - Allow installation on any account
  - OR select **Only on this account** for internal use

### 7. Create the App

Click **Create GitHub App**.

## Collecting Credentials

After creating the app, collect these values:

### App ID

Found on the app's settings page:
- Navigate to your app settings
- Copy the **App ID** (numeric value)

### Client ID and Secret

1. Navigate to your app settings
2. Copy the **Client ID**
3. Generate a new **Client secret**
4. **Save the secret immediately** - it won't be shown again

### Private Key

1. Scroll to **Private keys**
2. Click **Generate a private key**
3. Download the `.pem` file
4. Store securely - this is your signing key

### Webhook Secret

Use the secret you generated in step 4.

## Configuration in Mastragen

### Kubernetes Deployment

Create the secret:

```bash
kubectl create secret generic github-app \
  --namespace mastragen \
  --from-literal=app-id=YOUR_APP_ID \
  --from-literal=client-id=YOUR_CLIENT_ID \
  --from-literal=client-secret=YOUR_CLIENT_SECRET \
  --from-file=private-key=./path/to/private-key.pem \
  --from-literal=webhook-secret=YOUR_WEBHOOK_SECRET
```

Reference in Helm values:

```yaml
orchestrator:
  envFrom:
    - secretRef:
        name: github-app
```

### Docker Compose Deployment

In your `.env` file:

```bash
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.abc123
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_PRIVATE_KEY_PATH=/app/secrets/github-private-key.pem
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

Mount the private key:

```yaml
volumes:
  - ./secrets/github-private-key.pem:/app/secrets/github-private-key.pem:ro
```

## Installing the App

### For Your Organization

1. Go to your GitHub App page
2. Click **Install App**
3. Select your organization
4. Choose repositories:
   - **All repositories** - Full access
   - **Only select repositories** - Choose specific repos

### For Users

Users can install from:
```
https://github.com/apps/YOUR_APP_NAME/installations/new
```

## Webhook Configuration

### Securing Webhooks

Mastragen validates webhook signatures using the webhook secret:

```javascript
// Automatic validation in webhook handler
const signature = request.headers['x-hub-signature-256'];
const isValid = verifyWebhookSignature(body, signature, webhookSecret);
```

### Webhook Events

| Event | Trigger | Mastragen Action |
|-------|---------|------------------|
| `push` | Code pushed | Update session state |
| `pull_request` | PR activity | Sync PR status |
| `installation` | App installed/uninstalled | Update permissions |
| `repository` | Repo changes | Update project info |

## Troubleshooting

### Authentication Fails

1. Verify callback URL matches exactly
2. Check client ID and secret are correct
3. Ensure app is installed on the repository

### Webhooks Not Received

1. Check webhook URL is accessible
2. Verify webhook secret matches
3. Check webhook delivery logs in GitHub

```bash
# Check webhook logs
# GitHub App → Advanced → Recent Deliveries
```

### Permission Errors

1. Verify app has required permissions
2. Check app is installed on the repository
3. User must have access to the repository

### Token Expired

GitHub App tokens expire after 1 hour. Mastragen automatically refreshes tokens.

If issues persist:
```bash
# Check token status in logs
kubectl logs -n mastragen deployment/mastragen-orchestrator | grep "token"
```

## Security Best Practices

1. **Rotate private key annually**
   - Generate new key
   - Update Kubernetes secret
   - Revoke old key

2. **Use minimal permissions**
   - Only enable required permissions
   - Review permissions periodically

3. **Secure webhook secret**
   - Use strong random value
   - Rotate if compromised

4. **Monitor installations**
   - Review installed locations
   - Remove unused installations

5. **Audit webhook deliveries**
   - Check for failures
   - Monitor for unusual activity
