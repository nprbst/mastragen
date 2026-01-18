FROM oven/bun:1-slim

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
RUN mkdir -p /root/.claude/projects/-workspace

# Copy welcome session file (to root for entrypoint to copy from, and to .claude for image default)
COPY welcome-session.jsonl /welcome-session.jsonl
COPY welcome-session.jsonl /root/.claude/projects/-workspace/00000000-0000-0000-0000-000000000001.jsonl

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "npx cui-server --port 3001 --host 0.0.0.0 --token ${CUI_AUTH_TOKEN}"]
