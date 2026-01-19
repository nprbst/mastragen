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
# Use a lock file to prevent concurrent installs from multiple containers
LOCKFILE="/workspace/.bun-install.lock"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    # Try to acquire lock, wait if another container is installing
    exec 200>"$LOCKFILE"
    flock -w 300 200 || { echo "Could not acquire lock, proceeding anyway..."; }
    # Check again after acquiring lock (another container may have finished)
    if [ ! -d "node_modules" ]; then
        bun install
    fi
    flock -u 200
fi

# Execute the main command
exec "$@"
