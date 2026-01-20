#!/bin/bash
set -e

# Configure git credentials from GITHUB_TOKEN if provided
if [ -n "$GITHUB_TOKEN" ]; then
    git config --global credential.helper store
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials

    if [ -z "$(git config --global user.email)" ]; then
        git config --global user.email "mastragen@local"
        git config --global user.name "Mastragen"
    fi
fi

# Ensure .claude directory structure exists
mkdir -p /home/coder/.claude/commands
mkdir -p /home/coder/.claude/projects/-workspace

# Source session environment variables if present (injected by orchestrator)
if [ -f /home/coder/.claude/env.sh ]; then
    source /home/coder/.claude/env.sh
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
code-server --install-extension Anthropic.claude-code --force 2>/dev/null || true
code-server --install-extension synedra.auto-run-command --force 2>/dev/null || true

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

# Start code-server
exec code-server --bind-addr 0.0.0.0:8080 --auth none --log warn /workspace
