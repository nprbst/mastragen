# Getting Started with Mastragen

This guide will help you create your first Mastragen development session in under 15 minutes.

## Prerequisites

Before you begin, ensure you have:

1. **GitHub account** with access to a repository you want to work on
2. **Tailscale client** installed on your machine ([download](https://tailscale.com/download))
3. **Mastragen access** via your organization's deployment

## Step 1: Connect to Tailscale

1. Open Tailscale and sign in with your organization's identity provider
2. Verify you're connected to the tailnet (Tailscale icon shows "Connected")

## Step 2: Access Mastragen

1. Open your browser and navigate to your Mastragen dashboard
   - Example: `https://mastragen-dev.your-company.ts.net`

2. Sign in with your GitHub account when prompted

## Step 3: Create a Project

If this is your first time, you'll need to set up a project:

1. Click **"New Project"** on the dashboard
2. Enter the GitHub repository URL (e.g., `https://github.com/org/repo`)
3. Select your default environment settings
4. Click **"Create Project"**

## Step 4: Start a Session

1. From your project page, click **"New Session"**
2. Choose a session name (this will be part of your branch name)
3. Select the environment (if multiple are configured)
4. Click **"Create Session"**

Your session will start provisioning. This typically takes 30-60 seconds.

## Step 5: Access Your Session

Once the session is ready, you'll see:

- **VS Code URL** - Your browser-based development environment
- **Mastra URL** - API endpoint for AI agent features
- **Astro URL** - Preview server for web projects

Click the **VS Code URL** to open your development environment.

## Step 6: Start Developing

In VS Code, you can:

1. Edit files normally
2. Use the integrated terminal
3. Run builds and tests
4. Use Claude Code via the terminal

### Using Claude Code

Open a terminal in VS Code and run:

```bash
claude
```

Claude Code is pre-configured in your session. You can:

- Ask questions about the codebase
- Get help writing code
- Run automated tasks

## Step 7: Save Your Work

When you're ready to save your progress:

### Suspend Session (keeps work, stops resources)

Use the Claude command in terminal:
```bash
/suspend
```

Or click **"Suspend"** in the Mastragen dashboard.

### Create Pull Request

When ready to merge your changes:
```bash
/pr
```

This will:
1. Commit any uncommitted changes
2. Push to your branch
3. Create a pull request on GitHub

## What's Next?

- **[Project Configuration](project-configuration.md)** - Customize your project settings
- **[Claude Commands](claude-commands.md)** - Learn all available commands
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## Quick Reference

| Action | How |
|--------|-----|
| Create session | Dashboard → New Session |
| Access VS Code | Click VS Code URL |
| Suspend session | `/suspend` or Dashboard |
| Create PR | `/pr` |
| Share session | `/share @username` |
| View activity | Dashboard → Session Details |

## Session Lifecycle

```
┌──────────┐    ┌────────────┐    ┌───────────┐    ┌──────────┐
│  Create  │───▶│   Active   │───▶│ Suspended │───▶│ Deleted  │
└──────────┘    └────────────┘    └───────────┘    └──────────┘
                     │                  │
                     │   Resume         │
                     │◀─────────────────┘
```

Sessions auto-suspend after 30 minutes of inactivity (configurable).
