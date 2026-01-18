FROM oven/bun:1-slim

WORKDIR /workspace

# Install git for repo operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4111

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "mastra", "dev"]
