# /gh

Run GitHub CLI commands for repository operations.

## What it does

Provides access to the full GitHub CLI for:
- Pull requests (create, view, merge, list)
- Issues (create, view, list, close)
- Repository operations (clone, fork, view)
- Releases (create, list, download)
- Workflow runs (view, list, rerun)

## Usage

```
/gh <command> [args]
```

## Common Commands

### Pull Requests

```bash
# List open PRs
gh pr list

# View current branch's PR
gh pr view

# View specific PR
gh pr view 123

# Create PR (interactive)
gh pr create

# Merge PR
gh pr merge 123

# Check PR CI status
gh pr checks
```

### Issues

```bash
# List issues
gh issue list

# Create issue
gh issue create --title "Bug: login fails" --body "Steps to reproduce..."

# View issue
gh issue view 45

# Close issue
gh issue close 45

# Add labels
gh issue edit 45 --add-label "bug"
```

### Repository Info

```bash
# View repo info
gh repo view

# View repo in browser
gh repo view --web

# List releases
gh release list
```

### Actions/Workflows

```bash
# List workflow runs
gh run list

# View run details
gh run view <run-id>

# Rerun failed jobs
gh run rerun <run-id> --failed
```

## Implementation

The `gh` CLI is pre-installed in the sandbox and authenticates using the `GITHUB_TOKEN` environment variable.

Execute `gh` commands directly:

```bash
gh pr list
gh issue create --title "Feature request" --body "..."
```

## Notes

- Full documentation: https://cli.github.com/manual/
- Authentication is automatic via `GITHUB_TOKEN`
- Use `gh help <command>` for detailed help on any command
