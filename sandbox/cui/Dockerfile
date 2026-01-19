FROM oven/bun:1-slim

# Use the existing bun user (UID 1000) which matches code-server's coder user

WORKDIR /workspace

# Install git and npm for credential configuration and npx
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create .claude directory structure for cui-server directory detection
RUN mkdir -p /home/bun/.claude/projects/-workspace \
    && chown -R bun:bun /home/bun/.claude

# Copy welcome session file (to root for entrypoint to copy from, and to .claude for image default)
COPY welcome-session.jsonl /welcome-session.jsonl
COPY --chown=bun:bun welcome-session.jsonl /home/bun/.claude/projects/-workspace/00000000-0000-0000-0000-000000000001.jsonl

USER bun

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "npx cui-server --port 3001 --host 0.0.0.0 --token ${CUI_AUTH_TOKEN}"]
