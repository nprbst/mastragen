# Project Configuration Reference

This guide covers all configuration options for Mastragen projects.

## Configuration File

Projects are configured via `mastragen.yaml` in the repository root:

```yaml
# mastragen.yaml
version: "1"

project:
  name: "My Project"
  description: "A Mastragen-enabled project"

environments:
  default:
    # Environment variables available in sessions
    env:
      NODE_ENV: development
      LOG_LEVEL: debug

    # Idle timeout settings (optional)
    idle:
      timeout_minutes: 30
      warning_minutes: 5

sessions:
  # Branch naming prefix
  branch_prefix: "mg/"

  # Default environment for new sessions
  default_environment: "default"
```

## Configuration Sections

### Project

Basic project information:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name for the project |
| `description` | string | Brief description |

### Environments

Define multiple environments with different settings:

```yaml
environments:
  development:
    env:
      NODE_ENV: development
      API_URL: http://localhost:3000

  staging:
    env:
      NODE_ENV: staging
      API_URL: https://staging.example.com

  production:
    env:
      NODE_ENV: production
      API_URL: https://api.example.com
```

#### Environment Variables

Environment variables are injected into the session containers:

```yaml
environments:
  default:
    env:
      # Static values
      NODE_ENV: development

      # Reference secrets (managed separately)
      # Use Kubernetes secrets for sensitive values
```

**Note:** Never store secrets in `mastragen.yaml`. Use the operator-configured secrets management.

### Idle Configuration

Control automatic session suspension:

```yaml
environments:
  default:
    idle:
      # Time before auto-suspend (default: 30)
      timeout_minutes: 30

      # Warning before suspend (default: 5)
      warning_minutes: 5

      # Disable auto-suspend (not recommended)
      enabled: true
```

When a session is idle:
1. After `timeout_minutes - warning_minutes`, a warning appears
2. After `timeout_minutes`, the session auto-suspends
3. Work is preserved; resume anytime

### Sessions

Session-specific settings:

```yaml
sessions:
  # Branch prefix for git operations
  # Example: mg/username/feature-abc123
  branch_prefix: "mg/"

  # Default environment for new sessions
  default_environment: "default"

  # Maximum concurrent sessions per user (optional)
  max_per_user: 3
```

## Per-Project Idle Override

You can override the global idle timeout per project:

```yaml
# In mastragen.yaml
environments:
  default:
    idle:
      timeout_minutes: 60  # 1 hour instead of default 30
```

This is useful for long-running tasks or environments that need extended sessions.

## Environment Selection

When creating a session, users can select an environment:

1. **Dashboard**: Choose from environment dropdown
2. **API**: Specify `environment` parameter
3. **Default**: Uses `sessions.default_environment`

## Configuration Validation

Mastragen validates configuration on:
- Project creation
- Project update
- Session creation

Invalid configurations will show errors in the dashboard.

## Example Configurations

### Next.js Project

```yaml
version: "1"

project:
  name: "Next.js App"

environments:
  development:
    env:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:3000

  preview:
    env:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://preview.example.com

sessions:
  branch_prefix: "feature/"
  default_environment: "development"
```

### Python/FastAPI Project

```yaml
version: "1"

project:
  name: "FastAPI Service"

environments:
  default:
    env:
      PYTHON_ENV: development
      LOG_LEVEL: DEBUG
      DATABASE_URL: sqlite:///./dev.db

    idle:
      timeout_minutes: 45

sessions:
  branch_prefix: "dev/"
```

### Monorepo Project

```yaml
version: "1"

project:
  name: "Monorepo"

environments:
  frontend:
    env:
      WORKSPACE: packages/frontend
      NODE_ENV: development

  backend:
    env:
      WORKSPACE: packages/backend
      NODE_ENV: development

  all:
    env:
      NODE_ENV: development

sessions:
  default_environment: "all"
```

## Updating Configuration

1. Edit `mastragen.yaml` in your repository
2. Commit and push the changes
3. New sessions will use the updated configuration
4. Existing sessions are not affected (suspend and resume to apply)

## Troubleshooting

### Configuration Not Applied

- Ensure `mastragen.yaml` is in the repository root
- Check for YAML syntax errors
- Verify the file is committed to the branch being used

### Environment Variables Missing

- Check spelling in the configuration
- Verify the correct environment is selected
- Some variables may be operator-managed (check with admin)

### Idle Timeout Not Working

- Per-project settings override global defaults
- Check if `idle.enabled: false` is set
- Verify activity is being tracked (check session activity)
