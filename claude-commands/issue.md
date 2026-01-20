# /issue

Create or manage GitHub issues.

## What it does

Quick interface for common issue operations:
- Create new issues
- List existing issues
- View issue details
- Close/reopen issues

## Usage

```
/issue <subcommand> [args]
```

### Subcommands

- `/issue create <title>` - Create a new issue
- `/issue list` - List open issues
- `/issue view <number>` - View issue details
- `/issue close <number>` - Close an issue

## Examples

```
/issue create "Add dark mode support"
```
Creates an issue with the given title.

```
/issue create "Bug: login fails" --body "Steps: 1. Open app 2. Click login 3. Error appears"
```
Creates an issue with title and body.

```
/issue list --label bug
```
Lists issues with the "bug" label.

```
/issue view 123
```
Shows details of issue #123.

```
/issue close 45 --comment "Fixed in PR #50"
```
Closes issue #45 with a comment.

## Implementation

```bash
# Create issue
gh issue create --title "Add dark mode support" --body "..."

# List issues
gh issue list

# View issue
gh issue view 123

# Close issue
gh issue close 123
```

## Notes

- Use `--label` to add labels when creating
- Use `--assignee @me` to assign to yourself
- Use `--milestone <name>` to add to a milestone
- Use `--project <name>` to add to a project board
