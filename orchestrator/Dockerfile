FROM oven/bun:1-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY orchestrator/package.json orchestrator/bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY orchestrator/src ./src

# Copy built-in commands and skills
COPY claude-commands /app/claude-commands
COPY claude-skills /app/claude-skills

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
