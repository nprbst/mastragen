FROM codercom/code-server:latest

USER root

# Install additional tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun and symlink to /usr/local/bin for global availability
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /root/.bun/bin/bunx /usr/local/bin/bunx
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /workspace

EXPOSE 8080

ENTRYPOINT []
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", "/workspace"]
