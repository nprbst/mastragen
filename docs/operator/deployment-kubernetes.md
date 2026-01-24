# Kubernetes Deployment Guide

This guide covers deploying Mastragen to a Kubernetes cluster using Helm.

## Prerequisites

- Kubernetes cluster (1.24+)
- Helm 3.10+
- kubectl configured for your cluster
- Tailscale account with admin access
- GitHub App configured (see [GitHub App Setup](github-app-setup.md))

## Available Scripts

The project provides `bun run` scripts for common operations. Run `bun run` in the project root to see all available helm/k8s scripts, or see the root [package.json](../../package.json).

## Quick Start

```bash
# Development
bun run helm:install:dev

# Staging
bun run helm:install:staging

# Production
bun run helm:install:prod
```

Or with custom values:

```bash
helm install mastragen ./helm/mastragen \
  --namespace mastragen \
  --create-namespace \
  --set global.environment=production \
  --set tailscale.tailnet=your-tailnet
```

## Step-by-Step Deployment

### 1. Create Namespace

```bash
kubectl create namespace mastragen
```

### 2. Create Secrets

#### Tailscale Auth Key

```bash
# Create auth key at https://login.tailscale.com/admin/settings/keys
# Use: Reusable, Ephemeral, Tags: tag:mastragen-orchestrator

kubectl create secret generic tailscale-auth \
  --namespace mastragen \
  --from-literal=key=tskey-auth-XXXXXXXX
```

#### GitHub App Credentials

```bash
kubectl create secret generic github-app \
  --namespace mastragen \
  --from-literal=app-id=YOUR_APP_ID \
  --from-file=private-key=./github-app-private-key.pem \
  --from-literal=webhook-secret=YOUR_WEBHOOK_SECRET
```

### 3. Create Values File

Create `values-production.yaml`:

```yaml
global:
  environment: production

orchestrator:
  replicaCount: 2

  image:
    repository: ghcr.io/your-org/mastragen-orchestrator
    tag: "v1.0.0"

  resources:
    limits:
      cpu: "2"
      memory: "2Gi"
    requests:
      cpu: "500m"
      memory: "512Mi"

  persistence:
    enabled: true
    storageClass: "your-storage-class"
    size: 50Gi

  envFrom:
    - secretRef:
        name: github-app

tailscale:
  enabled: true
  tailnet: "your-company"
  authKeySecretName: tailscale-auth
  aclTags:
    - "tag:mastragen-orchestrator"

caddy:
  enabled: true
  image:
    repository: ghcr.io/your-org/mastragen-caddy
    tag: "v1.0.0"

sandbox:
  storageClass: "your-storage-class"
  storageSize: 10Gi
```

### 4. Install the Chart

```bash
helm install mastragen ./helm/mastragen \
  --namespace mastragen \
  --values values-production.yaml
```

### 5. Verify Deployment

```bash
# Check status (pods, services, PVCs)
bun run k8s:status

# Check orchestrator logs
bun run k8s:logs:orchestrator

# Check Tailscale connection
bun run k8s:logs:tailscale
```

### 6. Configure Tailscale ACLs

Add to your Tailscale ACL configuration:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:mastragen-orchestrator"],
      "dst": ["tag:mastragen-sandbox:*"]
    },
    {
      "action": "accept",
      "src": ["group:developers"],
      "dst": ["tag:mastragen-orchestrator:443", "tag:mastragen-sandbox:443"]
    }
  ],
  "tagOwners": {
    "tag:mastragen-orchestrator": ["autogroup:admin"],
    "tag:mastragen-sandbox": ["tag:mastragen-orchestrator"]
  }
}
```

## Configuration Reference

### Global Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.environment` | Environment name for hostnames | `dev` |
| `nameOverride` | Override chart name | `""` |
| `fullnameOverride` | Override full name | `""` |

### Orchestrator

| Parameter | Description | Default |
|-----------|-------------|---------|
| `orchestrator.replicaCount` | Number of replicas | `1` |
| `orchestrator.image.repository` | Image repository | `ghcr.io/nprbst/mastragen-orchestrator` |
| `orchestrator.image.tag` | Image tag | `latest` |
| `orchestrator.resources.limits.cpu` | CPU limit | `1` |
| `orchestrator.resources.limits.memory` | Memory limit | `1Gi` |
| `orchestrator.persistence.enabled` | Enable persistence | `true` |
| `orchestrator.persistence.size` | PVC size | `10Gi` |

### Tailscale

| Parameter | Description | Default |
|-----------|-------------|---------|
| `tailscale.enabled` | Enable Tailscale sidecar | `true` |
| `tailscale.tailnet` | Your tailnet name | `your-tailnet` |
| `tailscale.authKeySecretName` | Secret name for auth key | `tailscale-auth` |
| `tailscale.aclTags` | ACL tags for orchestrator | `["tag:mastragen-orchestrator"]` |

### Caddy

| Parameter | Description | Default |
|-----------|-------------|---------|
| `caddy.enabled` | Enable Caddy for HTTPS | `true` |
| `caddy.image.repository` | Caddy image | `ghcr.io/nprbst/mastragen-caddy` |

## High Availability

For production HA deployment:

```yaml
orchestrator:
  replicaCount: 3

  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/component: orchestrator
            topologyKey: kubernetes.io/hostname

podDisruptionBudget:
  enabled: true
  minAvailable: 2
```

## Monitoring

### Prometheus Metrics

The orchestrator exposes Prometheus metrics at `/metrics`:

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mastragen
  namespace: mastragen
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: mastragen
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Key Metrics

- `mastragen_sessions_total` - Active sessions by project/state
- `mastragen_api_requests_total` - API request counts
- `mastragen_api_request_duration_seconds` - Request latency
- `mastragen_alerts_fired_total` - Alert counts

## Upgrading

```bash
# Development
bun run helm:upgrade:dev

# Staging
bun run helm:upgrade:staging

# Production
bun run helm:upgrade:prod
```

Or with custom values:

```bash
helm upgrade mastragen ./helm/mastragen \
  --namespace mastragen \
  --values values-production.yaml
```

## Uninstalling

```bash
# Development
bun run helm:uninstall:dev

# Staging
bun run helm:uninstall:staging

# Production
bun run helm:uninstall:prod
```

To also delete PVCs and namespace:

```bash
kubectl delete pvc -n mastragen-dev --all
kubectl delete namespace mastragen-dev
```

## Troubleshooting

### Pods Not Starting

```bash
# Check events
kubectl get events -n mastragen --sort-by='.lastTimestamp'

# Check pod details
kubectl describe pod -n mastragen <pod-name>
```

### Tailscale Not Connecting

```bash
# Check Tailscale logs
kubectl logs -n mastragen deployment/mastragen-orchestrator -c tailscale

# Verify secret exists
kubectl get secret tailscale-auth -n mastragen -o yaml
```

### HTTPS Certificate Issues

```bash
# Check Caddy logs
kubectl logs -n mastragen deployment/mastragen-orchestrator -c caddy

# Verify Tailscale socket
kubectl exec -n mastragen deployment/mastragen-orchestrator -c caddy -- ls -la /var/run/tailscale/
```

See [Tailscale Configuration](tailscale-configuration.md) for detailed troubleshooting.
