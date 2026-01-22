# Tailscale Configuration Guide

This guide covers Tailscale configuration for Mastragen, including networking, ACLs, HTTPS termination via Caddy, and auth key management.

## Overview

Mastragen uses Tailscale for:
- **Private networking** - Secure access to sandbox sessions
- **HTTPS certificates** - Automatic TLS via Tailscale's certificate provisioning
- **Access control** - ACL-based access to sessions and shared sessions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Orchestrator Pod                    │    │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │    │
│  │  │Orchestrator│  │ Tailscale │  │      Caddy        │ │    │
│  │  │  :4000    │  │  Sidecar  │  │  Sidecar (:443)   │ │    │
│  │  └──────────┘  └───────────┘  └───────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Sandbox Pod                        │    │
│  │  ┌────────┐  ┌────────┐  ┌────────┐                 │    │
│  │  │ VSCode │  │ Mastra │  │  Astro │                 │    │
│  │  │ :8080  │  │ :4111  │  │ :4321  │                 │    │
│  │  └────────┘  └────────┘  └────────┘                 │    │
│  │  ┌───────────┐  ┌───────────────────┐               │    │
│  │  │ Tailscale │  │      Caddy        │               │    │
│  │  │  Sidecar  │  │  Sidecar (:443)   │               │    │
│  │  └───────────┘  └───────────────────┘               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Tailscale Mesh
                          ▼
        ┌─────────────────────────────────────┐
        │          Tailnet Clients            │
        │  (Developers, CI/CD, Monitoring)    │
        └─────────────────────────────────────┘
```

## Prerequisites

1. **Tailscale Account** - Create an account at [tailscale.com](https://tailscale.com)
2. **Tailnet** - Your Tailscale network (e.g., `example` for `example.ts.net`)
3. **Auth Keys** - Create auth keys in the Tailscale admin console

## Helm Values Configuration

Configure Tailscale in your `values.yaml`:

```yaml
global:
  environment: "production"  # Used in hostnames

tailscale:
  enabled: true

  # Your tailnet name (the part before .ts.net)
  tailnet: "your-company"

  # Kubernetes secret containing the auth key
  authKeySecretName: tailscale-auth
  authKeySecretKey: key

  # ACL tags for the orchestrator
  aclTags:
    - "tag:mastragen-orchestrator"

caddy:
  enabled: true
```

## Creating the Auth Key Secret

Create a Kubernetes secret with your Tailscale auth key:

```bash
# Create a reusable, ephemeral auth key in Tailscale admin console
# https://login.tailscale.com/admin/settings/keys

kubectl create secret generic tailscale-auth \
  --namespace=mastragen \
  --from-literal=key=tskey-auth-XXXXXXXX
```

**Auth Key Requirements:**
- **Reusable**: Yes (for multiple pods)
- **Ephemeral**: Recommended (auto-removes disconnected devices)
- **Tags**: Include `tag:mastragen-orchestrator` and `tag:mastragen-sandbox`

## ACL Configuration

Configure ACLs in your Tailscale admin console to control access:

```json
{
  "acls": [
    // Allow orchestrator to communicate with sandboxes
    {
      "action": "accept",
      "src": ["tag:mastragen-orchestrator"],
      "dst": ["tag:mastragen-sandbox:*"]
    },

    // Allow users to access their sandboxes (via share permissions)
    {
      "action": "accept",
      "src": ["group:developers"],
      "dst": ["tag:mastragen-sandbox:443"]
    },

    // Allow monitoring systems to scrape metrics
    {
      "action": "accept",
      "src": ["tag:monitoring"],
      "dst": ["tag:mastragen-orchestrator:443"]
    }
  ],

  "tagOwners": {
    "tag:mastragen-orchestrator": ["autogroup:admin"],
    "tag:mastragen-sandbox": ["tag:mastragen-orchestrator"],
    "tag:monitoring": ["autogroup:admin"]
  }
}
```

## HTTPS Termination with Caddy

Mastragen uses Caddy with the Tailscale module for automatic HTTPS:

### How It Works

1. **Tailscale Sidecar** runs with `TS_PERMIT_CERT_UID=caddy`
2. **Caddy Sidecar** requests certificates from Tailscale daemon
3. Certificates are automatically provisioned and renewed
4. All traffic is encrypted with valid TLS certificates

### Hostname Convention

- **Orchestrator**: `mastragen-{env}.{tailnet}.ts.net`
- **Sandboxes**: `{session-id}-mastragen-{env}.{tailnet}.ts.net`

Examples:
- `mastragen-production.your-company.ts.net`
- `abc123de-mastragen-production.your-company.ts.net`

### Caddy Configuration

The orchestrator Caddyfile is managed via Helm ConfigMap:

```caddyfile
# Orchestrator Caddyfile
{
  tailscale
}

https://mastragen-production.your-company.ts.net {
  tls {
    get_certificate tailscale
  }
  reverse_proxy localhost:4000
}
```

Sandbox Caddyfiles are dynamically generated per session:

```caddyfile
# Sandbox Caddyfile (generated per session)
{
  tailscale
}

https://abc123de-mastragen-production.your-company.ts.net {
  tls {
    get_certificate tailscale
  }

  handle /* {
    reverse_proxy localhost:8080  # VS Code
  }

  handle /mastra/* {
    uri strip_prefix /mastra
    reverse_proxy localhost:4111
  }

  handle /astro/* {
    uri strip_prefix /astro
    reverse_proxy localhost:4321
  }
}
```

## Auth Key Rotation

Auth keys should be rotated regularly for security. Follow this procedure:

### Rotation Procedure

1. **Create new auth key** in Tailscale admin console
   - Same settings as existing key (reusable, ephemeral, tags)
   - Note: Both old and new keys will work during transition

2. **Update Kubernetes secret**
   ```bash
   # Option A: Delete and recreate
   kubectl delete secret tailscale-auth -n mastragen
   kubectl create secret generic tailscale-auth \
     --namespace=mastragen \
     --from-literal=key=tskey-auth-NEWKEY

   # Option B: Patch in place
   kubectl patch secret tailscale-auth -n mastragen \
     -p='{"data":{"key":"'$(echo -n "tskey-auth-NEWKEY" | base64)'"}}'
   ```

3. **Rolling restart of pods**
   ```bash
   # Restart orchestrator to pick up new key
   kubectl rollout restart deployment/mastragen-orchestrator -n mastragen

   # Existing sandbox pods will continue working with old connections
   # New sandboxes will use the new key
   ```

4. **Revoke old key** (after all pods restarted)
   - Wait for all pods to restart successfully
   - Verify new connections in Tailscale admin console
   - Delete the old auth key

### Automated Rotation

For production environments, consider automated rotation:

```yaml
# Example CronJob for key rotation reminder
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tailscale-key-rotation-reminder
spec:
  schedule: "0 0 1 */3 *"  # Every 3 months
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: notify
              image: curlimages/curl
              command:
                - /bin/sh
                - -c
                - |
                  curl -X POST "$SLACK_WEBHOOK" \
                    -H 'Content-Type: application/json' \
                    -d '{"text":"Reminder: Rotate Tailscale auth key for Mastragen"}'
          restartPolicy: OnFailure
```

## Troubleshooting

### Pod Not Joining Tailnet

1. Check Tailscale sidecar logs:
   ```bash
   kubectl logs -n mastragen deployment/mastragen-orchestrator -c tailscale
   ```

2. Verify auth key is valid:
   - Check key hasn't expired
   - Verify key tags match ACL requirements

3. Check network connectivity:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c tailscale -- tailscale status
   ```

### Certificate Issues

1. Verify `TS_PERMIT_CERT_UID` is set:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c tailscale -- env | grep TS_PERMIT
   ```

2. Check Caddy logs:
   ```bash
   kubectl logs -n mastragen deployment/mastragen-orchestrator -c caddy
   ```

3. Verify Tailscale socket access:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c caddy -- ls -la /var/run/tailscale/
   ```

### Connection Refused

1. Verify Caddy is running:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c caddy -- caddy version
   ```

2. Check port bindings:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c caddy -- netstat -tlnp
   ```

3. Verify Caddyfile syntax:
   ```bash
   kubectl exec -n mastragen deployment/mastragen-orchestrator -c caddy -- caddy validate --config /etc/caddy/Caddyfile
   ```

## Security Best Practices

1. **Use ephemeral auth keys** - Devices auto-remove when disconnected
2. **Apply least-privilege ACLs** - Only allow necessary access
3. **Rotate keys quarterly** - Set calendar reminders
4. **Monitor Tailscale admin** - Review connected devices regularly
5. **Use tags consistently** - Makes ACL management easier
6. **Enable MFA on Tailscale account** - Protects admin console access
