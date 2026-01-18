# Plan: Update Auth to GitHub App

**Goal**: Replace generic OIDC/OAuth with GitHub App authentication to enable:
- Fine-grained repo permissions (only repos where app is installed)
- Viral distribution (install once per org, whole team benefits)
- Cleaner permission model (no scary `repo` scope)
- Installation-derived access control (no manual membership management)

## Summary

Switch from generic OIDC auth to GitHub App with two-part flow:
1. **User Authentication** - GitHub App OAuth identifies the user
2. **Installation Tokens** - Access scoped to repos where app is installed

Access control becomes automatic: if the app is installed on a repo, users with GitHub repo access can use it in Mastragen.

---

## Files to Modify

| File | Changes |
|------|---------|
| [contracts/auth.md](specs/003-cui-config-landing-page/contracts/auth.md) | Replace OIDC with GitHub App OAuth, add installation endpoints, add webhook endpoint |
| [data-model.md](specs/003-cui-config-landing-page/data-model.md) | Add `github_app_installations` table, remove `user_project_members`, update `projects` with installation FK |
| [research.md](specs/003-cui-config-landing-page/research.md) | Document GitHub App decision and rationale |
| [spec.md](specs/003-cui-config-landing-page/spec.md) | Update FR-028, FR-030, add installation FRs, update User Story 6 |
| [plan.md](specs/003-cui-config-landing-page/plan.md) | Update tech context and phase notes |

---

## Detailed Changes

### 1. Auth Contract (`contracts/auth.md`)

**Replace endpoints:**
```
GET  /auth/login          → GitHub App OAuth (not generic OIDC)
GET  /auth/callback       → Handle GitHub OAuth callback
POST /auth/logout         → (unchanged)
GET  /auth/me             → (unchanged, returns GitHub user info)
POST /auth/refresh        → (unchanged)
```

**Add new endpoints:**
```
GET  /auth/installations           → List installations accessible to current user
GET  /auth/installations/:id/repos → List repos for an installation
POST /webhooks/github              → Handle installation webhooks
```

**JWT payload update:**
```json
{
  "sub": "user_abc123",
  "email": "user@example.com",
  "github_id": 12345678,
  "github_login": "username",
  "iat": 1705564800,
  "exp": 1705651200
}
```

### 2. Data Model (`data-model.md`)

**New table: `github_app_installations`**
```sql
CREATE TABLE github_app_installations (
  id TEXT PRIMARY KEY,                    -- UUID
  installation_id INTEGER UNIQUE NOT NULL, -- GitHub's installation ID
  account_type TEXT NOT NULL,              -- 'User' or 'Organization'
  account_login TEXT NOT NULL,             -- GitHub login/org name
  account_id INTEGER NOT NULL,             -- GitHub account ID
  permissions TEXT NOT NULL DEFAULT '{}',  -- JSON: granted permissions
  repository_selection TEXT NOT NULL,      -- 'all' or 'selected'
  suspended_at TEXT,                       -- NULL if active
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Remove table: `user_project_members`**
- No longer needed - access derived from GitHub App installations
- Simplifies the model significantly

**Update `users` table:**
- Remove `provider` column (always GitHub)
- Rename `provider_id` → `github_id` (clearer intent)
- Add `github_login` column

**Update `projects` table:**
- Add `installation_id TEXT REFERENCES github_app_installations(id)`
- Access check: verify user has access to repo via GitHub API using installation token

### 3. Research (`research.md`)

Add new section documenting:

**Why GitHub App over OAuth:**
- Fine-grained permissions (no broad `repo` scope)
- Installation-based access model
- Viral distribution (install once per org)
- Webhook-driven updates (real-time sync)

**Two-part auth model:**
- User OAuth: identifies who the user is
- Installation tokens: determines what repos they can access

**Webhook events to handle:**
- `installation` - App installed/uninstalled/suspended
- `installation_repositories` - Repos added/removed

### 4. Spec (`spec.md`)

**Update requirements:**

| Requirement | Old | New |
|-------------|-----|-----|
| FR-028 | "authenticate users via OIDC/SSO provider" | "authenticate users via GitHub App OAuth" |
| FR-030 | "enforce project membership for API access" | "enforce GitHub repo access via app installation" |

**Add new requirements:**
- FR-034: System MUST sync GitHub App installation state via webhooks
- FR-035: System MUST list available installations when user creates a project
- FR-036: System MUST verify user repo access via GitHub API before session creation

**Update User Story 6 scenarios:**
- "Given an unauthenticated user" → redirect to GitHub OAuth (not generic OIDC)
- "Given a user with membership in projects A and B" → "Given a user with repo access to repos A and B where app is installed"

### 5. Plan (`plan.md`)

**Update Technical Context:**
- Change "Authentication: better-auth (OIDC/SSO)" → "Authentication: better-auth (GitHub App OAuth)"
- Add "Webhooks: GitHub App installation events"

**Update Phase 0 Research:**
- Add "GitHub App vs OAuth: Chose GitHub App for installation-based access"

---

## Access Control Flow (New)

```
User requests project list:
1. Get user's GitHub ID from JWT
2. Query GitHub API: GET /user/installations (using user's OAuth token)
3. For each installation, query: GET /installation/{id}/repositories
4. Return projects where project.github_repo is in accessible repos
```

```
User creates session:
1. Verify project.installation_id is in user's accessible installations
2. Verify user has access to project.github_repo via GitHub API
3. Create session (existing flow)
```

---

## Verification

After updating spec artifacts:
- [ ] Auth contract covers GitHub OAuth + installation management
- [ ] Data model removes manual membership, adds installation tracking
- [ ] Spec FRs reflect GitHub App auth (not generic OIDC)
- [ ] Research documents the decision rationale
- [ ] Plan references updated auth approach
