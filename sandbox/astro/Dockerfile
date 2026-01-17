FROM node:20-slim

WORKDIR /workspace

# Install git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4321

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4321"]
