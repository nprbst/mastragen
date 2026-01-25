# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mastragen - AI-powered development platform with compounding knowledge

## Build & Development Commands

**IMPORTANT: This is a Bun project. Use `bun` instead of `npm` for all commands.**

### Installing Dependencies
- `bun install` - Install all workspace dependencies (run from repo root)

### Web (Astro + React)
- `cd web && bun run dev` - Start development server
- `cd web && bun run build` - Build for production

### Orchestrator (Hono + SQLite)
- `cd orchestrator && bun run dev` - Start development server
- `cd orchestrator && bun run build` - Build for production

### Full stack development
- `docker-compose up` - Start all services (orchestrator, web, sandbox containers)

### Preflight Checks
- `bun run preflight` - Full preflight (typecheck + tests for orchestrator and web)
- `bun run preflight:quick` - Quick preflight (typecheck only, faster)
- Always run `bun run preflight:quick` before pushing to catch TypeScript errors early
- A git pre-push hook is installed via `bun install` that runs preflight:quick automatically

### Kubernetes / Minikube Deployment

**Building Images:**
- `bun run minikube:build` - Build all container images (orchestrator, caddy, sandbox images)
- `bun run minikube:build:orchestrator` - Build orchestrator image only (faster for quick iterations)
- `bun run minikube:build:caddy` - Build Caddy image only

**Deploying to Minikube:**
- `bun run minikube:deploy` - Full deploy: build all images + helm upgrade + restart orchestrator
- `bun run minikube:deploy:quick` - Quick deploy: build orchestrator only + helm upgrade + restart
- `bun run helm:upgrade:dev` - Upgrade helm release without rebuilding images

**Viewing Logs:**
- `bun run k8s:logs` - Follow logs from all containers in orchestrator pod
- `bun run k8s:logs:orchestrator` - Follow orchestrator container logs only
- `bun run k8s:logs:tailscale` - Follow tailscale container logs only
- `bun run k9s:dev` - Launch k9s terminal UI for mastragen-dev namespace

**Checking Status:**
- `bun run k8s:status` - Show pods, services, and PVCs in dev namespace
- `bun run k8s:port-forward` - Forward localhost:4000 to orchestrator service

**Helm Operations:**
- `bun run helm:template:dev` - Preview rendered Kubernetes manifests
- `bun run helm:lint` - Validate Helm chart syntax
- `bun run helm:install:dev` - Install fresh helm release (use upgrade instead for updates)
- `bun run helm:uninstall:dev` - Uninstall helm release and cleanup resources

**Secrets Management:**
Secrets should be created manually before deploying:
```bash
# Anthropic API key (for Mastra SDK)
kubectl create secret generic mastragen-anthropic \
  --from-literal=api-key="$ANTHROPIC_API_KEY" \
  -n mastragen-dev

# Tailscale auth key
kubectl create secret generic mastragen-tailscale \
  --from-literal=auth-key="$TAILSCALE_AUTH_KEY" \
  --from-literal=api-key="$TAILSCALE_API_KEY" \
  --from-literal=tailnet="your-tailnet" \
  -n mastragen-dev
```

**IMPORTANT:** Always use `bun run` scripts instead of raw kubectl/helm commands for consistency.

## Architecture

- **web/** - Astro SSR frontend with React islands (port 4321)
- **orchestrator/** - Hono API backend with SQLite database (port 4000)
- **sandbox/** - Docker containers for development environments (VS Code, Mastra, Astro)

## Key Conventions

- Use Bun as the package manager and runtime (NOT npm/yarn/pnpm)
- Tailwind CSS with `darkMode: 'class'` for theming
- Valibot for schema validation
- SQLite with Kysely for database operations
