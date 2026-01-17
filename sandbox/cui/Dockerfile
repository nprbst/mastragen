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

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "cui-server", "--port", "3001", "--host", "0.0.0.0"]
