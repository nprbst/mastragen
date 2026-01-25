#!/bin/bash
set -e

# Configure git credentials using user's GitHub token
if [ -n "$GH_TOKEN" ]; then
    git config --global credential.helper store
    echo "https://x-access-token:${GH_TOKEN}@github.com" > ~/.git-credentials
fi

# Mark /workspace as safe for git (handles ownership mismatch from init container)
git config --global --add safe.directory /workspace

# Configure git user identity - use provided values or fall back to placeholders
if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
elif [ -z "$(git config --global user.email)" ]; then
    git config --global user.email "mastragen@local"
fi

if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
elif [ -z "$(git config --global user.name)" ]; then
    git config --global user.name "Mastragen"
fi

# Ensure .claude directory structure exists
mkdir -p /home/coder/.claude/commands
mkdir -p /home/coder/.claude/skills
mkdir -p /home/coder/.claude/projects/-workspace

# Initialize Claude config from ConfigMap tar archive (K8s mode)
# In Docker mode, the orchestrator injects these files via exec after container starts
if [ -f /home/coder/.claude-init/claude-config.tar.gz ]; then
    echo "Extracting Claude config from ConfigMap..."
    cd /home/coder
    tar -xzf /home/coder/.claude-init/claude-config.tar.gz
    echo "Claude config extracted successfully"
fi

# Source session environment variables if present (injected by orchestrator)
if [ -f /home/coder/.claude/env.sh ]; then
    source /home/coder/.claude/env.sh
fi

# Ensure session env vars are available in all new shell sessions (e.g. VS Code terminals)
if [ -f /home/coder/.claude/env.sh ]; then
    if ! grep -q "source /home/coder/.claude/env.sh" ~/.bashrc 2>/dev/null; then
        echo "" >> ~/.bashrc
        echo "# Session environment variables (injected by mastragen)" >> ~/.bashrc
        echo "source /home/coder/.claude/env.sh" >> ~/.bashrc
    fi
fi

# Add restart functions to bashrc for sandbox container management
cat >> /home/coder/.bashrc << 'EOF'

# Sandbox container restart functions
# Touch a file in /workspace to signal the restart-wrapper to restart the process
restart-astro() {
    touch /workspace/.restart-astro
    echo "Restart signal sent to astro container"
}

restart-mastra() {
    touch /workspace/.restart-mastra
    echo "Restart signal sent to mastra container"
}
EOF

# Install/update extensions (always get latest)
code-server --install-extension oven.bun-vscode --force 2>/dev/null || true
code-server --install-extension astro-build.astro-vscode --force 2>/dev/null || true
code-server --install-extension synedra.auto-run-command --force 2>/dev/null || true

# Claude Code Extension Installation
#
# Background: v2.1.x has SIGTRAP crashes (see GitHub issues #18945, #19068, #16135)
# We need to use a stable v2.0.x version until v2.1.x is fixed.
# Auto-updates are disabled in settings.json to prevent upgrading to v2.1.x.
#
# Option 1: Version pinning from Microsoft marketplace (PREFERRED when stable versions exist)
# However, specific v2.0.x versions (like 2.0.76) don't exist in the marketplace's version API.
# When they become available, use this approach:
#
# CLAUDE_VERSION="2.0.76"  # Replace with last known stable v2.0.x version
# CLAUDE_VSIX="/tmp/claude-code.vsix"
# echo "Downloading Claude Code extension v${CLAUDE_VERSION}..."
# if curl -fSL "https://anthropic.gallery.vsassets.io/_apis/public/gallery/publisher/anthropic/extension/claude-code/${CLAUDE_VERSION}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage" -o "$CLAUDE_VSIX"; then
#   echo "Downloaded successfully, installing..."
#   code-server --install-extension "$CLAUDE_VSIX" --force
#   echo "Claude Code extension v${CLAUDE_VERSION} installed"
# else
#   echo "WARNING: Failed to download Claude Code v${CLAUDE_VERSION}, trying OpenVSIX fallback..."
#   code-server --install-extension Anthropic.claude-code --force
# fi
# rm -f "$CLAUDE_VSIX"
#
# Option 2: OpenVSIX registry (CURRENT APPROACH)
# OpenVSIX has stable v2.0.x versions that work without SIGTRAP crashes.
# This is simpler and avoids version availability issues with Microsoft marketplace.
echo "Installing Claude Code extension from OpenVSIX..."
code-server --install-extension Anthropic.claude-code --force

# Generate tasks.json with Astro preview URL (enables auto-open on folder open)
mkdir -p /workspace/.vscode
cat > /workspace/.vscode/tasks.json << EOF
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Open Astro Preview",
      "command": "\${input:openAstroPreview}",
      "problemMatcher": [],
      "runOptions": {
        "runOn": "folderOpen"
      }
    }
  ],
  "inputs": [
    {
      "id": "openAstroPreview",
      "type": "command",
      "command": "simpleBrowser.show",
      "args": ["${ASTRO_PREVIEW_URL:-http://localhost:4321}"]
    }
  ]
}
EOF

# Start code-server (port configurable for K8s mode where Caddy proxies)
exec code-server --bind-addr "0.0.0.0:${CODE_SERVER_PORT:-8080}" --auth none --log warn /workspace
