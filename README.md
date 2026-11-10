# Mailgod

**Self-hosted email marketing and outbound for people who'd rather own their list than rent it.**

Visual automation flows, a shared reply inbox, a sales pipeline, your own SMTP sender pool, and an MCP server so AI agents can run campaigns for you. All of it runs on your infrastructure, and none of it is billed per contact.

> Built and battle-tested on a real 300K-subscriber list, then open-sourced.

---

## Why Mailgod

Most email tools charge you more as your list grows, lock your data behind their UI, and treat replies as an afterthought. Mailgod does it the other way round:

- **Replies are the product.** Every email carries a tokenized `Reply-To`, so replies land in a shared inbox already threaded to the subscriber, campaign, and flow step that triggered them. Flows can **exit on reply** and hand the lead to a human.
- **Agent-native.** A bundled [MCP server](./mcp) exposes 25 tools to Claude and other AI agents for adding prospects, building segments and templates, and sending. Bulk sends are draft-first, so an agent can't blast your list by accident.
- **Deliverability first.** Per-subscriber frequency caps, a global rate limit, RFC 5322 threading for follow-ups, mailto `List-Unsubscribe`, no click-tracking redirectors, and auto-pause for unhealthy mailboxes.
- **Yours.** MongoDB + Node + React. MIT licensed. Fork it, rebrand it, ship it.

## Features

| Area | What you get |
|---|---|
| **Subscribers** | CSV import with bulk tagging, custom fields, engagement scoring, full event timeline per subscriber |
| **Segments** | Rule builder (AND/OR) over any field, tag, custom attribute, or engagement score |
| **Templates** | Rich-text + HTML editor, presets, Handlebars variables (`{{first_name}}`, `{{custom.*}}`), device preview |
| **Flows** | Drag-and-drop automation builder (delays, branches, sends), exit-on-reply, threaded follow-ups, optional [Temporal](https://temporal.io) for durable execution |
| **Campaigns** | One-shot broadcasts to segments with batching and rate limiting |
| **Inbox** | Shared reply inbox with prospect panel, notes, labels, reminders, auto-reply detection, one-off sends |
| **Pipeline** | Kanban board that auto-advances on opens, replies, and Cal.com bookings |
| **Sender pool** | Send from your own SMTP mailboxes (Google Workspace, Zoho, anything), poll IMAP for replies, per-mailbox daily caps and warmup |
| **Analytics** | Opens, clicks, replies, bounces, weekly reports with automatic diagnosis |
| **Scheduled jobs** | Cron-style recurring sends |
| **MCP server** | Lets AI agents operate the whole platform safely |

## Quickstart (Docker)

```bash
git clone <this-repo> mailgod && cd mailgod
cp .env.example .env
# Edit .env: set ADMIN_PASSWORD, JWT_SECRET, UNSUBSCRIBE_SECRET (openssl rand -hex 32)
#            and SENDGRID_API_KEY / FROM_EMAIL when you're ready to send
docker compose up -d
```

Open **http://localhost:8080** and log in with your `ADMIN_PASSWORD`.

> In production the server **refuses to start** while `ADMIN_PASSWORD`, `JWT_SECRET`, or `UNSUBSCRIBE_SECRET` are left at insecure defaults.

## Local development

Requirements: Node 20+, MongoDB (local or Atlas).

```bash
npm install
cp .env.example .env        # MONGODB_URI is the only thing you need locally
npm run dev                 # server on :3001, client on :5173
```

Without a `SENDGRID_API_KEY`, sends are recorded but not delivered, which is handy for building flows safely.

Run the tests (they use an in-memory MongoDB):

```bash
npm test -w server
```

## Going live

1. **Sending domain.** Authenticate your domain in SendGrid (SPF + DKIM) and set `FROM_EMAIL` / `FROM_NAME`, or change them later on the Settings page.
2. **Event webhook.** In SendGrid → Mail Settings → Event Webhook, point to `https://<your-host>/api/webhooks/sendgrid` for opens, clicks, bounces, and unsubscribes.
3. **Replies.** Follow [docs/sendgrid-inbound-setup.md](./docs/sendgrid-inbound-setup.md) to route `reply.<yourdomain>` to `https://<your-host>/api/webhooks/sendgrid-inbound`, and set `REPLY_DOMAIN`.
4. **Footer / compliance.** On the Settings page, set your Product Name and **Postal Address**. They appear in every marketing email footer (CAN-SPAM).
5. **Optional:** sender pool (`MAILBOX_POOL_ENABLED=true`, then add mailboxes in the UI), Cal.com bookings (`CALCOM_SECRET`, webhook → `/api/webhooks/cal`), Temporal (`temporal/docker-compose.yml`).

All configuration is documented in [`.env.example`](./.env.example).

## Using it with AI agents (MCP)

```bash
cd mcp && npm install && npm run build
claude mcp add mailgod \
  --env MAILGOD_BASE_URL=http://localhost:3001 \
  --env MAILGOD_PASSWORD=<your ADMIN_PASSWORD> \
  -- node /absolute/path/to/mailgod/mcp/dist/index.js
```

See [mcp/README.md](./mcp/README.md) and [mcp/GUIDE.md](./mcp/GUIDE.md) for the tool reference and recipes.

## Architecture

```
client/   React + Vite + Tailwind + React Flow   (served by the server in production)
server/   Express + Mongoose + SendGrid/nodemailer + optional Temporal worker
mcp/      MCP server: a thin HTTP client over the server's REST API
temporal/ Optional docker-compose for Temporal + worker
```

## Security notes

- Mailgod is **single-tenant with one admin password**. Put it behind HTTPS, and ideally behind a VPN or SSO proxy, if it's exposed to the internet.
- Mailbox SMTP/IMAP passwords are encrypted at rest with AES-256-GCM (`MAILBOX_SECRET`).
- SendGrid webhooks are unauthenticated by default. Consider enabling SendGrid's signed event webhook, or restricting `/api/webhooks/*` at your proxy.

Found a vulnerability? Please open a private security advisory on GitHub instead of a public issue.

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)

Website: https://lucifersharma.github.io/mailgod/
