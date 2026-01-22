# Claude Commands Reference

Mastragen integrates with Claude Code to provide AI-assisted development. This reference covers all available commands.

## Session Commands

### /suspend

Suspend the current session, preserving all work.

```bash
/suspend
```

**What happens:**
1. Commits any uncommitted changes
2. Pushes to your branch
3. Stops the session containers
4. Work is preserved for later resume

**Options:**
- No options available

**Example:**
```bash
claude> /suspend
Committing changes...
Pushing to branch mg/user/feature-abc123...
Session suspended. Resume from the dashboard.
```

### /pr

Create a pull request from the current session.

```bash
/pr [title]
```

**What happens:**
1. Commits any uncommitted changes
2. Pushes all commits to the remote branch
3. Creates a pull request on GitHub
4. Returns the PR URL

**Options:**
- `title` (optional): Custom PR title. If not provided, uses the session name.

**Examples:**
```bash
# Auto-generated title
claude> /pr
Creating pull request...
PR created: https://github.com/org/repo/pull/123

# Custom title
claude> /pr "Add user authentication feature"
Creating pull request...
PR created: https://github.com/org/repo/pull/124
```

### /share

Share the current session with a teammate.

```bash
/share @username
```

**What happens:**
1. Grants the specified user access to this session
2. User appears in "Shared with me" on their dashboard
3. Both users can work in the session simultaneously

**Options:**
- `@username`: GitHub username of the person to share with

**Examples:**
```bash
claude> /share @alice
Session shared with alice. They can access it from their dashboard.

claude> /share @bob
Session shared with bob. They can access it from their dashboard.
```

### /unshare

Revoke access from a shared user.

```bash
/unshare @username
```

**What happens:**
1. Removes the user's access to this session
2. If they're currently connected, they'll be disconnected

**Options:**
- `@username`: GitHub username to remove

**Example:**
```bash
claude> /unshare @alice
Access revoked for alice.
```

## Environment Commands

### /env

View or set environment variables for the session.

```bash
/env [name] [value]
```

**Modes:**
- `/env` - List all environment variables
- `/env NAME` - Show specific variable
- `/env NAME value` - Set a variable

**Examples:**
```bash
# List all variables
claude> /env
NODE_ENV=development
LOG_LEVEL=debug
API_URL=http://localhost:3000

# Show specific variable
claude> /env NODE_ENV
NODE_ENV=development

# Set a variable
claude> /env DEBUG true
DEBUG=true
```

**Note:** Changes only affect the current session. Permanent changes should be made in `mastragen.yaml`.

## Git Commands

### /extract

Extract the current work to a new branch.

```bash
/extract [branch-name]
```

**What happens:**
1. Creates a new branch from current state
2. Pushes the new branch to GitHub
3. Useful for splitting work into multiple PRs

**Options:**
- `branch-name` (optional): Name for the new branch

**Example:**
```bash
claude> /extract feature-auth
Creating branch feature-auth...
Pushed to origin/feature-auth
```

## Status Commands

### /status

Show the current session status.

```bash
/status
```

**Output includes:**
- Session ID and name
- Active time
- Git status (branch, uncommitted changes)
- Shared users
- Idle timeout status

**Example:**
```bash
claude> /status
Session: feature-login (abc123)
Branch: mg/user/feature-login-abc123
Active: 45 minutes
Idle timeout: 30 minutes (warning in 25 minutes)
Shared with: alice, bob
Uncommitted files: 3
```

## Command Quick Reference

| Command | Description |
|---------|-------------|
| `/suspend` | Suspend session, save work |
| `/pr [title]` | Create pull request |
| `/share @user` | Share session with user |
| `/unshare @user` | Revoke user access |
| `/env [name] [value]` | View/set environment variables |
| `/extract [branch]` | Extract to new branch |
| `/status` | Show session status |

## Tips

### Keyboard Shortcuts

In Claude Code terminal:
- `Ctrl+C` - Cancel current operation
- `Up/Down` - Navigate command history
- `Tab` - Autocomplete commands

### Best Practices

1. **Commit Often**: Use `/suspend` to save work before stepping away
2. **Use Descriptive Titles**: When creating PRs, add context in the title
3. **Share Responsibly**: Only share with teammates who need access
4. **Check Status**: Run `/status` before creating PRs to ensure work is ready

### Common Workflows

**End of Day:**
```bash
claude> /suspend
```

**Ready for Review:**
```bash
claude> /pr "Implement feature X - ready for review"
claude> /suspend
```

**Pair Programming:**
```bash
claude> /share @colleague
# Work together
claude> /unshare @colleague  # When done
```
