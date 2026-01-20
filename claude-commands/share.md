# /share

Share the current session with another user.

## What it does

1. **Grants** the user access to your sandbox via Tailscale ACLs
2. **Records** the share in the session history
3. **Returns** the access URL for the invited user

## Usage

```
/share <email>
```

### Arguments

- `email`: Email address of the user to share with (required)

## Examples

```
/share colleague@company.com
```
Shares the current session with the specified user.

## Implementation

When invoked, first source the environment variables if not already set, then call the orchestrator API:

```bash
# Source session environment variables if not already set
if [ -z "$MASTRAGEN_API_URL" ] && [ -f ~/.claude/env.sh ]; then
  source ~/.claude/env.sh
fi

# Verify required variables are set
if [ -z "$MASTRAGEN_API_URL" ] || [ -z "$MASTRAGEN_SESSION_ID" ] || [ -z "$MASTRAGEN_USER_TOKEN" ]; then
  echo "Error: Session environment variables not configured. Cannot share session."
  exit 1
fi

# Call the share API
curl -X POST "$MASTRAGEN_API_URL/api/sessions/$MASTRAGEN_SESSION_ID/share" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "colleague@company.com"}'
```

### Response

```json
{
  "shareId": "share_abc123",
  "sharedWithEmail": "colleague@company.com",
  "accessUrl": "https://sandbox-xyz.ts.net",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Listing shares

To see who has access to your session:

```
/share --list
```

This calls:

```bash
curl "$MASTRAGEN_API_URL/api/sessions/$MASTRAGEN_SESSION_ID/shares" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN"
```

## Revoking access

To revoke a user's access:

```
/share --revoke <share_id>
```

This calls:

```bash
curl -X DELETE "$MASTRAGEN_API_URL/api/sessions/$MASTRAGEN_SESSION_ID/shares/<share_id>" \
  -H "Authorization: Bearer $MASTRAGEN_USER_TOKEN"
```

## Notes

- Shared users get access to the sandbox but NOT write access to git
- Share access is automatically revoked when the session ends
- The invited user must have a Tailscale account with the specified email
- All share actions are logged for security auditing
