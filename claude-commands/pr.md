# /pr

Create a GitHub pull request from the current session branch.

## What it does

1. **Pushes** any uncommitted changes to the remote branch
2. **Creates** a pull request via the GitHub API
3. **Returns** the PR URL for review

## Usage

```
/pr [title] [--base <branch>]
```

### Arguments

- `title`: PR title (required if not provided interactively)
- `--base`: Target branch for the PR. Defaults to the project's default branch (usually `main`)

## Examples

```
/pr "Add user authentication feature"
```
Creates a PR with the given title targeting the default branch.

```
/pr "Fix login bug" --base develop
```
Creates a PR targeting the `develop` branch.

## Implementation

When invoked, first source the environment variables if not already set, then call the orchestrator API:

```bash
# Source session environment variables if not already set
if [ -z "$MASTRAGEN_API_URL" ] && [ -f ~/.claude/env.sh ]; then
  source ~/.claude/env.sh
fi

# Verify required variables are set
if [ -z "$MASTRAGEN_API_URL" ] || [ -z "$MASTRAGEN_SESSION_ID" ] || [ -z "$MASTRAGEN_USER_TOKEN" ]; then
  echo "Error: Session environment variables not configured. Cannot create PR."
  exit 1
fi

# Call the PR API
curl -X POST "$MASTRAGEN_API_URL/api/sessions/$MASTRAGEN_SESSION_ID/pr" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add user authentication feature",
    "body": "## Summary\n\nThis PR adds...",
    "base": "main"
  }'
```

### Response

```json
{
  "url": "https://github.com/owner/repo/pull/42",
  "number": 42,
  "branch": "mg/session-xyz"
}
```

## Notes

- You can include a PR body/description for more context
- The PR is created from the current session branch
- Make sure to commit your changes before creating the PR
- Draft PRs are supported with `--draft` flag
