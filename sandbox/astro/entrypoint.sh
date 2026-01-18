#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
fi

# Navigate to UI sandbox path if set, otherwise use default
UI_PATH="${UI_SANDBOX_PATH:-packages/ui}"
cd "/workspace/${UI_PATH}"

# Install dependencies if package.json exists and node_modules doesn't
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

# Set Mastra API URL for container networking (default to Docker service name)
export MASTRA_API_URL="${MASTRA_API_URL:-http://mastra:4111}"

# Execute the main command
exec "$@"
