# Project Configuration File

Mastragen uses a `.mastragen/config.yaml` file in each project's root directory to configure optional components and settings. This file is read when a session is created.

## File Location

```
your-project/
├── .mastragen/
│   └── config.yaml    # Project configuration
├── src/
│   └── mastra/
│       └── ...
└── package.json
```

## Configuration Schema

```yaml
# Version is required and must be "1"
version: "1"

# Component enablement settings
components:
  # Phoenix observability settings
  phoenix:
    enabled: true          # Enable Phoenix tracing (default: false)
    retention:
      traces_days: 30      # Days to retain traces (default: 30)
      experiments_days: 90 # Days to retain experiments (default: 90)

  # Astro UI sandbox settings
  astro:
    enabled: true          # Enable Astro preview (default: false)
    path: ./ui             # Path to Astro project (optional)

# Workspace paths (optional)
paths:
  mastra: ./src/mastra     # Path to Mastra directory
  workspace: /workspace    # Custom workspace path
```

## Minimal Configuration

To enable Phoenix observability with default settings:

```yaml
version: "1"
components:
  phoenix:
    enabled: true
```

## Default Values

When the config file is missing or fields are omitted, these defaults apply:

| Field | Default |
|-------|---------|
| `components.phoenix.enabled` | `false` |
| `components.phoenix.retention.traces_days` | `30` |
| `components.phoenix.retention.experiments_days` | `90` |
| `components.astro.enabled` | `false` |

## Phoenix Integration

When Phoenix is enabled (`components.phoenix.enabled: true`):

1. A Phoenix container starts alongside other session containers
2. The Mastra container receives environment variables:
   - `PHOENIX_ENABLED=true`
   - `PHOENIX_ENDPOINT=http://phoenix:6006/v1/traces`
   - `PHOENIX_PROJECT_NAME=mastragen-experiments`
3. Traces from Mastra agents are automatically exported to Phoenix
4. Phoenix UI is accessible at `http://localhost:6006` (Docker) or via Tailscale (K8s)

### Mastra Telemetry Setup

To enable tracing in your Mastra agents, add `@mastra/arize` to your project:

```bash
bun add @mastra/arize
```

Configure the Mastra instance with observability:

```typescript
import { Mastra } from '@mastra/core';

const mastra = new Mastra({
  // ... your config
  observability: process.env.PHOENIX_ENABLED === 'true' ? {
    configs: {
      arize: {
        serviceName: process.env.PHOENIX_PROJECT_NAME,
        exporter: {
          endpoint: process.env.PHOENIX_ENDPOINT,
        },
      },
    },
  } : undefined,
});
```

## Validation

The config file is validated against a Valibot schema when parsed. Invalid configurations will cause session creation to fail with a descriptive error message.

Common validation errors:
- Missing `version` field
- Invalid version (must be `"1"`)
- Non-numeric retention values
- Invalid YAML syntax
