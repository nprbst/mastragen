# mastragen

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Kubernetes Development

Scripts for helm and k8s operations:

```bash
# Lint and preview
bun run helm:lint
bun run helm:template:dev

# Deploy (creates namespace automatically)
bun run helm:install:dev      # mastragen-dev namespace
bun run helm:install:staging  # mastragen-staging namespace
bun run helm:install:prod     # mastragen-prod namespace

# Upgrade existing deployment
bun run helm:upgrade:dev

# Diagnostics
bun run k9s:dev               # Launch k9s for dev namespace
bun run k8s:status            # Pod/service status (dev)
bun run k8s:logs              # Tail all container logs
bun run k8s:port-forward      # Forward localhost:4000 to orchestrator

# Testing
bun run k8s:test              # Run integration tests
bun run k8s:test:build        # Build images + run tests
```

See [Kubernetes Deployment Guide](docs/operator/deployment-kubernetes.md) for full details.
