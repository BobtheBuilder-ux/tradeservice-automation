# Calendly MCP

Calendly's official MCP server is hosted by Calendly at:

```text
https://mcp.calendly.com
```

Use that remote URL directly with MCP clients that support OAuth 2.1 Authorization Code + PKCE and Dynamic Client Registration. Calendly does not support self-hosting their official MCP server, and it does not use personal access tokens for the hosted MCP flow.

This folder provides a local stdio MCP bridge for this app's backend automation. It uses the Calendly REST API with the existing backend token environment so local agents can inspect event types, scheduled events, invitees, scheduling links, and webhooks.

## Run Locally

```bash
cd backend
npm run mcp:calendly
```

The bridge reads `CALENDLY_PERSONAL_ACCESS_TOKEN` first, then falls back to `CALENDLY_API_TOKEN`. Values can come from `backend/.env` or from the MCP client's `env` block.

## MCP Client Config

```json
{
  "mcpServers": {
    "tradeservice-calendly": {
      "command": "node",
      "args": [
        "/Users/Bobbieberry/Desktop/tradeservice-automation/backend/mcp/calendly-server.js"
      ],
      "env": {
        "CALENDLY_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools

- `calendly_get_current_user`
- `calendly_list_event_types`
- `calendly_list_scheduled_events`
- `calendly_list_event_invitees`
- `calendly_create_single_use_link`
- `calendly_list_webhooks`
- `calendly_create_webhook`
- `calendly_remote_mcp_info`

The bridge intentionally avoids destructive tools such as event cancellation. Add those only when the app needs them and the MCP client can clearly confirm the action.
