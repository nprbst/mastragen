# /pr

Create a GitHub pull request from the current branch.

## What it does

1. **Pushes** the current branch to the remote
2. **Creates** a pull request using the GitHub CLI
3. **Returns** the PR URL for review

## Usage

```
/pr <title> [--base <branch>] [--draft] [--body <description>]
```

### Arguments

- `title`: PR title (required)
- `--base`: Target branch for the PR. Defaults to the repo's default branch (usually `main`)
- `--draft`: Create as a draft PR
- `--body`: PR description/body text

## Examples

```
/pr "Add user authentication feature"
```
Creates a PR with the given title targeting the default branch.

```
/pr "Fix login bug" --base develop --draft
```
Creates a draft PR targeting the `develop` branch.

## Implementation

When invoked, use the `gh` CLI directly:

```bash
# Push branch to remote (set upstream if needed)
git push -u origin HEAD

# Create the PR
gh pr create --title "Add user authentication feature" --body "## Summary

This PR adds..." --base main

# For draft PRs:
gh pr create --title "..." --draft
```

### Response

The `gh pr create` command outputs the PR URL directly:

```
https://github.com/owner/repo/pull/42
```

## Notes

- The `gh` CLI is pre-installed in the sandbox
- Authentication uses the `GITHUB_TOKEN` environment variable automatically
- Use `gh pr view` to see the PR status after creation
- Use `gh pr list` to see all open PRs
- Use `gh pr checks` to see CI status
