FROM oven/bun:1-slim

WORKDIR /workspace

# Install git for credential configuration
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install cui-server globally
RUN bun install -g @anthropic-ai/claude-code

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["cui-server", "--port", "3001", "--host", "0.0.0.0"]
