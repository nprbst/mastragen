# Session Management Workflow

This skill provides guidance on managing development sessions effectively.

## Session Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Created   │────▶│   Active    │────▶│  Completed  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Suspended  │
                    └─────────────┘
```

### States

| State | Description |
|-------|-------------|
| `created` | Session initialized but not started |
| `active` | Session running with sandbox available |
| `suspended` | Session paused, work saved to branch |
| `completed` | Work merged or session ended |

## Common Workflows

### Starting a New Feature

1. **Create session** with descriptive artifact name:
   ```
   Artifact: implement-user-authentication
   Environment: development
   ```

2. **Set up workspace**:
   - Review CLAUDE.md for project context
   - Check existing code patterns
   - Identify files to modify

3. **Work iteratively**:
   - Make changes in small commits
   - Test frequently
   - Document decisions

### Pausing Work

When you need to step away:

```bash
/suspend "WIP: halfway through auth implementation"
```

This will:
- Commit all changes
- Push to remote branch
- Free sandbox resources
- Save session state

### Resuming Work

Pick up where you left off:

```bash
/resume
```

This will:
- Restart sandbox
- Restore file state
- Continue from last commit

### Collaborating

Share your session for pair programming:

```bash
/share colleague@company.com
```

The shared user can:
- View your sandbox
- Observe your work
- Provide feedback

### Creating a Pull Request

When ready for review:

```bash
/pr "Add user authentication feature"
```

This will:
- Push final changes
- Create PR on GitHub
- Link session to PR

## Best Practices

### Session Naming

Use descriptive artifact names that indicate:
- **What**: The feature or task
- **Scope**: Component or area affected

Good examples:
- `implement-oauth-login`
- `fix-cart-calculation-bug`
- `refactor-api-routes`

Avoid:
- `test`
- `feature-1`
- `johns-branch`

### Commit Messages

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructuring
- `docs:` Documentation
- `test:` Test additions

Example:
```
feat(auth): add OAuth login with GitHub provider

- Configure GitHub OAuth app settings
- Add login/callback routes
- Store user session in cookies
```

### Working with Branches

Sessions create branches with prefix (e.g., `mg/session-id`).

```bash
# View current branch
git branch --show-current

# See commit history
git log --oneline -10

# Check diff from main
git diff main...HEAD
```

### Environment Management

Check available environments:

```bash
/env
```

Switch environments for testing:

```bash
/env switch staging
```

## Troubleshooting

### Session Won't Start

1. Check project configuration
2. Verify GitHub App installation
3. Review environment variables

### Changes Not Saving

1. Verify git status: `git status`
2. Check for uncommitted changes
3. Use `/suspend` to force save

### Can't Access Sandbox

1. Check session state (must be `active`)
2. Verify Tailscale connection
3. Resume session if suspended

### Merge Conflicts

1. Pull latest from base branch
2. Resolve conflicts locally
3. Commit resolution
4. Push and update PR

## Session Commands Reference

| Command | Description |
|---------|-------------|
| `/suspend [message]` | Pause session and save work |
| `/pr [title]` | Create pull request |
| `/share <email>` | Share session access |
| `/share --list` | List active shares |
| `/share --revoke <id>` | Revoke share access |
| `/env` | List environment variables |
| `/env switch <name>` | Change environment |
| `/extract <type> <name>` | Extract reusable artifact |

## Advanced Tips

### Multiple Sessions

You can have multiple suspended sessions:

1. Suspend current: `/suspend "pausing for urgent fix"`
2. Create new session for hotfix
3. Complete and merge hotfix
4. Resume original session

### Session History

View your session history in the dashboard:
- Past sessions and their outcomes
- PR links and status
- Commit counts and activity

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Interrupt current operation |
| `Ctrl+D` | Exit cui (prompts for suspend) |
| `↑/↓` | Navigate command history |
