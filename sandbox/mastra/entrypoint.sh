#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
fi

# Configure Phoenix/OTEL telemetry when enabled
if [ "$PHOENIX_ENABLED" = "true" ]; then
    echo "Phoenix observability enabled, configuring OTEL exporter..."
    export OTEL_EXPORTER_OTLP_ENDPOINT="${PHOENIX_ENDPOINT:-http://phoenix:6006/v1/traces}"
    export OTEL_SERVICE_NAME="${PHOENIX_PROJECT_NAME:-mastragen-experiments}"
    export OTEL_TRACES_EXPORTER="otlp"
fi

# Wait for init container to complete (creates marker file when done)
echo "Waiting for init to complete..."
while [ ! -f "/workspace/.init-complete" ]; do
    sleep 2
done
echo "Init complete, starting mastra..."

# Port configurable for K8s mode where Caddy proxies external port to internal
# Mastra reads PORT env var for its HTTP server
export PORT="${MASTRA_PORT:-4111}"

# Execute the dev server with restart wrapper
exec /app/restart-wrapper.sh mastra bun run mastra dev
