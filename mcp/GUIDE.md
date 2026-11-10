# Mailgod — Platform & MCP Guide

This guide is written for an **AI agent** (and its operator) using the Mailgod
email marketing platform through the `mailgod` MCP server. It explains
what the platform is, the concepts you need, every tool you have, and copy-paste
recipes for the common jobs. If you are an agent and unsure how to proceed, you
can always call `read_guide` to pull this document into context.

> **One rule above all:** the bulk-sending tools are **draft-first** — creating a
> send never delivers email; only `confirm_send` (and `enroll_in_flow` with
> `confirm:true`) dispatch to your audience. **Exception:** `test_send` sends a
> single real email immediately to the address you give it (and creates that
> address as a subscriber if new) — use your own address. Draft, review, confirm.

---

## 1. What the platform is

Mailgod manages subscribers and sends them email via
SendGrid. It supports one-to-few sends, large segment-based campaigns, and
multi-step automated flows, with engagement tracking, an inbox for replies,
frequency caps, and unsubscribe handling.

The MCP server is a **thin client over the platform's REST API**. Every tool maps
to an HTTP endpoint, so all the platform's safety logic (frequency caps, rate
limits, unsubscribe footers, segment queries, reply handling) applies
automatically — the MCP cannot bypass it.

```
You (agent) ──MCP/stdio──▶ mailgod MCP ──HTTP+JWT──▶ Platform API ──▶ Mongo · SendGrid
```

**First call:** run `check_connection` to confirm the server can reach the
platform and authenticate.

---

## 2. Core concepts

### Prospects (subscribers)
A "prospect" and a "subscriber" are the same record. Key fields:

| Field | Meaning |
|---|---|
| `email` | unique, required, lowercased |
| `name` | full name (`first_name` is derived from it in emails) |
| `country`, `language` | free text / code (e.g. `US`, `en`) |
| `plan_tier` | e.g. `free`, `pro` |
| `signup_source` | where they came from, e.g. `clay-outbound` |
| `tags` | string labels for segmentation |
| `custom_attributes` | arbitrary key/values, usable as email variables |
| `status` | `active` · `unsubscribed` · `bounced` · `complained` |

**Only `active` subscribers ever receive email.** The others are skipped silently
by every send path.

### Tags
Lightweight labels (e.g. `clay-jun-26`, `webinar-2026`). Use them to mark a batch
on import and then target it. Add tags with `add_prospect`/`add_prospects` (at
creation) or `tag_prospects` (to many at once, without removing existing tags).

### Segments
A **saved filter** over subscribers, used to target campaigns and flow
enrollment. A segment has an `operator` (`AND`/`OR`) and a list of `conditions`.
Every segment implicitly requires `status = active`.

A condition is `{ field, operator, value }`.

- **Common fields:** `email`, `name`, `country`, `language`, `plan_tier`, `paid`,
  `cancelled`, `status`, `signup_source`, `tags`, `usage_count`, `last_login`,
  `created_at`, `engagement_score`, or any `custom_attributes.<key>`.
- **Operators:** `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `gte`,
  `lt`, `lte`, `in`, `not_in`, `exists`, `not_exists`, `before`, `after`,
  `between` (value = `[a, b]`).

Examples:
- Free users in the US: `AND` of `plan_tier equals "free"`, `country equals "US"`.
- Has a specific tag: `tags equals "clay-jun-26"`.
- Engaged: `engagement_score gte 50`.

Use `preview_segment_count` to size an audience **before** saving a segment or
sending.

### Templates & variables
A template is a reusable HTML email with a subject. Bodies use **Handlebars**
variables in `{{double_braces}}`. Available at send time:

- `{{first_name}}`, `{{name}}`, `{{email}}`, `{{plan_tier}}`
- `{{unsubscribe_url}}` (also injected automatically in the footer)
- any `custom_attributes` — both as `{{key}}` and `{{custom.key}}`
- global variables configured in platform Settings
- variable names are case-insensitive (`{{first_name}}` = `{{FIRST_NAME}}`)

Unknown variables render as empty. An unsubscribe footer and `List-Unsubscribe`
header are added automatically to marketing sends.

### The three ways to send — pick the right one

| | **One-off** | **Campaign** | **Flow** |
|---|---|---|---|
| Targets | a list of specific subscriber ids | everyone in a **segment** | subscribers **enrolled** into an automation |
| Size | ≤ 50 recipients | unlimited (batched/throttled) | unlimited |
| Steps | single email | single email | multi-step (email → wait → email …) |
| Build with | `draft_one_off` | `draft_campaign` | built in the UI; you `enroll_in_flow` |
| Send with | `confirm_send` | `confirm_send` | `enroll_in_flow` `confirm:true` |
| Use when | quick note to a handful | a blast to a defined audience | onboarding/nurture sequences |

### Limits & safety behavior (enforced by the platform)
- **One-off:** max **50** recipients. Larger → use a campaign.
- **Frequency cap:** by default **1 email per subscriber per day**. Sends over the
  cap are skipped and counted as `skipped_frequency_cap` (not failures).
- **Global rate limit:** the platform throttles overall send volume.
- **Status gate:** non-`active` subscribers are never emailed.
- **Flows exit on reply:** if a subscriber replies, they're removed from the flow
  and auto-tagged `responded` (a human can take over). On by default per flow.

---

## 3. The draft → confirm workflow

1. **Build** the audience: `find_prospects` (for one-offs) or
   `create_segment` / `preview_segment_count` (for campaigns).
2. **Draft** the send: `draft_one_off` or `draft_campaign`. This returns an id and
   the recipient/audience count. **Nothing is sent yet.**
3. **Review** the count and content. Optionally `test_send` a template to yourself.
4. **Confirm:** `confirm_send { type, id }` to send NOW — or, for one-offs,
   `schedule_send { id, scheduled_at }` to send at a future time. The schedule
   lives on the hosted platform, so it fires even when you (the agent) are offline.
5. **Verify:** `get_send_status { type, id }` for sent/opened/failed counts, and
   `list_scheduled_sends {}` to review everything still pending.

For flows, `enroll_in_flow` is **dry-run by default** (returns how many would
enroll); pass `confirm:true` to actually enroll, which starts real sends.

---

## 4. Tool reference

### Connection & help
- **`check_connection`** — verify reachability + auth + current safety settings. Run this first.
- **`read_guide`** — return this guide.

### Prospects
- **`add_prospect`** `{ email, name?, country?, language?, plan_tier?, signup_source?, tags?, custom_attributes? }`
  Add one. If the email exists, returns the existing id (no error).
- **`add_prospects`** `{ prospects: [ {…same fields…} ] }` (≤ 500)
  Bulk add. Existing emails are skipped. Returns added/skipped/failed summary.
- **`find_prospects`** `{ search?, status?, plan_tier?, tag?, engagement_band?, page?, limit?, sort? }`
  Search/list. Returns total + compact rows (id, email, name, plan/status, tags).
- **`get_prospect`** `{ id }` — full profile + recent email events.
- **`update_prospect`** `{ id, name?, country?, language?, plan_tier?, signup_source?, status?, tags?, custom_attributes? }`
  Update fields. `tags` **replaces** the whole list — prefer `tag_prospects` to add.
- **`tag_prospects`** `{ subscriber_ids: [...], tag }` — add one tag to many.

### Templates & segments
- **`list_templates`** `{}` — id, name, subject, category, variables.
- **`create_template`** `{ name, subject, html_content, preview_text?, category? }` — variables auto-detected.
- **`list_segments`** `{}` — id, name, size, rule summary.
- **`preview_segment_count`** `{ operator, conditions }` — count matches without saving.
- **`create_segment`** `{ name, description?, operator, conditions }` — save a segment; returns id + size.

### Sending (draft-first)
- **`draft_one_off`** `{ subject, recipient_ids, html_body? | template_id?, cc?, bcc? }`
  Stage a one-off draft (≤ 50). Returns a draft id.
- **`draft_campaign`** `{ name, subject, segment_id, template_id, batch_size?, emails_per_hour? }`
  Stage a campaign draft. Returns a campaign id + audience size.
- **`test_send`** `{ template_id, email, variables? }`
  Send ONE real email of a template to a test address. Sends IMMEDIATELY (no draft) and creates the address as an active subscriber if new — use your own address.
- **`confirm_send`** `{ type: "one_off" | "campaign", id }`
  **The send gate.** Dispatches the draft to real subscribers.
- **`schedule_send`** `{ id, scheduled_at }`
  Schedule a draft one-off for a future time (ISO 8601 **with timezone offset**,
  e.g. `2026-07-15T09:30:00+05:30`). Fires server-side on the hosted platform —
  nothing needs to stay online. Scheduled sends can't be edited; cancel first.
- **`cancel_scheduled_send`** `{ id }` — return a pending scheduled send to draft.
- **`list_scheduled_sends`** `{}` — all pending scheduled sends, soonest first.
- **`get_send_status`** `{ type: "one_off" | "campaign", id }` — status + counts.

### Flows & analytics
- **`list_flows`** `{}` — flows with status, trigger, live stats.
- **`enroll_in_flow`** `{ flow_id, subscriber_ids? | segment_id?, confirm? }`
  Enroll into an **active** flow. Dry-run unless `confirm:true`.
- **`get_analytics`** `{ view?: "dashboard" | "trends" | "activity", limit? }` — read-only metrics.

---

## 5. Recipes

### A. Add a batch of prospects and email them once
```
1. add_prospects { prospects: [ {email, name, tags:["clay-jun-26"]}, … ] }
2. find_prospects { tag: "clay-jun-26", limit: 50 }      → collect the ids
3. draft_one_off {
     subject: "Quick question, {{first_name}}",
     recipient_ids: [ …≤50 ids… ],
     html_body: "<p>Hi {{first_name}}, …</p>"
   }                                                       → returns draft id
4. (optional) eyeball the count in the draft response
5. confirm_send { type:"one_off", id:"<draft id>" }
6. get_send_status { type:"one_off", id:"<draft id>" }
```

### B. Build a segment → run a campaign
```
1. preview_segment_count {
     operator:"AND",
     conditions:[ {field:"plan_tier",operator:"equals",value:"free"},
                  {field:"country",operator:"equals",value:"US"} ]
   }                                                       → check the size
2. create_segment { name:"US free users", operator:"AND", conditions:[ … ] }
3. create_template { name:"June promo", subject:"…", html_content:"…{{first_name}}…" }
   (or list_templates to reuse one)
4. draft_campaign { name:"June US free", subject:"…", segment_id:"…", template_id:"…" }
5. test_send { template_id:"…", email:"you@yourdomain.com" }   (optional preview)
6. confirm_send { type:"campaign", id:"<campaign id>" }
7. get_send_status { type:"campaign", id:"<campaign id>" }
```

### C. Enroll a segment into a nurture flow
```
1. list_flows                                  → find an ACTIVE flow id
2. create_segment { … }  (or reuse one)        → the audience
3. enroll_in_flow { flow_id:"…", segment_id:"…" }            → DRY RUN, shows count
4. enroll_in_flow { flow_id:"…", segment_id:"…", confirm:true }   → actually enroll
```

### D. Find your warm leads and reach out
```
1. find_prospects { engagement_band:"warm", limit:25, sort:"-engagement_score" }
2. draft_one_off { subject:"…", recipient_ids:[…], html_body:"…" }
3. confirm_send { type:"one_off", id:"…" }
```

### E. Plan a multi-day outreach schedule (e.g. 50/day for 2 weeks), then walk away
The platform sends each batch automatically at its scheduled time — the agent,
MCP, and operator's machine can all be offline after setup.
```
1. find_prospects { tag:"…", limit:700 }                    → collect all ids
2. Split into daily batches of ≤50 ids each.
3. For each day D (1..14):
     draft_one_off   { subject:"…", recipient_ids:[…day D's ≤50 ids…], html_body:"…" }
     schedule_send   { id:"<draft id>", scheduled_at:"2026-07-<day>T09:30:00+05:30" }
4. list_scheduled_sends {}                                  → verify all 14 batches
5. Done. To adjust later: cancel_scheduled_send { id } → edit → schedule_send again.
```
Tips:
- Always include the timezone offset in `scheduled_at` (`+05:30` for IST).
- Keep each batch ≤ 50 recipients (platform one-off limit). One batch per day
  respects the per-subscriber daily frequency cap automatically since each
  prospect appears in only one batch.
- Stagger times slightly (e.g. 09:32, not 09:00 sharp) for deliverability.

---

## 6. Setup & configuration

The MCP is configured entirely with environment variables (set in the MCP client
config). All have local-dev defaults.

| Env var | Default | Purpose |
|---|---|---|
| `MAILGOD_BASE_URL` | `http://localhost:3001` | Platform API base URL. Use the deployed URL for production. |
| `MAILGOD_PASSWORD` | `admin` | Admin password; the MCP exchanges it for a JWT. |
| `MAILGOD_TOKEN` | _(unset)_ | A pre-minted JWT; if set, used instead of password login. |
| `MAILGOD_MAX_RECIPIENTS` | _(unset)_ | Extra hard cap on recipients/audience per send or enroll. |
| `MAILGOD_ALLOW_SEND` | `true` | Set `false` to block all real sending (drafts + reads still work). |

**The platform server must be running and reachable at `MAILGOD_BASE_URL`.** If
the agent runs on a different machine than the platform, point `MAILGOD_BASE_URL`
at a reachable address (deployed URL or a tunnel) — `localhost` will not work
cross-machine.

### Register with Claude Code
Either add to a project/user `.mcp.json`:
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
or via the CLI:
```bash
claude mcp add mailgod \
  --env MAILGOD_BASE_URL=http://localhost:3001 \
  --env MAILGOD_PASSWORD=admin \
  -- node /ABSOLUTE/PATH/TO/email_marketing/mcp/dist/index.js
```
(Build once first: `cd mcp && npm install && npm run build`.)

---

## 7. Troubleshooting
- **`check_connection` says unreachable** → platform isn't running or
  `MAILGOD_BASE_URL` is wrong.
- **auth failed** → wrong `MAILGOD_PASSWORD` / expired `MAILGOD_TOKEN`.
- **"Too many recipients"** → one-off cap is 50; use a campaign.
- **Recipients skipped / "frequency cap"** → already emailed today (default cap 1/day).
- **Nothing delivered after confirm** → check `get_send_status`; non-active
  subscribers are skipped, and SendGrid must be configured on the platform.
- **`enroll_in_flow` refuses** → the flow must be `active`; activate it in the UI.

---

## 8. Safety checklist (for the agent)
- ✅ I built/checked the audience and know the count.
- ✅ I used `draft_*` and reviewed the returned recipient/audience number.
- ✅ For templates, I `test_send` to myself if unsure about rendering.
- ✅ I only call `confirm_send` (or `enroll_in_flow confirm:true`) when the above is true.
- ✅ I never assume a draft was sent — I verify with `get_send_status`.
