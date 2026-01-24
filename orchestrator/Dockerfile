FROM oven/bun:1-slim AS web-builder

WORKDIR /web

# Copy web package files
COPY web/package.json web/bun.lock* ./

# Install web dependencies
RUN bun install --frozen-lockfile

# Copy web source and build
COPY web/ ./
RUN bun run build

# ---

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

# Copy built web dist from builder stage
COPY --from=web-builder /web/dist /app/web-dist

# Copy built-in commands and skills
COPY claude-commands /app/claude-commands
COPY claude-skills /app/claude-skills

# Create data directory
RUN mkdir -p /app/data

# Point to the web dist in the container
ENV WEB_DIST_PATH=/app/web-dist

EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]
