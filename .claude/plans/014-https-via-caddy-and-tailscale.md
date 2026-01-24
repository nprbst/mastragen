# Implementation Plan: Add HTTPS via Caddy + Tailscale

**Feature**: 004-production-readiness
**Decision**: Add Caddy reverse proxy with Tailscale certificate integration
**Approach**: Option A - Caddy sidecar + existing Tailscale sidecar (stable, non-experimental)

---

## Summary

Add HTTPS termination for all Tailnet-exposed services using Caddy with native Tailscale certificate support:

### Hostname Convention
| Component | Pattern | Example |
|-----------|---------|---------|
| **Orchestrator** | `mastragen-{env}.{tailnet}.ts.net` | `mastragen-staging.mynet.ts.net` |
| **Sandbox** | `{sessionId}-mastragen-{env}.{tailnet}.ts.net` | `cuid123-mastragen-staging.mynet.ts.net` |

**Environments**: `local`, `staging`, `production`

### Services Exposed
1. **Orchestrator** → `mastragen-{env}.{tailnet}.ts.net:443`
2. **Sandbox services** → `{id}-mastragen-{env}.{tailnet}.ts.net:{port}` (4111, 4321, 8080)

---

## Background

**HTTPS over Tailnet is mentioned in the architecture document but NOT implemented in the current spec/tasks.**

The [mastragen-architecture-v4.md](docs/mastragen-architecture-v4.md#L482) assumes "HTTPS termination via Tailscale Serve" and shows `serve.json` configuration, but:
- The Phase 4 spec has no functional requirement for HTTPS/TLS
- No task implements Tailscale Serve configuration or `tailscale cert` certificate generation
- The Helm chart tasks (T076-T095) don't include HTTPS termination setup

---

## Findings Table

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| **A1** | Coverage Gap | **CRITICAL** | spec.md:FR-041-044, tasks.md:T093-T095 | Architecture assumes HTTPS via Tailscale Serve ([architecture-v4.md:482](docs/mastragen-architecture-v4.md#L482), [1965-2007](docs/mastragen-architecture-v4.md#L1965)), but spec lacks HTTPS/TLS requirement | Add FR-052: System MUST serve sandbox services over HTTPS via Tailscale |
| A2 | Coverage Gap | HIGH | tasks.md:Phase 7 | No task for Tailscale Serve ConfigMap creation (the `serve.json` shown in architecture) | Add task: Create Tailscale serve.json ConfigMap template in Helm |
| A3 | Coverage Gap | HIGH | spec.md, tasks.md | No task for `tailscale cert` or Tailscale Serve certificate management | Add task: Configure HTTPS termination (either `tailscale serve` or `tailscale cert`) |
| A4 | Underspecification | MEDIUM | spec.md:FR-041 | "Verify Tailscale connectivity" is vague - doesn't specify HTTP vs HTTPS | Clarify: probe should verify HTTPS connectivity |
| A5 | Inconsistency | MEDIUM | docs/mastragen-architecture-v4.md vs spec.md | Architecture shows `https://` URLs (L1270-1273), spec doesn't require HTTPS | Align spec with architecture HTTPS assumption |
| A6 | Underspecification | MEDIUM | spec.md:FR-043 | "ACL configuration via Helm values" doesn't specify ACL structure or tag requirements | Add example ACL structure to operator docs |
| B1 | Terminology | LOW | tasks.md:T086 | "readiness probe with Tailscale connectivity check" - unclear if checking socket or HTTPS | Clarify: check via `tailscale status` or HTTPS health endpoint |

---

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 to FR-007 (Session Sharing) | ✅ Yes | T011-T019 | Complete |
| FR-008 to FR-014 (Idle Auto-Suspend) | ✅ Yes | T020-T036 | Complete |
| FR-015 to FR-020 (Monitoring) | ✅ Yes | T037-T049 | Complete (T041a, T041b pending) |
| FR-021 to FR-026 (Alerting) | ✅ Yes | T050-T075 | Complete |
| FR-027 to FR-034 (Documentation) | ✅ Yes | T098-T107 | Pending |
| FR-035 to FR-040 (Helm Charts) | ✅ Yes | T076-T097 | Pending |
| FR-041 to FR-044 (Tailscale Ops) | ⚠️ Partial | T093-T095 | **Missing HTTPS termination** |
| FR-045 to FR-048 (Container Images) | ✅ Yes | T090-T092 | Pending |
| FR-049 to FR-051 (Secrets) | ✅ Yes | T083, T093 | Pending |
| **HTTPS/TLS (Architecture L482)** | ❌ **No** | - | **Critical gap** |

---

## Constitution Alignment

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Git-Native Persistence | ✅ Pass | No changes to persistence model |
| II. Session Isolation | ⚠️ **Concern** | Isolation via Tailscale ACLs is specified, but HTTPS termination (required for secure transport) is missing |
| III. Multi-Service Architecture | ✅ Pass | Port-based routing preserved |
| IV. Project-First Configuration | ✅ Pass | Idle timeout is per-project |
| V. Simplicity First | ✅ Pass | Uses existing Tailscale tooling |

**Constitution Concern**: Principle II states "Tailscale provides encrypted transport" - this implies HTTPS. Without HTTPS termination, sandbox services would be exposed via plain HTTP over the Tailnet, which is less secure (even though Tailscale itself encrypts traffic at the WireGuard layer).

---

## HTTPS Implementation Options

### Option 1: Tailscale Serve (Architecture's Current Design)
- Configure `serve.json` in the Tailscale sidecar
- Automatically provisions Let's Encrypt certs via Tailscale
- Simpler: no separate cert management
- **Aligns with existing architecture doc**
- Limited: no advanced routing, no rate limiting, no compression

### Option 2: `tailscale cert`
- Generate certs manually using `tailscale cert <hostname>`
- Requires cert rotation management
- More control over certificate lifecycle
- Useful if services need direct access to cert files

### Option 3: Caddy with Tailscale Plugin (Nathan's Suggestion)
- Use `caddy-tailscale` plugin for automatic TLS certs on `*.ts.net` domains
- Rich reverse proxy features: rate limiting, compression, load balancing
- Simple Caddyfile configuration:
  ```
  sandbox-{session}.tailnet-name.ts.net {
      reverse_proxy /cui/*  localhost:3001
      reverse_proxy /mastra/* localhost:4111
      reverse_proxy /astro/* localhost:4321
      reverse_proxy /vscode/* localhost:8080
  }
  ```
- More flexible than Tailscale Serve
- Battle-tested production reverse proxy
- **Trade-off**: Adds Caddy container/sidecar, requires architecture doc update

### Recommendation: Caddy with Tailscale Plugin
**Option 3 is recommended** because:
1. Caddy is a proven production reverse proxy
2. The Tailscale plugin handles certs automatically (no manual `tailscale cert`)
3. Provides flexibility for future routing needs (rate limiting, compression, headers)
4. Simpler configuration than `serve.json`
5. Well-documented and maintained

**Impact**: This changes the architecture from "Tailscale Serve" to "Caddy + Tailscale". The architecture doc would need to be updated.

---

## Metrics

| Metric | Value |
|--------|-------|
| Total Requirements | 51 (FR-001 to FR-051) |
| Total Tasks | 113 (T001 to T113) |
| Coverage % | 98% (50/51 FRs have tasks) |
| Ambiguity Count | 3 (A4, A6, B1) |
| Duplication Count | 0 |
| **Critical Issues** | **1** (A1 - HTTPS coverage gap) |

---

## Next Actions

### Recommended: Implement Caddy with Tailscale Plugin

1. **Update spec.md** with new functional requirements:
   ```
   FR-052: System MUST serve sandbox services over HTTPS using valid TLS certificates
   FR-053: Helm charts MUST include Caddy reverse proxy configuration for HTTPS termination
   FR-054: Caddy MUST use the caddy-tailscale plugin for automatic certificate provisioning
   ```

2. **Add tasks** to Phase 7 in [tasks.md](specs/004-production-readiness/tasks.md):

   **Orchestrator HTTPS:**
   ```
   - [ ] T076a Add Tailscale sidecar to orchestrator deployment template
   - [ ] T076b Add Caddy sidecar to orchestrator deployment with Caddyfile ConfigMap
   - [ ] T076c Configure TS_PERMIT_CERT_UID for Caddy to access Tailscale certs
   - [ ] T076d Expose orchestrator via orchestrator.{tailnet}.ts.net:443
   ```

   **Sandbox HTTPS:**
   ```
   - [ ] T076e Add Caddy sidecar to sandbox pod template
   - [ ] T076f Create dynamic Caddyfile ConfigMap template for per-session proxy config
   - [ ] T076g Configure Caddy to proxy ports 4111, 4321, 8080 (Mastra, Astro, VSCode)
   - [ ] T076h Configure TS_PERMIT_CERT_UID in sandbox Tailscale sidecar
   ```

   **Documentation:**
   ```
   - [ ] T095a Document Caddy + Tailscale HTTPS setup in operator guide
   - [ ] T095b Document TS_PERMIT_CERT_UID configuration
   ```

3. **Update architecture doc** ([mastragen-architecture-v4.md](docs/mastragen-architecture-v4.md)):
   - Replace "Tailscale Serve" (L482) with "Caddy with Tailscale plugin"
   - Update `serve.json` ConfigMap to Caddyfile ConfigMap (L1963-2007)
   - Note: This is an architectural change that should be documented with rationale

### Alternative: Keep Tailscale Serve (Smaller Change)
If minimizing architecture changes is preferred:
- Implement the existing `serve.json` design from architecture doc
- Less flexible but no new components

### If deferring HTTPS:
- Document explicitly that sandbox services use HTTP over Tailscale's encrypted WireGuard tunnel
- Note that browser security features (secure cookies, service workers) may be limited

---

## Research: Caddy + Tailscale Integration

### Key Findings

| Aspect | Finding | Source |
|--------|---------|--------|
| **Native Caddy Support** | Caddy 2.5+ automatically gets certs for `*.ts.net` domains from local Tailscale daemon | [Tailscale Docs](https://tailscale.com/kb/1190/caddy-certificates) |
| **caddy-tailscale Plugin** | Runs Tailscale node inside Caddy; enables `tailscale_auth` for proxy authentication | [GitHub](https://github.com/tailscale/caddy-tailscale) |
| **Non-root Requirement** | Non-root Caddy needs `TS_PERMIT_CERT_UID=caddy` in `/etc/default/tailscaled` | [Tailscale Docs](https://tailscale.com/kb/1190/caddy-certificates) |
| **Plugin Maturity** | Plugin is "very experimental" with potential breaking changes | [GitHub README](https://github.com/tailscale/caddy-tailscale) |
| **Auth Limitation** | `tailscale_auth` doesn't support tagged devices (only user-owned) | [GitHub README](https://github.com/tailscale/caddy-tailscale) |
| **Kubernetes Guidance** | No Kubernetes-specific deployment guidance in docs | Both sources |

### Architecture Options

**Option A: Caddy Sidecar + Existing Tailscale Sidecar**

**Sandbox Pods:**
```
Pod: sandbox-{sessionId}
├── tailscale (sidecar) ─── provides Tailnet connectivity
├── caddy (sidecar) ─────── gets certs from tailscale via socket
├── mastra (:4111)
├── astro (:4321)
└── vscode (:8080)
```

**Orchestrator Deployment:**
```
Deployment: mastragen-orchestrator
├── tailscale (sidecar) ─── Tailnet connectivity for orchestrator
├── caddy (sidecar) ─────── HTTPS termination for API
└── orchestrator (:4000)
```

- Caddy connects to Tailscale socket for certs
- Requires `TS_PERMIT_CERT_UID` configuration
- Two sidecars, but clear separation of concerns
- Orchestrator exposed as `mastragen-{env}.{tailnet}.ts.net:443`
- Sandboxes exposed as `{id}-mastragen-{env}.{tailnet}.ts.net:{port}`

**Option B: Caddy with Embedded Tailscale Plugin**

**Sandbox Pods:**
```
Pod: sandbox-{sessionId}
├── caddy-tailscale (sidecar) ─── both Tailnet + HTTPS
├── mastra (:4111)
├── astro (:4321)
└── vscode (:8080)
```

**Orchestrator Deployment:**
```
Deployment: mastragen-orchestrator
├── caddy-tailscale (sidecar) ─── both Tailnet + HTTPS
└── orchestrator (:4000)
```

- Single sidecar handles both networking and HTTPS
- Uses experimental plugin
- Simpler pod spec but less mature

### Recommendation
**Option A is safer** for production readiness:
- Existing Tailscale sidecar is already designed and tested
- Native Caddy cert support is stable (not "experimental")
- Clear separation: Tailscale handles networking, Caddy handles HTTPS

### Caveats to Consider
1. **Pod startup order**: Caddy needs Tailscale socket available
2. **Resource overhead**: Two sidecars vs one
3. **`TS_PERMIT_CERT_UID`**: Need to configure in sandbox container
4. **Orchestrator exposure**: New Tailscale node for orchestrator itself

---

## Caddy + Tailscale Architecture

```
                                   Tailnet
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │                                                           │
        ▼                                                           ▼
┌───────────────────────┐                          ┌───────────────────────────────┐
│  Orchestrator Pod     │                          │     Sandbox Pod               │
│                       │                          │     sandbox-{sessionId}       │
│  ┌─────────────────┐  │                          │  ┌─────────────────┐          │
│  │ Tailscale       │  │                          │  │ Tailscale       │          │
│  │ (sidecar)       │  │                          │  │ (sidecar)       │          │
│  └────────┬────────┘  │                          │  └────────┬────────┘          │
│           │           │                          │           │                   │
│  ┌────────▼────────┐  │                          │  ┌────────▼────────┐          │
│  │ Caddy           │  │                          │  │ Caddy           │          │
│  │ HTTPS :443      │  │                          │  │ HTTPS           │          │
│  └────────┬────────┘  │                          │  └────────┬────────┘          │
│           │           │                          │           │                   │
│  ┌────────▼────────┐  │                          │     ┌─────┴─────┬─────┐       │
│  │ Orchestrator    │  │                          │     ▼           ▼     ▼       │
│  │ :4000           │  │                          │  ┌──────┐ ┌──────┐ ┌──────┐   │
│  └─────────────────┘  │                          │  │Mastra│ │Astro │ │VSCode│   │
└───────────────────────┘                          │  │:4111 │ │:4321 │ │:8080 │   │
mastragen-{env}.{tailnet}.ts.net                   │  └──────┘ └──────┘ └──────┘   │
                                                   └───────────────────────────────┘
                                                   {id}-mastragen-{env}.{tailnet}.ts.net
```

### Container Image
Use official Caddy image with Tailscale plugin:
```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/tailscale/caddy-tailscale

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

### Caddyfile Templates

**Sandbox Caddyfile** (port-based routing per Constitution Principle III):
```
# Hostname pattern: {id}-mastragen-{env}.{tailnet}.ts.net
# Each service on its own port - no path-based routing
{$SESSION_ID}-mastragen-{$ENV}.{$TAILNET_DOMAIN}:4111 {
    reverse_proxy localhost:4111  # Mastra
}

{$SESSION_ID}-mastragen-{$ENV}.{$TAILNET_DOMAIN}:4321 {
    reverse_proxy localhost:4321  # Astro
}

{$SESSION_ID}-mastragen-{$ENV}.{$TAILNET_DOMAIN}:8080 {
    reverse_proxy localhost:8080  # VS Code
}
```

**Orchestrator Caddyfile**:
```
# Hostname pattern: mastragen-{env}.{tailnet}.ts.net
mastragen-{$ENV}.{$TAILNET_DOMAIN} {
    reverse_proxy localhost:4000  # Hono API
}
```

### Helm Values Addition
```yaml
caddy:
  enabled: true
  image:
    repository: ghcr.io/yourorg/caddy-tailscale
    tag: "2.8"
  resources:
    limits:
      memory: 128Mi
      cpu: 100m
```

---

## Updated Findings After Research

| ID | Category | Severity | Summary | Status |
|----|----------|----------|---------|--------|
| A1 | Coverage Gap | **CRITICAL** | Architecture assumes HTTPS but no implementation in spec/tasks | **Addressed via Caddy research** |
| A2 | Coverage Gap | HIGH | No task for HTTPS termination | **Tasks T076a-T076h proposed** |
| A3 | Coverage Gap | HIGH | Orchestrator not exposed via Tailnet | **Architecture updated** |
| A4 | Design Update | MEDIUM | `cui` removed from architecture | **Diagrams updated** |
| A5 | Research | LOW | caddy-tailscale plugin is "experimental" | **Recommend Option A (native Caddy)** |

---

## Changes to Implement

### 1. Add to spec.md - Functional Requirements

Add after FR-051 in **Secrets Management** section:

```markdown
**HTTPS Termination**:

- **FR-052**: System MUST serve orchestrator API over HTTPS via Tailnet with valid TLS certificates
- **FR-053**: System MUST serve sandbox services (Mastra, Astro, VS Code) over HTTPS via Tailnet
- **FR-054**: Helm charts MUST include Caddy reverse proxy configuration for HTTPS termination
- **FR-055**: Caddy MUST obtain TLS certificates automatically from the local Tailscale daemon
- **FR-056**: Tailscale sidecar MUST be configured with TS_PERMIT_CERT_UID to allow Caddy cert access
```

### 2. Add to tasks.md - Phase 7 Tasks

Insert after T095 (before Minikube Testing section):

```markdown
### HTTPS Termination (Caddy + Tailscale)

- [ ] T095a Build Caddy container image with standard TLS support in .github/workflows/docker-publish.yml
- [ ] T095b Add Tailscale sidecar to orchestrator deployment template in helm/mastragen/templates/orchestrator/deployment.yaml
- [ ] T095c Add Caddy sidecar to orchestrator deployment with Caddyfile ConfigMap
- [ ] T095d Configure TS_PERMIT_CERT_UID=caddy in orchestrator Tailscale sidecar environment
- [ ] T095e Create orchestrator Caddyfile ConfigMap in helm/mastragen/templates/orchestrator/caddy-config.yaml
- [ ] T095f Add Caddy sidecar to sandbox pod template in orchestrator/src/services/k8s-sandbox.ts
- [ ] T095g Create dynamic Caddyfile ConfigMap generation for per-session proxy config
- [ ] T095h Configure TS_PERMIT_CERT_UID=caddy in sandbox Tailscale sidecar environment
- [ ] T095i Update sandbox pod template to use Caddy for HTTPS on ports 4111, 4321, 8080
- [ ] T095j Document Caddy + Tailscale HTTPS setup in docs/operator/tailscale-configuration.md
```

### 3. Update mastragen-architecture-v4.md

Replace "Tailscale Serve" references (L482, L1963-2007) with Caddy configuration:
- Change "HTTPS termination via Tailscale Serve" to "HTTPS termination via Caddy"
- Replace `serve.json` ConfigMap with Caddyfile ConfigMap example
- Update architecture diagram to show Caddy sidecar

### 4. Files to Modify

| File | Change |
|------|--------|
| [spec.md](specs/004-production-readiness/spec.md) | Add FR-052 to FR-056 |
| [tasks.md](specs/004-production-readiness/tasks.md) | Add T095a to T095j |
| [mastragen-architecture-v4.md](docs/mastragen-architecture-v4.md) | Update HTTPS approach |
| [helm/mastragen/templates/orchestrator/deployment.yaml](helm/mastragen/templates/orchestrator/deployment.yaml) | Add Tailscale + Caddy sidecars |
| [helm/mastragen/templates/orchestrator/caddy-config.yaml](helm/mastragen/templates/orchestrator/caddy-config.yaml) | **New**: Orchestrator Caddyfile |
| [orchestrator/src/services/k8s-sandbox.ts](orchestrator/src/services/k8s-sandbox.ts) | Add Caddy sidecar to sandbox pods |
| [docs/operator/tailscale-configuration.md](docs/operator/tailscale-configuration.md) | Document Caddy + Tailscale setup |

---

## Verification

After implementation, verify:

1. **Orchestrator HTTPS**: `curl https://mastragen-staging.{tailnet}.ts.net/health` returns 200
2. **Sandbox HTTPS**: Create session, verify `https://{id}-mastragen-staging.{tailnet}.ts.net:4111` loads Mastra Studio
3. **Certificate validity**: Browser shows valid certificate for `*.ts.net` domain
4. **Minikube test**: Update T097 to verify HTTPS connectivity

## Hostname Convention Summary

| Environment | Orchestrator | Sandbox |
|-------------|-------------|---------|
| Local | `mastragen-local.{tailnet}.ts.net` | `{id}-mastragen-local.{tailnet}.ts.net` |
| Staging | `mastragen-staging.{tailnet}.ts.net` | `{id}-mastragen-staging.{tailnet}.ts.net` |
| Production | `mastragen-production.{tailnet}.ts.net` | `{id}-mastragen-production.{tailnet}.ts.net` |
