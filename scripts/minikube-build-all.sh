#!/bin/bash
# Build all local development images directly in minikube
# Usage: ./scripts/minikube-build-all.sh [--orchestrator-only] [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check minikube is running
if ! minikube status &>/dev/null; then
    log_error "Minikube is not running. Start it with: minikube start"
    exit 1
fi

ORCHESTRATOR_ONLY=false
if [[ "$1" == "--orchestrator-only" ]]; then
    ORCHESTRATOR_ONLY=true
fi

NO_CACHE=""
if [[ "$1" == "--no-cache" ]] || [[ "$2" == "--no-cache" ]]; then
    NO_CACHE="--build-opt no-cache=true"
fi

if [[ "$ORCHESTRATOR_ONLY" == "true" ]]; then
    log_info "Building orchestrator image only..."
    minikube image build $NO_CACHE -t mastragen-orchestrator:local -f orchestrator/Dockerfile .
    log_info "Done! Orchestrator image built."
    exit 0
fi

log_info "Building all sandbox images in minikube..."

# Orchestrator (uses repo root as context)
log_info "Building mastragen-orchestrator..."
minikube image build $NO_CACHE -t mastragen-orchestrator:local -f orchestrator/Dockerfile .

# Caddy (uses docker/caddy as context)
log_info "Building mastragen-caddy..."
minikube image build $NO_CACHE -t mastragen-caddy:local docker/caddy

# Init (uses sandbox/init as context)
log_info "Building mastragen-init..."
minikube image build $NO_CACHE -t mastragen/mastragen-init:local sandbox/init

# VS Code (uses sandbox/code-server as context)
log_info "Building mastragen-vscode..."
minikube image build $NO_CACHE -t mastragen/mastragen-vscode:local sandbox/code-server

# Mastra (uses sandbox as context with -f)
log_info "Building mastragen-mastra..."
minikube image build $NO_CACHE -t mastragen/mastragen-mastra:local -f sandbox/mastra/Dockerfile sandbox

# Astro (uses sandbox as context with -f)
log_info "Building mastragen-astro..."
minikube image build $NO_CACHE -t mastragen/mastragen-astro:local -f sandbox/astro/Dockerfile sandbox

log_info "All images built successfully!"
log_info "You can now deploy with: bun run helm:upgrade:dev"
