FROM oven/bun:1-slim

# Use the existing bun user (UID 1000) which matches code-server's coder user

WORKDIR /workspace

# Install git for repo operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy scripts
COPY mastra/entrypoint.sh /entrypoint.sh
COPY scripts/restart-wrapper.sh /app/restart-wrapper.sh
RUN chmod +x /entrypoint.sh /app/restart-wrapper.sh

USER bun

EXPOSE 4111

ENTRYPOINT ["/entrypoint.sh"]
# Port configured via MASTRA_PORT env var in entrypoint (default 4111)
