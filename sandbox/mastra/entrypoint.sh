#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
fi

# Wait for workspace to have a package.json (repo needs to be cloned first)
echo "Waiting for project in /workspace..."
while [ ! -f "/workspace/package.json" ]; do
    sleep 5
done
echo "Found package.json, continuing..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

# Execute the main command
exec "$@"
