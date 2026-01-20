FROM codercom/code-server:latest

USER root

# Install additional tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI from official apt repository
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Bun as coder user and symlink to /usr/local/bin for global availability
USER coder
RUN curl -fsSL https://bun.sh/install | bash
USER root
RUN ln -s /home/coder/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /home/coder/.bun/bin/bunx /usr/local/bin/bunx
ENV PATH="/home/coder/.bun/bin:${PATH}"

# Copy default settings (dark mode, minimal UI)
COPY --chown=coder:coder settings.json /home/coder/.local/share/code-server/User/settings.json

# Create .claude directory structure for Claude Code configuration injection
RUN mkdir -p /home/coder/.claude/commands \
    && mkdir -p /home/coder/.claude/skills \
    && mkdir -p /home/coder/.claude/projects/-workspace \
    && chown -R coder:coder /home/coder/.claude

# Copy entrypoint script (installs extensions at startup for latest versions)
COPY --chown=coder:coder entrypoint.sh /home/coder/entrypoint.sh
RUN chmod +x /home/coder/entrypoint.sh

WORKDIR /workspace

USER coder

EXPOSE 8080

ENTRYPOINT ["/home/coder/entrypoint.sh"]
