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

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
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

echo "Init complete"
