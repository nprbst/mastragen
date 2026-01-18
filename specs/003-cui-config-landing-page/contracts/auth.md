# API Contract: Authentication

**Feature**: 003-cui-config-landing-page
**Base Path**: `/auth`
**Date**: 2026-01-18

## Overview

Authentication endpoints for OIDC/SSO login and JWT token management.

## Endpoints

### GET /auth/login

Initiates OIDC authentication flow.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| provider | string | No | OIDC provider (default: configured default) |
| redirect | string | No | URL to redirect after auth (default: /) |

**Response**: 302 Redirect to OIDC provider

---

### GET /auth/callback

OIDC callback endpoint. Handles provider response and issues JWT.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Authorization code from provider |
| state | string | Yes | State parameter for CSRF protection |

**Response**: 302 Redirect to original destination

**Sets Cookie**: `mastragen_token` (httpOnly, secure, sameSite=strict)

**Error Response** (400):
```json
{
  "error": "Authentication failed",
  "message": "Invalid authorization code"
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

**Clears Cookie**: `mastragen_token`

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
  "avatarUrl": "https://...",
  "provider": "google"
}
```

**Error Response** (401):
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

### POST /auth/refresh

Refreshes JWT token.

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {jwt_token} |

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Updates Cookie**: `mastragen_token`

## JWT Token Schema

```json
{
  "sub": "user_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "iat": 1705564800,
  "exp": 1705651200
}
```

**Token Lifetime**: 24 hours (configurable)

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_INVALID_TOKEN | 401 | Token is invalid or malformed |
| AUTH_EXPIRED_TOKEN | 401 | Token has expired |
| AUTH_PROVIDER_ERROR | 502 | OIDC provider returned error |
| AUTH_USER_NOT_FOUND | 404 | User not found in system |
