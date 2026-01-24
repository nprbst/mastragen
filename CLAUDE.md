# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mastragen - AI-powered development platform with compounding knowledge

## Build & Development Commands

**IMPORTANT: This is a Bun project. Use `bun` instead of `npm` for all commands.**

### Web (Astro + React)
- `cd web && bun install` - Install dependencies
- `cd web && bun run dev` - Start development server
- `cd web && bun run build` - Build for production

### Orchestrator (Hono + SQLite)
- `cd orchestrator && bun install` - Install dependencies
- `cd orchestrator && bun run dev` - Start development server
- `cd orchestrator && bun run build` - Build for production

### Full stack development
- `docker-compose up` - Start all services (orchestrator, web, sandbox containers)

### Preflight Checks
- `bun run preflight` - Full preflight (typecheck + tests for orchestrator and web)
- `bun run preflight:quick` - Quick preflight (typecheck only, faster)
- Always run `bun run preflight:quick` before pushing to catch TypeScript errors early
- A git pre-push hook is installed via `bun install` that runs preflight:quick automatically

## Architecture

- **web/** - Astro SSR frontend with React islands (port 4321)
- **orchestrator/** - Hono API backend with SQLite database (port 4000)
- **sandbox/** - Docker containers for development environments (VS Code, Mastra, Astro)

## Key Conventions

- Use Bun as the package manager and runtime (NOT npm/yarn/pnpm)
- Tailwind CSS with `darkMode: 'class'` for theming
- Valibot for schema validation
- SQLite with Kysely for database operations
