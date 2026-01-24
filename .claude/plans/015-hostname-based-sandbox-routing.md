# Hostname-Based Routing for Sandbox Services

**Status:** Deferred - reference documentation for future implementation

## Current State

Your sandboxes use **path-based routing** on a single Tailscale hostname:

```
https://{sessionId}-mastragen-{env}.{tailnet}.ts.net/mastra  → Mastra (4111)
https://{sessionId}-mastragen-{env}.{tailnet}.ts.net/astro   → Astro (4321)
https://{sessionId}-mastragen-{env}.{tailnet}.ts.net/        → VS Code (8080)
```

## The Challenge

**Tailscale MagicDNS does not support aliases.** You cannot assign multiple hostnames to the same machine natively. This is an open feature request ([Issue #4457](https://github.com/tailscale/tailscale/issues/4457)).

## Options

### Option A: Split DNS with CoreDNS (Recommended)

Deploy CoreDNS in your cluster to provide hostname-based resolution for sandbox services.

**How it works:**
1. CoreDNS runs in cluster with rewrite rules
2. Tailscale split DNS routes `*.sandbox.mastragen.internal` queries to CoreDNS
3. CoreDNS returns the sandbox pod's Tailscale IP for any `{service}-{sessionId}.sandbox.mastragen.internal`
4. Caddy in the pod routes based on incoming hostname

**Result:**
```
https://mastra-abc123.sandbox.mastragen.internal  → Mastra
https://astro-abc123.sandbox.mastragen.internal   → Astro
https://code-abc123.sandbox.mastragen.internal    → VS Code
```

**Pros:**
- Clean URLs without ports or paths
- No external DNS dependencies
- Works within tailnet only (secure)
- Scales to any number of services

**Cons:**
- Requires CoreDNS deployment
- Additional Tailscale admin console configuration
- More moving parts

---

## Detailed Implementation: Split DNS with CoreDNS

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Tailnet Device (Browser)                                       │
│  Request: https://mastra-abc123.sandbox.mastragen.internal      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Tailscale Split DNS                                            │
│  *.sandbox.mastragen.internal → CoreDNS (100.x.x.x:53)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CoreDNS (in cluster)                                           │
│  mastra-abc123.sandbox... → 100.64.1.42 (pod's Tailscale IP)    │
│  astro-abc123.sandbox...  → 100.64.1.42                         │
│  code-abc123.sandbox...   → 100.64.1.42                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox Pod (100.64.1.42)                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────┐  │
│  │ Caddy   │  │ VS Code │  │ Mastra  │  │ Astro   │  │ TS    │  │
│  │ :443    │  │ :8080   │  │ :4111   │  │ :4321   │  │       │  │
│  │ routes  │──│         │──│         │──│         │──│       │  │
│  │ by host │  │         │  │         │  │         │  │       │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └───────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1: Deploy CoreDNS with Tailscale Sidecar

CoreDNS needs to be accessible from your tailnet. Deploy it with its own Tailscale sidecar:

```yaml
# helm/mastragen/templates/coredns/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mastragen-coredns
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: coredns
          image: coredns/coredns:1.11
          args: ["-conf", "/etc/coredns/Corefile"]
          ports:
            - containerPort: 53
              protocol: UDP
          volumeMounts:
            - name: config
              mountPath: /etc/coredns
            - name: zones
              mountPath: /etc/coredns/zones
        - name: tailscale
          image: tailscale/tailscale:latest
          env:
            - name: TS_AUTHKEY
              valueFrom:
                secretKeyRef:
                  name: tailscale-auth
                  key: key
            - name: TS_HOSTNAME
              value: "mastragen-dns"
```

### Step 2: CoreDNS Configuration with Dynamic Zone

```
# Corefile
sandbox.mastragen.internal:53 {
    file /etc/coredns/zones/sandbox.zone
    reload 10s
    log
    errors
}
```

### Step 3: Zone File Controller

Create a controller/sidecar that watches sandbox pods and updates the zone file:

```typescript
// orchestrator/src/services/dns-controller.ts
async function updateDnsZone(sandboxes: SandboxInfo[]): Promise<void> {
  const zone = generateZoneFile(sandboxes);
  await writeZoneConfigMap(zone);
}

function generateZoneFile(sandboxes: SandboxInfo[]): string {
  let zone = `$ORIGIN sandbox.mastragen.internal.
$TTL 30

@ IN SOA ns1.sandbox.mastragen.internal. admin.sandbox.mastragen.internal. (
    ${Date.now()} ; serial
    3600       ; refresh
    600        ; retry
    86400      ; expire
    30         ; minimum
)

@ IN NS ns1

`;

  for (const sandbox of sandboxes) {
    const shortId = sandbox.sessionId.slice(0, 8);
    const ip = sandbox.tailscaleIp;
    zone += `mastra-${shortId} IN A ${ip}\n`;
    zone += `astro-${shortId}  IN A ${ip}\n`;
    zone += `code-${shortId}   IN A ${ip}\n`;
  }

  return zone;
}
```

### Step 4: Configure Tailscale Split DNS

In your Tailscale admin console (https://login.tailscale.com/admin/dns):

1. Add a **Restricted Nameserver**
2. Nameserver: `100.x.x.x` (the Tailscale IP of your CoreDNS pod)
3. Domain: `sandbox.mastragen.internal`

### Step 5: Update Caddy to Route by Hostname

```caddyfile
# Updated Caddyfile for hostname-based routing
{
  tailscale
}

# Each service gets its own hostname block
https://mastra-{$SESSION_ID}.sandbox.mastragen.internal {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:4111
}

https://astro-{$SESSION_ID}.sandbox.mastragen.internal {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:4321
}

https://code-{$SESSION_ID}.sandbox.mastragen.internal {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:8080
}
```

### Step 6: TLS Certificate Considerations

**Important:** Tailscale only issues certs for `*.{tailnet}.ts.net` domains. For custom domains like `*.sandbox.mastragen.internal`, you'll need one of:

1. **Let's Encrypt with DNS-01 challenge** - Requires public DNS with API access
2. **Internal CA** - Generate certs from your own CA, distribute root cert to clients
3. **HTTP only** - Use `http://` instead of `https://` for internal services (simpler but less secure)

For internal-only access, option 3 (HTTP) may be acceptable since traffic is already encrypted by Tailscale's WireGuard tunnel.

### Files to Create/Modify

| File | Action |
|------|--------|
| `helm/mastragen/templates/coredns/` | New - CoreDNS deployment |
| `orchestrator/src/services/dns-controller.ts` | New - Zone file manager |
| `orchestrator/src/services/k8s-sandbox.ts` | Modify - Update URLs, notify DNS controller |
| Tailscale Admin Console | Configure split DNS |

---

### Option B: Separate Tailscale Nodes Per Service

Run each service as a separate pod with its own Tailscale sidecar. Each gets native MagicDNS.

**Pros:** Native Tailscale DNS, no custom infrastructure
**Cons:** 3x pods, 3x Tailscale device slots, major architectural change

---

### Option C: Keep Path-Based Routing

Stay with current approach. Traffic is already encrypted by Tailscale's WireGuard tunnel, so the paths are just a UX consideration.

---

## Complexity Comparison

| Approach | New Infrastructure | Code Changes | Tailscale Config |
|----------|-------------------|--------------|------------------|
| **A: Split DNS** | CoreDNS + controller | Moderate | Split DNS in admin console |
| **B: Separate pods** | None | Major refactor | None |
| **C: Keep paths** | None | None | None |

## Recommendation

Given that this is a **UX improvement** (not fixing broken functionality), I'd suggest weighing:

- **If clean URLs are important for user experience**: Option A (Split DNS) is the right investment
- **If this is nice-to-have**: Option C (keep paths) avoids complexity

The Split DNS approach is proven infrastructure pattern used by many teams (see [DeepSource's Tailscale setup](https://deepsource.com/blog/tailscale-at-deepsource) and [this split DNS guide](https://blog.nerdz.cloud/2025/tailscale-split-dns/)).

## Sources

- [Tailscale DNS documentation](https://tailscale.com/kb/1054/dns)
- [GitHub Issue #4457 - DNS aliases](https://github.com/tailscale/tailscale/issues/4457)
- [CoreDNS Kubernetes plugin](https://coredns.io/plugins/kubernetes/)
- [External DNS with CoreDNS guide](https://nielsweistra.github.io/blog/2025/10/05/external-dns-coredns-kubernetes/)
