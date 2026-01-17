#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
fi

# Install dependencies if package.json exists and node_modules doesn't
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Execute the main command
exec "$@"
