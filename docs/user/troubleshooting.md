# Troubleshooting Guide

This guide covers common issues and their solutions when using Mastragen.

## Connection Issues

### Can't Access Session URL

**Symptoms:**
- Browser shows "Connection refused" or timeout
- VS Code URL doesn't load

**Solutions:**

1. **Check Tailscale connection**
   - Ensure Tailscale is running and connected
   - Look for the Tailscale icon in your system tray
   - Try `tailscale status` in terminal

2. **Verify session is active**
   - Check the dashboard - session should show "Active"
   - If "Suspended", click "Resume" to restart

3. **Wait for startup**
   - New sessions take 30-60 seconds to start
   - Check the session logs in the dashboard

4. **Try a different browser**
   - Clear browser cache
   - Disable browser extensions temporarily

### Session Keeps Disconnecting

**Symptoms:**
- Frequent disconnections from VS Code
- "Connection lost" messages

**Solutions:**

1. **Check network stability**
   - Try a wired connection instead of WiFi
   - Check for VPN conflicts with Tailscale

2. **Verify Tailscale health**
   ```bash
   tailscale ping your-session-url
   ```

3. **Check activity tracking**
   - Sessions auto-suspend after inactivity
   - Keep the VS Code window in focus

## Session Issues

### Session Won't Start

**Symptoms:**
- Session stuck in "Pending" state
- Error message during creation

**Solutions:**

1. **Check for existing session**
   - You may already have a session for this project
   - Look for it in the dashboard

2. **Verify repository access**
   - Ensure you have access to the GitHub repository
   - Check GitHub permissions in your profile

3. **Contact administrator**
   - There may be resource limits in place
   - Check if the cluster has capacity

### Can't Find My Session

**Symptoms:**
- Session not appearing in dashboard
- Session was working earlier

**Solutions:**

1. **Check "All Sessions" filter**
   - Dashboard may be filtering by state
   - Select "All" to see suspended sessions

2. **Check "Shared with me"**
   - If someone shared a session, it appears there
   - Not in your main session list

3. **Session may be deleted**
   - Sessions older than 30 days may be cleaned up
   - Check with your administrator

### Session Auto-Suspended Too Early

**Symptoms:**
- Session suspended while you were working
- Didn't see the warning

**Solutions:**

1. **Understand idle detection**
   - "Idle" means no activity in VS Code
   - Background processes don't count
   - Keep VS Code window focused

2. **Adjust idle timeout**
   - Per-project settings in `mastragen.yaml`:
     ```yaml
     environments:
       default:
         idle:
           timeout_minutes: 60
     ```

3. **Request global change**
   - Contact your administrator
   - They can adjust default timeouts

## Git Issues

### PR Creation Failed

**Symptoms:**
- `/pr` command returns an error
- PR not created on GitHub

**Solutions:**

1. **Check for uncommitted changes**
   ```bash
   git status
   ```
   - Commit or stash changes first

2. **Verify branch exists remotely**
   ```bash
   git push -u origin HEAD
   ```

3. **Check GitHub permissions**
   - You need write access to the repository
   - Check your GitHub token hasn't expired

### Changes Not Saved After Suspend

**Symptoms:**
- Work lost after resuming
- Files reverted to old state

**Solutions:**

1. **Always use `/suspend` command**
   - Don't just close the browser
   - `/suspend` commits your work

2. **Check git status before suspending**
   ```bash
   git status
   /suspend
   ```

3. **Verify commit was pushed**
   - Check GitHub for your branch
   - Look for recent commits

### Merge Conflicts

**Symptoms:**
- Can't pull latest changes
- Conflict markers in files

**Solutions:**

1. **Standard git resolution**
   ```bash
   git fetch origin
   git merge origin/main
   # Resolve conflicts
   git commit
   ```

2. **Use VS Code merge editor**
   - Click on conflicted files
   - Use the visual merge tool

3. **Start fresh if needed**
   ```bash
   git stash
   git reset --hard origin/main
   git stash pop
   ```

## Performance Issues

### VS Code Slow

**Symptoms:**
- Laggy typing
- Slow file operations

**Solutions:**

1. **Check network latency**
   - High latency to Tailscale network
   - Try from a different location

2. **Close unused tabs**
   - Too many open files impacts performance
   - Close terminal sessions not in use

3. **Disable heavy extensions**
   - Some VS Code extensions use lots of resources
   - Check Extension Host process

### Build/Test Taking Forever

**Symptoms:**
- npm install very slow
- Tests timeout

**Solutions:**

1. **Check resource usage**
   - Session has limited CPU/memory
   - Close other applications in session

2. **Use caching**
   - npm: Use `npm ci` instead of `npm install`
   - Docker: Leverage build cache

3. **Contact administrator**
   - May need larger resource allocation
   - Cluster may be under load

## Sharing Issues

### Shared User Can't Access

**Symptoms:**
- `/share` succeeded but user can't connect
- User doesn't see session

**Solutions:**

1. **Verify username**
   - Use exact GitHub username
   - Check spelling (case-sensitive)

2. **User must be on Tailscale**
   - Shared user needs Tailscale access
   - They need same tailnet membership

3. **Check ACL permissions**
   - Tailscale ACLs control access
   - Contact administrator if blocked

### Can't Revoke Access

**Symptoms:**
- User still connected after `/unshare`

**Solutions:**

1. **Wait for disconnect**
   - Active connections take a moment to terminate
   - User will be disconnected within 30 seconds

2. **Force refresh**
   - Try `/unshare` again
   - Suspend and resume session

## Getting Help

If none of these solutions work:

1. **Check session logs**
   - Dashboard → Session → Logs tab
   - Look for error messages

2. **Contact administrator**
   - Share session ID and error messages
   - Note the time of the issue

3. **File an issue**
   - [GitHub Issues](https://github.com/your-org/mastragen/issues)
   - Include reproduction steps

## Quick Diagnostic Checklist

- [ ] Tailscale connected and healthy?
- [ ] Session showing as "Active" in dashboard?
- [ ] Correct URL being used?
- [ ] Browser cache cleared?
- [ ] GitHub permissions valid?
- [ ] Network connection stable?
- [ ] No VPN conflicts?
