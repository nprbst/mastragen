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
echo "Init complete, starting astro..."

# Navigate to UI sandbox path if set, otherwise use default
UI_PATH="${UI_SANDBOX_PATH:-packages/ui}"
cd "/workspace/${UI_PATH}"

# Set Mastra API URL for container networking (default to Docker service name)
export MASTRA_API_URL="${MASTRA_API_URL:-http://mastra:4111}"

# Port configurable for K8s mode where Caddy proxies external port to internal
ASTRO_PORT="${ASTRO_PORT:-4321}"

# Execute the dev server with restart wrapper
# Use bunx astro directly to avoid inheriting hardcoded args from package.json dev script
exec /app/restart-wrapper.sh astro bunx astro dev --host 0.0.0.0 --port "$ASTRO_PORT"
