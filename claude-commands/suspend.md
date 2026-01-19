# /suspend

Suspend the current session to save your work and free up resources.

## What it does

1. **Commits** all uncommitted changes with a WIP message
2. **Pushes** the changes to the remote branch
3. **Terminates** the sandbox container to free resources
4. **Updates** session status to "suspended"

## Usage

```
/suspend [message]
```

### Arguments

- `message` (optional): Custom commit message. Defaults to "WIP: Session suspended"

## Examples

```
/suspend
```
Suspends with default message.

```
/suspend "WIP: pausing to review design decisions"
```
Suspends with a custom commit message.

## Implementation

When invoked, call the orchestrator API:

```bash
curl -X POST "$MASTRAGEN_API_URL/sessions/$MASTRAGEN_SESSION_ID/suspend" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "WIP: Session suspended"}'
```

### Response

```json
{
  "commitSha": "abc123def456",
  "branch": "mg/session-xyz",
  "message": "WIP: Session suspended",
  "status": "suspended"
}
```

## Notes

- The session can be resumed later with `/resume` or from the dashboard
- All local changes are preserved in the git branch
- Container resources are freed immediately after suspension
