FROM oven/bun:1-slim

# Use the existing bun user (UID 1000) which matches code-server's coder user

WORKDIR /workspace

# Install git for repo operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER bun

EXPOSE 4111

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "mastra", "dev"]
