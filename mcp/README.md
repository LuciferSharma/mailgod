# mailgod-mcp

An MCP server that lets an AI agent (e.g. another Claude Code) drive the Mailgod
email marketing platform: add prospects, build segments/templates, and send email
— safely, draft-first.

It's a thin HTTP client over the platform's REST API, so all platform rules
(frequency caps, rate limits, unsubscribe, reply handling) are reused. It never
touches MongoDB or SendGrid directly.

For the full platform + tool walkthrough, see **[GUIDE.md](./GUIDE.md)** (also
available to the agent via the `read_guide` tool and the `guide://mailgod`
resource).

## Install & build
```bash
cd mcp
npm install
npm run build      # → dist/
npm run smoke      # offline self-test: starts the server, lists tools (no platform, no email)
```

## Configure (env vars)
| Var | Default | Purpose |
|---|---|---|
| `MAILGOD_BASE_URL` | `http://localhost:3001` | Platform API base URL |
| `MAILGOD_PASSWORD` | `admin` | Admin password (exchanged for a JWT) |
| `MAILGOD_TOKEN` | _(unset)_ | Pre-minted JWT; used instead of password if set |
| `MAILGOD_MAX_RECIPIENTS` | _(unset)_ | Extra hard cap per send/enroll |
| `MAILGOD_ALLOW_SEND` | `true` | `false` blocks real sending (drafts/reads still work) |

> The platform server must be running and reachable at `MAILGOD_BASE_URL`.
> Cross-machine, use the deployed URL — `localhost` won't reach another box.

## Register with Claude Code

`.mcp.json`:
```json
{
  "mcpServers": {
    "mailgod": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/email_marketing/mcp/dist/index.js"],
      "env": {
        "MAILGOD_BASE_URL": "http://localhost:3001",
        "MAILGOD_PASSWORD": "admin"
      }
    }
  }
}
```

or:
```bash
claude mcp add mailgod \
  --env MAILGOD_BASE_URL=http://localhost:3001 \
  --env MAILGOD_PASSWORD=admin \
  -- node /ABSOLUTE/PATH/TO/email_marketing/mcp/dist/index.js
```

## Tools (25)
- **Connection/help:** `check_connection`, `read_guide`
- **Prospects:** `add_prospect`, `add_prospects`, `find_prospects`, `get_prospect`, `update_prospect`, `tag_prospects`
- **Content:** `list_templates`, `create_template`, `list_segments`, `preview_segment_count`, `create_segment`
- **Sending (draft-first):** `draft_one_off`, `draft_campaign`, `test_send`, `confirm_send`, `get_send_status`
- **Scheduling:** `schedule_send`, `cancel_scheduled_send`, `list_scheduled_sends`
- **Flows/analytics:** `list_flows`, `enroll_in_flow`, `get_analytics`, `get_engaged_prospects`

## Safety model
Sending is **draft-first**: `draft_one_off` / `draft_campaign` only stage; the
single `confirm_send` tool dispatches. `enroll_in_flow` is dry-run unless
`confirm:true`. (Exception: `test_send` sends one real email immediately to the
address you pass — use your own.) `MAILGOD_ALLOW_SEND=false` is a global kill-switch;
`MAILGOD_MAX_RECIPIENTS` adds a hard cap. The platform also enforces a 50-recipient
one-off limit and a daily frequency cap.

## Dev
```bash
npm run dev        # tsx watch (run from a real MCP client, or use scripts/smoke.mjs)
```
