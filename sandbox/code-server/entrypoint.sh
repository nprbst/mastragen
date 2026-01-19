#!/bin/bash
set -e

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
