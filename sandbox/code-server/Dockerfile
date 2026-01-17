FROM codercom/code-server:latest

USER root

# Install additional tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Copy lazy-start script
COPY lazy-start.sh /lazy-start.sh
RUN chmod +x /lazy-start.sh

USER coder

WORKDIR /workspace

EXPOSE 8080

ENTRYPOINT ["/lazy-start.sh"]
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", "/workspace"]
