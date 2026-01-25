#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
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
