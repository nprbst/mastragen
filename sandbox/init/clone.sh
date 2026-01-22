#!/bin/sh
set -e

if [ -z "$GITHUB_REPO" ]; then
    echo "Error: GITHUB_REPO environment variable is required"
    exit 1
fi

# Convert short form (owner/repo) to full URL if needed
REPO_URL="$GITHUB_REPO"
if ! echo "$REPO_URL" | grep -q "://"; then
    REPO_URL="https://github.com/${GITHUB_REPO}.git"
fi

# Configure git credentials - prefer user token (GH_TOKEN) over orchestrator token (GITHUB_TOKEN)
EFFECTIVE_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -n "$EFFECTIVE_TOKEN" ]; then
    echo "Configuring git credentials..."
    git config --global credential.helper store
    echo "https://x-access-token:${EFFECTIVE_TOKEN}@github.com" > ~/.git-credentials
fi

# Check if workspace is empty (ignore hidden files)
if [ -z "$(ls -A /workspace 2>/dev/null)" ]; then
    if [ -n "$BRANCH" ]; then
        echo "Cloning $REPO_URL (branch: $BRANCH) into /workspace..."
        git clone -b "$BRANCH" "$REPO_URL" /workspace
    else
        echo "Cloning $REPO_URL into /workspace..."
        git clone "$REPO_URL" /workspace
    fi
    echo "Clone complete!"
else
    echo "Workspace is not empty, skipping clone"
fi

# Install dependencies if package.json exists
cd /workspace
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    bun install
fi

# Install UI sandbox dependencies if path is set and exists
if [ -n "$UI_SANDBOX_PATH" ] && [ -f "/workspace/${UI_SANDBOX_PATH}/package.json" ]; then
    if [ ! -d "/workspace/${UI_SANDBOX_PATH}/node_modules" ]; then
        echo "Installing UI dependencies in ${UI_SANDBOX_PATH}..."
        cd "/workspace/${UI_SANDBOX_PATH}"
        bun install
    fi
fi

# Create marker file to signal init is complete
touch /workspace/.init-complete

echo "Init complete"
