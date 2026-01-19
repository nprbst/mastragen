# API Contract: Authentication

**Feature**: 003-cui-config-landing-page
**Base Path**: `/auth`, `/webhooks`
**Date**: 2026-01-18

## Overview

Authentication endpoints for GitHub App OAuth login, JWT token management, and GitHub App installation management. Users authenticate via GitHub OAuth (through the GitHub App), and access control is derived from GitHub App installations.

## Endpoints

### GET /auth/login

Initiates GitHub OAuth authentication flow via the GitHub App.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| redirect | string | No | URL to redirect after auth (default: /) |

**Response**: 302 Redirect to GitHub OAuth authorization page

**GitHub OAuth URL**:
```
https://github.com/login/oauth/authorize?
  client_id={GITHUB_APP_CLIENT_ID}&
  redirect_uri={CALLBACK_URL}&
  state={CSRF_STATE}&
  scope=read:user,user:email
```

---

### GET /auth/callback

GitHub OAuth callback endpoint. Exchanges authorization code for access token, fetches user info, and issues JWT.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Authorization code from GitHub |
| state | string | Yes | State parameter for CSRF protection |

**Response**: 302 Redirect to original destination (from `redirect` parameter in /login)

**Sets Cookies**:
- `mastragen_token` (httpOnly, secure, sameSite=strict) - JWT access token
- `mastragen_refresh` (httpOnly, secure, sameSite=strict) - Refresh token

**Error Response** (400):
```json
{
  "error": "Authentication failed",
  "code": "AUTH_GITHUB_ERROR",
  "message": "Failed to exchange authorization code"
}
```

---

### POST /auth/logout

Logs out user and clears session.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

**Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

**Clears Cookies**: `mastragen_token`, `mastragen_refresh`

---

### GET /auth/me

Returns current authenticated user info.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

**Response** (200):
```json
{
  "id": "user_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": "https://avatars.githubusercontent.com/u/12345678",
  "githubId": 12345678,
  "githubLogin": "johndoe"
}
```

**Error Response** (401):
```json
{
  "error": "Unauthorized",
  "code": "AUTH_INVALID_TOKEN",
  "message": "Invalid or expired token"
}
```

---

### POST /auth/refresh

Refreshes JWT token using refresh token.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Cookie | Yes | mastragen_refresh cookie |

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Updates Cookie**: `mastragen_token`

**Error Response** (401):
```json
{
  "error": "Unauthorized",
  "code": "AUTH_REFRESH_INVALID",
  "message": "Invalid or expired refresh token"
}
```

---

### GET /auth/installations

Lists GitHub App installations accessible to the current user. Uses the user's stored GitHub OAuth token to query the GitHub API.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

**Response** (200):
```json
{
  "installations": [
    {
      "id": "inst_abc123",
      "installationId": 12345678,
      "accountType": "Organization",
      "accountLogin": "my-org",
      "accountId": 87654321,
      "repositorySelection": "selected",
      "permissions": {
        "contents": "write",
        "metadata": "read",
        "pull_requests": "write"
      },
      "suspendedAt": null
    }
  ]
}
```

**Note**: This endpoint queries GitHub API (`GET /user/installations`) using the user's stored OAuth token, then enriches with local installation data.

---

### GET /auth/installations/:installationId/repos

Lists repositories for a specific GitHub App installation that the current user has access to.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| installationId | string | Installation ID (our internal ID, not GitHub's) |

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| per_page | number | No | Items per page (default: 30, max: 100) |

**Response** (200):
```json
{
  "repositories": [
    {
      "id": 123456789,
      "name": "my-repo",
      "fullName": "my-org/my-repo",
      "private": true,
      "defaultBranch": "main",
      "permissions": {
        "admin": false,
        "push": true,
        "pull": true
      }
    }
  ],
  "totalCount": 42,
  "page": 1,
  "perPage": 30
}
```

**Error Response** (403):
```json
{
  "error": "Forbidden",
  "code": "AUTH_INSTALLATION_ACCESS_DENIED",
  "message": "You do not have access to this installation"
}
```

---

### POST /webhooks/github

Receives GitHub App webhook events for installation management.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| X-GitHub-Event | Yes | Event type (e.g., "installation") |
| X-GitHub-Delivery | Yes | Unique delivery ID |
| X-Hub-Signature-256 | Yes | HMAC signature for verification |

**Handled Events**:

#### installation
Triggered when the GitHub App is installed, uninstalled, or suspended.

**Payload** (installation.created):
```json
{
  "action": "created",
  "installation": {
    "id": 12345678,
    "account": {
      "login": "my-org",
      "id": 87654321,
      "type": "Organization"
    },
    "repository_selection": "selected",
    "permissions": {
      "contents": "write",
      "metadata": "read"
    }
  }
}
```

**Actions handled**:
- `created` - Store new installation record
- `deleted` - Remove installation record, orphan associated projects
- `suspend` - Mark installation as suspended
- `unsuspend` - Clear suspended status

#### installation_repositories
Triggered when repositories are added to or removed from an installation.

**Payload**:
```json
{
  "action": "added",
  "installation": { "id": 12345678 },
  "repositories_added": [
    { "id": 123, "name": "new-repo", "full_name": "my-org/new-repo" }
  ],
  "repositories_removed": []
}
```

**Response** (200):
```json
{
  "received": true
}
```

**Error Response** (401):
```json
{
  "error": "Unauthorized",
  "code": "WEBHOOK_SIGNATURE_INVALID",
  "message": "Invalid webhook signature"
}
```

---

## JWT Token Schema

```json
{
  "sub": "user_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "github_id": 12345678,
  "github_login": "johndoe",
  "iat": 1705564800,
  "exp": 1705651200
}
```

**Access Token Lifetime**: 24 hours (configurable)
**Refresh Token Lifetime**: 7 days (configurable)

## OAuth Token Storage

The user's GitHub OAuth access token is stored encrypted in the database to enable:
- Querying user's accessible installations (`GET /user/installations`)
- Verifying repository access at session creation time

Token is refreshed automatically when user re-authenticates.

### Token Encryption

GitHub OAuth access tokens are encrypted at rest using AES-256-GCM with a server-managed key stored in environment variable `TOKEN_ENCRYPTION_KEY`. The key should be a 32-byte (256-bit) random value, base64-encoded.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_INVALID_TOKEN | 401 | JWT is invalid or malformed |
| AUTH_EXPIRED_TOKEN | 401 | JWT has expired |
| AUTH_REFRESH_INVALID | 401 | Refresh token is invalid or expired |
| AUTH_GITHUB_ERROR | 502 | GitHub API returned an error |
| AUTH_USER_NOT_FOUND | 404 | User not found in system |
| AUTH_INSTALLATION_ACCESS_DENIED | 403 | User doesn't have access to installation |
| WEBHOOK_SIGNATURE_INVALID | 401 | GitHub webhook signature verification failed |

## Configuration

Required environment variables:

| Variable | Description |
|----------|-------------|
| GITHUB_APP_ID | GitHub App ID |
| GITHUB_APP_CLIENT_ID | GitHub App OAuth client ID |
| GITHUB_APP_CLIENT_SECRET | GitHub App OAuth client secret |
| GITHUB_APP_PRIVATE_KEY | GitHub App private key (PEM format) |
| GITHUB_WEBHOOK_SECRET | Secret for webhook signature verification |
| JWT_SECRET | Secret for signing JWT tokens |
