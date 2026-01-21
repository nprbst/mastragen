# Kubernetes + Tailscale Testing Guide

Manual testing guide for exercising the Mastragen Kubernetes deployment with Tailscale networking using local minikube.

## Prerequisites

### Required Tools

| Tool | Version | Installation |
|------|---------|--------------|
| minikube | 1.32+ | `brew install minikube` |
| kubectl | 1.28+ | `brew install kubectl` |
| Helm | 3.14+ | `brew install helm` |
| Tailscale CLI | Latest | `brew install tailscale` |
| Docker | 24+ | Docker Desktop for Mac |
| mgen CLI | Latest | `cd cli && bun install && bun link` |

### mgen CLI Setup

The `mgen` CLI provides convenient commands for interacting with the orchestrator:

```bash
# Install and link the CLI
cd cli
bun install
bun link

# Verify installation
mgen --help

# Configure API URL (optional, defaults to http://localhost:3000)
export MGEN_API_URL=http://localhost:3000
```

### Tailnet Requirements

- Personal Tailnet with admin access
- Ability to generate API keys
- Ability to modify ACL policy

### Environment Variables

Create a `.env.test` file (do not commit):

```bash
# Tailscale
TAILSCALE_TAILNET=your-tailnet.ts.net
TAILSCALE_API_KEY=tskey-api-xxxxx
TAILSCALE_AUTH_KEY=tskey-auth-xxxxx

# GitHub App (from your existing setup)
GITHUB_APP_ID=123456
GITHUB_APP_CLIENT_ID=Iv1.xxxxx
GITHUB_APP_CLIENT_SECRET=xxxxx
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Auth
JWT_SECRET=your-jwt-secret-for-testing
```

---

## 1. Tailnet Preparation

### Generate API Key

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
2. Click **Generate API Key**
3. Set expiration (90 days recommended for testing)
4. Copy the key to `TAILSCALE_API_KEY`

### Create Auth Key

Auth keys allow devices to join your Tailnet programmatically.

1. Go to [Tailscale Admin Console > Keys](https://login.tailscale.com/admin/settings/keys)
2. Click **Generate auth key**
3. Configure:
   - **Reusable**: Yes (for multiple sandbox pods)
   - **Ephemeral**: Yes (devices auto-removed when offline)
   - **Tags**: `tag:mastragen-sandbox`
   - **Expiration**: 90 days
4. Copy the key to `TAILSCALE_AUTH_KEY`

### Configure ACL Policy

Edit your Tailnet's ACL policy at [Tailscale Admin > Access Controls](https://login.tailscale.com/admin/acls).

Add the following to your existing policy:

```json
{
  "tagOwners": {
    "tag:mastragen-sandbox": ["autogroup:admin"],
    "tag:mastragen-session-share": ["autogroup:admin"]
  },
  "acls": [
    // Allow your devices to access all mastragen sandboxes
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:mastragen-sandbox:*"]
    },
    // Allow shared session access (session-specific tags)
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:mastragen-session-share:*"]
    }
  ]
}
```

**Tag Naming Convention**:
- `tag:mastragen-sandbox` - Applied to all sandbox pods
- `tag:session-{sessionId}-share` - Applied when sharing a specific session

---

## 2. Minikube Setup

### Start Minikube

```bash
# Start with sufficient resources for testing
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=20g \
  --driver=docker

# Verify cluster is running
kubectl cluster-info
```

### Enable Required Addons

```bash
# Enable ingress for external access
minikube addons enable ingress

# Enable metrics-server for resource monitoring
minikube addons enable metrics-server

# Verify addons
minikube addons list | grep enabled
```

### Configure Docker Environment

To build images directly into minikube's Docker daemon:

```bash
# Point shell to minikube's Docker
eval $(minikube docker-env)

# Verify you're using minikube's Docker
docker info | grep "Name:"
# Should show: Name: minikube
```

---

## 3. Build Local Images

From the repository root, with minikube's Docker environment active:

### Build Orchestrator

```bash
docker build -t mastragen-orchestrator:local -f orchestrator/Dockerfile .
```

### Build Sandbox Images

```bash
# Mastra service
docker build -t mastragen-mastra:local -f sandbox/mastra/Dockerfile ./sandbox

# Code Server (VS Code)
docker build -t mastragen-code-server:local -f sandbox/code-server/Dockerfile ./sandbox/code-server

# Astro service
docker build -t mastragen-astro:local -f sandbox/astro/Dockerfile ./sandbox

# Init container
docker build -t mastragen-init:local -f sandbox/init/Dockerfile ./sandbox/init
```

### Verify Images

```bash
# List images in minikube
minikube image ls | grep mastragen
```

Expected output:
```
docker.io/library/mastragen-orchestrator:local
docker.io/library/mastragen-mastra:local
docker.io/library/mastragen-code-server:local
docker.io/library/mastragen-astro:local
docker.io/library/mastragen-init:local
```

---

## 4. Kubernetes Secrets Setup

### Create Test Namespace

```bash
kubectl create namespace mastragen-test
kubectl config set-context --current --namespace=mastragen-test
```

### Create Secrets

```bash
# Load environment variables
source .env.test

# Tailscale credentials
kubectl create secret generic mastragen-tailscale \
  --from-literal=auth-key="$TAILSCALE_AUTH_KEY" \
  --from-literal=api-key="$TAILSCALE_API_KEY" \
  --from-literal=tailnet="$TAILSCALE_TAILNET"

# GitHub App credentials
kubectl create secret generic mastragen-github \
  --from-literal=app-id="$GITHUB_APP_ID" \
  --from-literal=client-id="$GITHUB_APP_CLIENT_ID" \
  --from-literal=client-secret="$GITHUB_APP_CLIENT_SECRET" \
  --from-file=private-key="$GITHUB_APP_PRIVATE_KEY_PATH"

# Anthropic API key
kubectl create secret generic mastragen-anthropic \
  --from-literal=api-key="$ANTHROPIC_API_KEY"

# JWT signing secret
kubectl create secret generic mastragen-auth \
  --from-literal=jwt-secret="$JWT_SECRET"
```

### Verify Secrets

```bash
kubectl get secrets
```

Expected output:
```
NAME                  TYPE     DATA   AGE
mastragen-anthropic   Opaque   1      10s
mastragen-auth        Opaque   1      10s
mastragen-github      Opaque   4      10s
mastragen-tailscale   Opaque   3      10s
```

---

## 5. Helm Installation

> **Note**: This section applies once Helm charts are implemented per the Phase 4 plan.

### Verify Chart Structure

```bash
# Lint the chart
helm lint ./helm/mastragen

# Template without installing (dry run)
helm template mastragen ./helm/mastragen \
  -f ./helm/mastragen/values/development.yaml \
  --namespace mastragen-test
```

### Install Chart

```bash
helm install mastragen ./helm/mastragen \
  -f ./helm/mastragen/values/development.yaml \
  --namespace mastragen-test \
  --set image.pullPolicy=Never \
  --set image.orchestrator.tag=local \
  --set image.sandbox.mastra.tag=local \
  --set image.sandbox.codeServer.tag=local \
  --set image.sandbox.astro.tag=local
```

### Verify Deployment

```bash
# Watch pods come up
kubectl get pods -w

# Check orchestrator logs
kubectl logs -l app=mastragen-orchestrator -f
```

Wait for all pods to show `Running` status with `1/1` ready.

---

## 6. Testing Scenarios

### A. Basic Connectivity

#### Verify Orchestrator Health

```bash
# Port-forward to orchestrator
kubectl port-forward svc/mastragen-orchestrator 3000:3000 &

# Check health using mgen CLI
mgen health

# Or with JSON output
mgen health --json
```

Expected output:
```
✓ Orchestrator healthy (db: connected, docker: connected)
```

#### Verify Tailscale Device Registration

```bash
# List devices using mgen CLI
mgen tailscale devices

# Or filter for mastragen devices
mgen tailscale devices --filter mastragen

# Or with JSON output
mgen tailscale devices --json
```

Look for devices with `mastragen` in the name.

#### Access via Tailscale IP

Once the orchestrator pod registers with Tailscale:

```bash
# Get Tailscale IP from device list
ORCHESTRATOR_TS_IP=$(tailscale status --json | jq -r '.Peer[] | select(.HostName | contains("orchestrator")) | .TailscaleIPs[0]')

# Access directly via Tailscale
curl http://$ORCHESTRATOR_TS_IP:3000/health
```

---

### B. Session Lifecycle

#### Create a Session

```bash
# Create session interactively (will prompt for project, name, environment)
mgen session create

# Or with all options specified
mgen session create -p my-project -n test-feature -e dev

# With JSON output to capture session ID
SESSION_ID=$(mgen session create -p my-project -n test-feature -e dev --json | jq -r '.id')
echo "Created session: $SESSION_ID"
```

#### Verify Sandbox Pod Creation

```bash
# Watch for new sandbox pod
kubectl get pods -w -l session-id

# Check sandbox pod logs
kubectl logs -l session-id=$SESSION_ID -c tailscale-sidecar
```

#### Verify Tailscale Sidecar Connection

```bash
# Check device using mgen CLI
mgen tailscale device session-$SESSION_ID

# Or list all and filter
mgen tailscale devices --filter $SESSION_ID
```

#### Access Sandbox Services

Once connected, access sandbox services via Tailscale:

```bash
# Get sandbox Tailscale IP
SANDBOX_TS_IP=$(tailscale status --json | jq -r '.Peer[] | select(.HostName | contains("'$SESSION_ID'")) | .TailscaleIPs[0]')

# Access Mastra service
curl http://$SANDBOX_TS_IP:4111/health

# Access Code Server
open http://$SANDBOX_TS_IP:8080

# Access Astro dev server
open http://$SANDBOX_TS_IP:4321
```

---

### C. Session Sharing

#### Share Session with Another User

```bash
# Share using mgen CLI
mgen session share $SESSION_ID colleague@example.com

# With JSON output
mgen session share $SESSION_ID colleague@example.com --json
```

#### List Current Shares

```bash
# List all shares for the session
mgen session shares $SESSION_ID
```

#### Verify ACL Tag Applied

```bash
# Check device tags using mgen CLI
mgen tailscale device session-$SESSION_ID --json | jq '.tags'
```

Expected: `["tag:mastragen-sandbox", "tag:session-{sessionId}-share"]`

#### Test Access from Shared User

On the shared user's device (must be on same Tailnet):

```bash
# Get sandbox Tailscale IP
SANDBOX_TS_IP=$(mgen tailscale device session-$SESSION_ID --json | jq -r '.addresses[0]')

# They should now be able to access the sandbox
curl http://$SANDBOX_TS_IP:4111/health
```

#### Revoke Access

```bash
# Revoke using mgen CLI (by email)
mgen session unshare $SESSION_ID colleague@example.com
```

#### Verify Tag Removed

```bash
# Check tags again - share tag should be gone
mgen tailscale device session-$SESSION_ID --json | jq '.tags'
```

---

### D. Idle Auto-Suspend

#### Create Session and Wait

```bash
# Create session
SESSION_ID=$(mgen session create -p my-project -n idle-test -e dev --json | jq -r '.id')
echo "Created session: $SESSION_ID"

# Check idle status
mgen session idle-status $SESSION_ID
```

#### Monitor for Warning

Wait until 5 minutes before configured timeout (default 30 minutes):

```bash
# Poll idle status every 30 seconds
watch -n 30 "mgen session idle-status $SESSION_ID"

# Or with JSON for scripting
watch -n 30 "mgen session idle-status $SESSION_ID --json | jq"
```

Expected output when warning issued:
```
Session: abc123
State: active
Idle for: 25 minutes
Timeout: 30 minutes
Warning at: 25 minutes idle
Warning issued: Yes
Suspend at: 2026-01-21T12:30:00Z
```

#### Verify Auto-Suspension

After timeout, session should be suspended:

```bash
# Check session state
mgen session get $SESSION_ID

# Or with JSON to extract specific fields
mgen session get $SESSION_ID --json | jq '{state, suspensionReason}'
```

Expected:
```json
{
  "state": "suspended",
  "suspensionReason": "auto"
}
```

---

### E. Metrics and Monitoring

#### Query Metrics Endpoint

```bash
# Get all Prometheus metrics
mgen metrics

# Or with JSON parsing
mgen metrics --json
```

Expected format (Prometheus text exposition):

```
# HELP mastragen_sessions_total Current number of sessions
# TYPE mastragen_sessions_total gauge
mastragen_sessions_total{project="test-project",state="active"} 1
mastragen_sessions_total{project="test-project",state="suspended"} 2

# HELP mastragen_session_creations_total Total sessions created
# TYPE mastragen_session_creations_total counter
mastragen_session_creations_total{project="test-project"} 15

# HELP mastragen_api_request_duration_seconds Request latency
# TYPE mastragen_api_request_duration_seconds histogram
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",le="0.1"} 45
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",le="0.5"} 50
```

#### Verify Session Metrics

```bash
# Filter for session metrics
mgen metrics --filter mastragen_sessions
```

#### Verify Tailscale Status

```bash
# Check Tailscale configuration status
mgen tailscale status

# Or with JSON output
mgen tailscale status --json
```

Expected output:
```
✓ Tailscale configured
  Tailnet: your-tailnet.ts.net
  API Key: set
```

---

## 7. Troubleshooting

### Common Issues

#### Pod Stuck in Pending

```bash
# Check events
kubectl describe pod <pod-name>

# Common causes:
# - Insufficient resources: increase minikube memory/cpu
# - Image pull errors: verify imagePullPolicy=Never and images loaded
```

#### Tailscale Sidecar Not Connecting

```bash
# Check sidecar logs
kubectl logs <pod-name> -c tailscale-sidecar

# Common causes:
# - Invalid auth key: regenerate and update secret
# - ACL blocking: check policy allows tag:mastragen-sandbox
# - Network issues: check minikube networking
```

#### Session Create Fails

```bash
# Check orchestrator logs
kubectl logs -l app=mastragen-orchestrator | grep -i error

# Check if Docker socket is accessible
kubectl exec -it <orchestrator-pod> -- ls -la /var/run/docker.sock
```

### Log Collection

```bash
# All orchestrator logs
kubectl logs -l app=mastragen-orchestrator --all-containers

# Specific session's sandbox logs
kubectl logs -l session-id=$SESSION_ID --all-containers

# Events in namespace
kubectl get events --sort-by=.metadata.creationTimestamp
```

### Tailscale Debugging

```bash
# Check Tailscale status on your machine
tailscale status --json | jq

# Force refresh device list
tailscale status --peers

# Debug connectivity
tailscale ping <device-name>

# Check ACL evaluation
curl -s -H "Authorization: Bearer $TAILSCALE_API_KEY" \
  "https://api.tailscale.com/api/v2/tailnet/$TAILSCALE_TAILNET/acl/preview" \
  -d '{"src": "user@example.com", "dst": "tag:mastragen-sandbox:*"}'
```

---

## 8. Cleanup

### Delete Helm Release

```bash
helm uninstall mastragen --namespace mastragen-test
```

### Remove Orphaned Tailscale Devices

```bash
# List mastragen devices
DEVICES=$(curl -s -H "Authorization: Bearer $TAILSCALE_API_KEY" \
  "https://api.tailscale.com/api/v2/tailnet/$TAILSCALE_TAILNET/devices" | \
  jq -r '.devices[] | select(.hostname | contains("mastragen")) | .id')

# Delete each device
for DEVICE_ID in $DEVICES; do
  curl -X DELETE -H "Authorization: Bearer $TAILSCALE_API_KEY" \
    "https://api.tailscale.com/api/v2/device/$DEVICE_ID"
done
```

### Delete Kubernetes Resources

```bash
# Delete namespace (removes all resources)
kubectl delete namespace mastragen-test

# Reset context
kubectl config set-context --current --namespace=default
```

### Stop Minikube

```bash
# Stop cluster (preserves state)
minikube stop

# Or delete entirely
minikube delete
```

### Reset Docker Environment

```bash
# Point back to local Docker
eval $(minikube docker-env -u)
```

---

## Success Criteria Checklist

Per the Phase 4 specification:

| Criterion | Test | Status |
|-----------|------|--------|
| SC-001: Share completes < 10s | Time the share API call | [ ] |
| SC-002: Revoke completes < 5s | Time the revoke API call | [ ] |
| SC-003: Auto-suspend within 2min of timeout | Monitor idle session | [ ] |
| SC-004: Warning 4+ min before suspend | Check warningIssued flag | [ ] |
| SC-005: Metrics responds < 500ms | Time `/metrics` endpoint | [ ] |
| SC-013: Minikube integration passes | Complete sections A-E | [ ] |

---

## Related Documentation

- [Phase 4 Specification](../specs/004-production-readiness/spec.md)
- [Implementation Plan](../specs/004-production-readiness/plan.md)
- [Tailscale Service](../orchestrator/src/services/tailscale.ts)
- [Docker Compose Setup](../docker-compose.yml)
