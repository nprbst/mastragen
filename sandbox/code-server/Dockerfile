FROM codercom/code-server:latest

USER root

# Install additional tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun as coder user and symlink to /usr/local/bin for global availability
USER coder
RUN curl -fsSL https://bun.sh/install | bash
USER root
RUN ln -s /home/coder/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /home/coder/.bun/bin/bunx /usr/local/bin/bunx
ENV PATH="/home/coder/.bun/bin:${PATH}"

WORKDIR /workspace

EXPOSE 8080

CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", "/workspace"]
