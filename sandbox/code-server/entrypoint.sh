#!/bin/bash
set -e

# Install/update Claude Code extension (always get latest)
code-server --install-extension Anthropic.claude-code --force 2>/dev/null || true

# Start code-server
exec code-server --bind-addr 0.0.0.0:8080 --auth none --log warn /workspace
