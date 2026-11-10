# SendGrid Inbound Parse Setup — Reply Handling

These are the one-time infrastructure steps to enable replies in the Inbox feature. The platform's outbound emails will use a tokenized Reply-To address so incoming replies route to the right conversation.

**Your app URL (example):** `https://mailgod.yourdomain.com`
**Webhook endpoint:** `POST /api/webhooks/sendgrid-inbound`
**Full webhook URL for SendGrid:** `https://mailgod.yourdomain.com/api/webhooks/sendgrid-inbound`

---

## Step 1 — Pick a subdomain

Recommended: `reply.yourdomain.com` — any subdomain you control works. Set `REPLY_DOMAIN` to it.

Outbound emails will set `Reply-To: reply+<token>@reply.yourdomain.com`.

> If you want a different subdomain, just substitute it in every step below.

---

## Step 2 — Add MX record at your DNS provider

Log into the DNS console for `yourdomain.com` and add:

| Type | Host / Name      | Value             | Priority | TTL   |
|------|------------------|-------------------|----------|-------|
| MX   | `reply`          | `mx.sendgrid.net` | 10       | 3600  |

This tells the world that mail sent to `*@reply.yourdomain.com` should be delivered to SendGrid's inbound servers.

**Verify after ~5 minutes:**
```bash
dig MX reply.yourdomain.com +short
# Expected output:
# 10 mx.sendgrid.net.
```

---

## Step 3 — (Optional but recommended) Add SPF for the subdomain

Add a TXT record so SendGrid is authorized to receive on this subdomain:

| Type | Host / Name | Value                                    | TTL  |
|------|-------------|------------------------------------------|------|
| TXT  | `reply`     | `v=spf1 include:sendgrid.net ~all`       | 3600 |

---

## Step 4 — Configure Inbound Parse in SendGrid

1. Log into SendGrid: https://app.sendgrid.com
2. Go to **Settings → Inbound Parse** (left sidebar, under Settings)
3. Click **Add Host & URL**
4. Fill in:
   - **Receiving Domain:** `yourdomain.com`
   - **Subdomain:** `reply`
   - **Destination URL:** `https://mailgod.yourdomain.com/api/webhooks/sendgrid-inbound`
   - **Check incoming emails for spam:** ☑ enable
   - **POST the raw, full MIME message:** ☐ leave unchecked (we want SendGrid's parsed format — `to`, `from`, `subject`, `text`, `html`, `envelope`, etc.)
   - **Send Grid Signed Event Webhook Requests:** ☑ enable (so we can verify the request came from SendGrid; we'll validate the signature in the webhook handler)
5. Click **Add**

---

## Step 5 — Verify end-to-end

1. From any external email account (e.g. your personal Gmail), send a test email to `reply+test123@reply.yourdomain.com`
2. Check the application logs for the webhook hitting `/api/webhooks/sendgrid-inbound`
3. The handler will log "orphan reply (token not found)" since `test123` isn't a real token — that's expected. The point is to confirm the round-trip works.

---

## How tokens flow at runtime (no manual setup needed)

```
1. App sends a campaign/flow/one-off email
   → generates random 8-char token (e.g. "a8f3k29s")
   → stores it on the Message row
   → sets Reply-To: reply+a8f3k29s@reply.yourdomain.com

2. Recipient hits Reply in their email client
   → reply goes to reply+a8f3k29s@reply.yourdomain.com
   → DNS MX → mx.sendgrid.net
   → SendGrid Inbound Parse → POST to our webhook

3. Webhook handler:
   → extracts token "a8f3k29s" from the To address
   → looks up Message by reply_token
   → creates inbound Message linked to the same conversation
   → recipient_id, source_id all carry over
   → Inbox UI shows the new reply
```

---

## Troubleshooting

| Symptom                                  | Likely cause                                                              |
|------------------------------------------|---------------------------------------------------------------------------|
| MX record not resolving after 1hr        | DNS TTL or caching. Try `dig MX reply.yourdomain.com @8.8.8.8 +short`       |
| Replies bounce with "550 No such user"   | MX record points wrong / not propagated yet                               |
| Webhook never fires                      | Wrong URL in SendGrid Inbound Parse settings, or your app URL changed    |
| Webhook fires but token always "not found" | Sending code didn't store reply_token — check Message creation in send pipeline |
| Webhook returns 500                      | Check your server logs; SendGrid will retry up to a few times then give up   |

---

## Notes

- The webhook endpoint must always return `200 OK` quickly (within ~10s). If processing is slow, accept the payload, return 200, and process async.
- The app URL above is an example. If you migrate to a custom domain (e.g. `api.yourdomain.com`), update the SendGrid Inbound Parse "Destination URL" to match.
- If you need to rotate the reply subdomain later, only Step 2 (DNS) and Step 4 (SendGrid setting) change. The token format stays the same.
