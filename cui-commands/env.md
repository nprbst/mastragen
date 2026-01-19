# /env

View and manage environment variables for the current session.

## What it does

1. **Lists** available environment variables
2. **Shows** which environment is active
3. **Allows** switching between environments (dev, staging, prod)

## Usage

```
/env [subcommand] [args]
```

### Subcommands

- `/env` or `/env list` - List all environment variables
- `/env show <name>` - Show value of a specific variable
- `/env switch <environment>` - Switch to a different environment

## Examples

```
/env
```
Lists all available environment variables (values masked for secrets).

```
/env show DATABASE_URL
```
Shows the value of DATABASE_URL (will prompt for confirmation if it's a secret).

```
/env switch staging
```
Switches to the staging environment configuration.

## Implementation

When invoked, call the orchestrator API:

### List variables

```bash
curl "$MASTRAGEN_API_URL/sessions/$MASTRAGEN_SESSION_ID/env" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN"
```

### Response

```json
{
  "environment": "development",
  "variables": [
    { "name": "DATABASE_URL", "masked": true },
    { "name": "API_KEY", "masked": true },
    { "name": "NODE_ENV", "value": "development", "masked": false }
  ]
}
```

### Switch environment

```bash
curl -X POST "$MASTRAGEN_API_URL/sessions/$MASTRAGEN_SESSION_ID/env/switch" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"environment": "staging"}'
```

## Security Notes

- Secret values are never shown in plain text by default
- Use `/env show <name>` with `--reveal` to see actual values
- All environment access is logged for security auditing
- Variables marked as secrets require additional confirmation to reveal

## Available Environments

The available environments are configured per-project in the dashboard:

| Environment | Description |
|-------------|-------------|
| `development` | Local development settings |
| `staging` | Pre-production testing |
| `production` | Production configuration (read-only in most cases) |
