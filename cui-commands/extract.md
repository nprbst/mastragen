# /extract

Extract artifacts from the session for reuse in other projects.

## What it does

1. **Identifies** reusable code patterns, configurations, or components
2. **Packages** them as standalone artifacts
3. **Saves** to the project's artifact repository

## Usage

```
/extract <artifact-type> <name> [--path <path>]
```

### Arguments

- `artifact-type`: Type of artifact (component, hook, util, config)
- `name`: Name for the artifact
- `--path`: Specific path to extract from (optional)

## Examples

```
/extract component UserAvatar --path src/components/UserAvatar.tsx
```
Extracts a React component as a reusable artifact.

```
/extract hook useAuth
```
Extracts the useAuth hook for reuse.

```
/extract config eslint
```
Extracts ESLint configuration.

## Implementation

When invoked, call the orchestrator API:

```bash
curl -X POST "$MASTRAGEN_API_URL/sessions/$MASTRAGEN_SESSION_ID/extract" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "component",
    "name": "UserAvatar",
    "path": "src/components/UserAvatar.tsx"
  }'
```

### Response

```json
{
  "artifactId": "art_abc123",
  "type": "component",
  "name": "UserAvatar",
  "files": ["UserAvatar.tsx", "UserAvatar.css"],
  "dependencies": ["react", "classnames"],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Artifact Types

| Type | Description |
|------|-------------|
| `component` | React/Vue/Svelte component |
| `hook` | React hook or composable |
| `util` | Utility function or module |
| `config` | Configuration file (ESLint, TypeScript, etc.) |
| `template` | Project template or boilerplate |

## Notes

- Artifacts are stored in the project's artifact library
- Dependencies are automatically detected and included
- You can browse and reuse artifacts from the dashboard
- Artifacts can be shared across projects in the same organization
