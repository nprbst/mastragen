FROM node:20-slim

WORKDIR /workspace

# Install git and dependencies for bun
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4321

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4321"]
