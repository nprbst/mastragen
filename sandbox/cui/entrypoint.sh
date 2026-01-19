#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git credentials from GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials

    # Configure git user if not set
    if [ -z "$(git config --global user.email)" ]; then
        git config --global user.email "mastragen@local"
        git config --global user.name "Mastragen"
    fi
fi

# Ensure .claude directory structure exists for cui-server directory detection
mkdir -p /home/bun/.claude/projects/-workspace

# Copy welcome session if not already present (preserves existing sessions on restart)
if [ ! -f /home/bun/.claude/projects/-workspace/00000000-0000-0000-0000-000000000001.jsonl ]; then
    cp /welcome-session.jsonl /home/bun/.claude/projects/-workspace/00000000-0000-0000-0000-000000000001.jsonl 2>/dev/null || true
fi

# Execute the main command
exec "$@"
