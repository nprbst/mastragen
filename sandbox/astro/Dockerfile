FROM node:20-slim

# Use the existing node user (UID 1000) which matches code-server's coder user

WORKDIR /workspace

# Install git and dependencies for bun
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install bun as node user and symlink to /usr/local/bin
USER node
RUN curl -fsSL https://bun.sh/install | bash
USER root
RUN ln -s /home/node/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /home/node/.bun/bin/bunx /usr/local/bin/bunx
ENV PATH="/home/node/.bun/bin:${PATH}"

# Copy scripts
COPY astro/entrypoint.sh /entrypoint.sh
COPY scripts/restart-wrapper.sh /app/restart-wrapper.sh
RUN chmod +x /entrypoint.sh /app/restart-wrapper.sh

USER node

EXPOSE 4321

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4321"]
