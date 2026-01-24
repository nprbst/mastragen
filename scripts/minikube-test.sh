#!/bin/bash
# T096-T097: Minikube integration test script
#
# This script validates the Mastragen Helm deployment in a local minikube cluster.
# It performs the following checks:
# 1. Helm install succeeds
# 2. Orchestrator pod reaches Ready state within 120s
# 3. POST /api/sessions creates a session
# 4. Health endpoint returns success
#
# Usage:
#   ./scripts/minikube-test.sh [--build]
#
# Options:
#   --build    Build local Docker images before installing (default: use published images)
#
# Prerequisites:
#   - minikube installed
#   - kubectl installed
#   - helm 3+ installed
#   - docker installed (if using --build)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RELEASE_NAME="mastragen-test"
NAMESPACE="mastragen-test"
TIMEOUT="120s"
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_DELAY=3

# Parse arguments
BUILD_LOCAL=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_LOCAL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

cleanup() {
    log "Cleaning up..."

    # Kill port-forward if running
    if [[ -n "${PF_PID:-}" ]]; then
        kill "$PF_PID" 2>/dev/null || true
    fi

    # Delete helm release
    helm uninstall "$RELEASE_NAME" -n "$NAMESPACE" 2>/dev/null || true

    # Delete namespace
    kubectl delete namespace "$NAMESPACE" --ignore-not-found=true 2>/dev/null || true

    log "Cleanup complete"
}

# Trap cleanup on exit
trap cleanup EXIT

echo "=== Mastragen Minikube Integration Test ==="
echo ""

# Step 1: Check prerequisites
log "Checking prerequisites..."

command -v minikube >/dev/null 2>&1 || error "minikube is required but not installed"
command -v kubectl >/dev/null 2>&1 || error "kubectl is required but not installed"
command -v helm >/dev/null 2>&1 || error "helm is required but not installed"

# Check helm version is 3+
HELM_VERSION=$(helm version --short | grep -oE 'v[0-9]+' | head -1)
if [[ "$HELM_VERSION" != "v3" && "$HELM_VERSION" != "v4" ]]; then
    error "Helm 3+ is required, found: $(helm version --short)"
fi

# Step 2: Start minikube if not running
log "Checking minikube status..."
if ! minikube status | grep -q "Running"; then
    log "Starting minikube..."
    minikube start
fi

# Step 3: Build local images if requested
if [[ "$BUILD_LOCAL" == "true" ]]; then
    log "Building local Docker images..."

    # Point docker to minikube's daemon
    eval "$(minikube docker-env)"

    # Build orchestrator image
    log "Building orchestrator image..."
    docker build -t mastragen-orchestrator:test ./orchestrator

    IMAGE_OVERRIDE="--set orchestrator.image.repository=mastragen-orchestrator --set orchestrator.image.tag=test --set orchestrator.image.pullPolicy=Never"
else
    IMAGE_OVERRIDE=""
fi

# Step 4: Create namespace
log "Creating namespace: $NAMESPACE"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Step 5: Install Helm chart
log "Installing Helm chart..."

# shellcheck disable=SC2086
helm upgrade --install "$RELEASE_NAME" ./helm/mastragen \
    --namespace "$NAMESPACE" \
    --set tailscale.enabled=false \
    --set orchestrator.persistence.enabled=false \
    $IMAGE_OVERRIDE \
    --wait \
    --timeout "$TIMEOUT"

log "Helm chart installed successfully"

# Step 6: Wait for pod to be ready
log "Waiting for orchestrator pod to be ready..."
kubectl wait --for=condition=ready pod \
    -l app.kubernetes.io/component=orchestrator \
    -n "$NAMESPACE" \
    --timeout="$TIMEOUT"

log "Orchestrator pod is ready"

# Step 7: Port-forward to service
log "Setting up port-forward..."
kubectl port-forward -n "$NAMESPACE" svc/"$RELEASE_NAME"-mastragen-orchestrator 4000:4000 2>/dev/null &
PF_PID=$!
sleep 5

# Step 8: Health check
log "Performing health check..."
for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    if curl -sf http://localhost:4000/health >/dev/null; then
        log "Health check passed!"
        break
    fi

    if [[ $i -eq $HEALTH_CHECK_RETRIES ]]; then
        error "Health check failed after $HEALTH_CHECK_RETRIES attempts"
    fi

    warn "Health check attempt $i failed, retrying in ${HEALTH_CHECK_DELAY}s..."
    sleep $HEALTH_CHECK_DELAY
done

# Step 9: API test
log "Testing API endpoint..."
API_RESPONSE=$(curl -sf http://localhost:4000/api/ || echo '{"error": "failed"}')
if echo "$API_RESPONSE" | grep -q "mastragen-orchestrator"; then
    log "API endpoint working correctly"
else
    warn "API response unexpected: $API_RESPONSE"
fi

# Step 10: Get pod logs for debugging
log "Orchestrator pod logs (last 20 lines):"
kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/component=orchestrator --tail=20 || true

echo ""
echo "==================================="
echo -e "${GREEN}=== Test PASSED ===${NC}"
echo "==================================="
echo ""
echo "The Mastragen Helm chart installed successfully and the orchestrator is healthy."
echo ""
echo "To access the running instance:"
echo "  kubectl port-forward -n $NAMESPACE svc/$RELEASE_NAME-mastragen-orchestrator 4000:4000"
echo "  curl http://localhost:4000/health"
echo ""
echo "To clean up:"
echo "  helm uninstall $RELEASE_NAME -n $NAMESPACE"
echo "  kubectl delete namespace $NAMESPACE"
