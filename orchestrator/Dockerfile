FROM oven/bun:1-slim AS web-builder

WORKDIR /app

# Copy workspace root and all workspace package.json files
COPY package.json bun.lock ./
COPY web/package.json ./web/
COPY orchestrator/package.json ./orchestrator/
COPY cli/package.json ./cli/
COPY experiments/package.json ./experiments/

# Install web dependencies
RUN bun install --frozen-lockfile --filter './web'

# Copy web source and build
COPY web/ ./web/
RUN cd web && bun run build

# ---

FROM oven/bun:1-slim

WORKDIR /app

# Install curl for healthcheck and build tools for native dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace root and all workspace package.json files
COPY package.json bun.lock ./
COPY web/package.json ./web/
COPY orchestrator/package.json ./orchestrator/
COPY cli/package.json ./cli/
COPY experiments/package.json ./experiments/

# Install dependencies
RUN bun install --frozen-lockfile --filter './orchestrator' --production

# Copy source code
COPY orchestrator/src ./src

# Copy built web dist from builder stage
COPY --from=web-builder /app/web/dist /app/web-dist

# Copy built-in commands and skills
COPY claude-commands /app/claude-commands
COPY claude-skills /app/claude-skills

# Create data directory
RUN mkdir -p /app/data

# Point to the web dist in the container
ENV WEB_DIST_PATH=/app/web-dist

EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]
