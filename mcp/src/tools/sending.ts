/**
 * Sending tools — DRAFT-FIRST by design.
 *
 * Nothing here sends on creation:
 *   - draft_one_off   → stages a one-off send (<=50 recipients) as a draft
 *   - draft_campaign  → stages a segment campaign as a draft
 *   - confirm_send    → the ONE explicit tool that actually dispatches a draft NOW
 *   - schedule_send   → schedules a draft one-off for a future time (fires server-side)
 *   - cancel_scheduled_send / list_scheduled_sends → manage the pending schedule
 *   - test_send       → sends a single real email to a test address (safe preview)
 *   - get_send_status → reports counts/status for a one-off or campaign
 *
 * The platform still enforces its own backstops (one-off <=50 recipients, daily
 * frequency cap, global rate limit, skip non-active). MAILGOD_MAX_RECIPIENTS and
 * MAILGOD_ALLOW_SEND add optional extra guards on the MCP side.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../client.js';
import { config } from '../config.js';
import { tool } from '../lib.js';

const ONE_OFF_HARD_LIMIT = 50; // platform's inboxOneOffLimit default

function enforceCap(count: number): void {
  if (config.maxRecipients !== undefined && count > config.maxRecipients) {
    throw new Error(
      `${count} recipients exceeds MAILGOD_MAX_RECIPIENTS=${config.maxRecipients}. ` +
        'Raise the cap or send to fewer recipients.',
    );
  }
}

export function registerSendingTools(server: McpServer): void {
  tool(
    server,
    'draft_one_off',
    {
      title: 'Draft a one-off email',
      description:
        `Stage a one-off email to a small list of specific subscribers (max ${ONE_OFF_HARD_LIMIT}) as a DRAFT. ` +
        'Does NOT send. Provide html_body OR template_id. Returns a draft id — call confirm_send ' +
        '{type:"one_off", id} to send now, or schedule_send {id, scheduled_at} to send later. ' +
        'For large audiences use draft_campaign instead.',
    },
    {
      subject: z.string().min(1).describe('Subject line (Handlebars variables allowed).'),
      recipient_ids: z
        .array(z.string())
        .min(1)
        .max(ONE_OFF_HARD_LIMIT)
        .describe(`Subscriber ids to send to (max ${ONE_OFF_HARD_LIMIT}). Get ids from find_prospects.`),
      html_body: z.string().optional().describe('Inline HTML/plain body. Omit if using template_id.'),
      template_id: z.string().optional().describe('Use an existing template instead of html_body.'),
      cc: z.array(z.string()).optional().describe('CC email addresses (free-text, not subscriber ids).'),
      bcc: z.array(z.string()).optional().describe('BCC email addresses.'),
    },
    async ({ subject, recipient_ids, html_body, template_id, cc, bcc }: any) => {
      if (!html_body && !template_id) throw new Error('Provide either html_body or template_id.');
      enforceCap(recipient_ids.length);
      const draft = await api('POST', '/api/one-off-sends', {
        body: { subject, html_body, template_id, recipient_ids, cc: cc || [], bcc: bcc || [] },
      });
      return (
        `📝 Draft one-off created (id: ${draft._id}).\n` +
        `subject: "${subject}"\nrecipients: ${draft.recipient_count}\nstatus: ${draft.status}\n\n` +
        `➡️ To send: confirm_send { type: "one_off", id: "${draft._id}" }`
      );
    },
  );

  tool(
    server,
    'draft_campaign',
    {
      title: 'Draft a campaign',
      description:
        'Stage a campaign (send a template to everyone in a segment) as a DRAFT. Does NOT send. ' +
        'Returns a campaign id and the current audience size — call confirm_send {type:"campaign", id} to send.',
    },
    {
      name: z.string().min(1).describe('Campaign name (internal).'),
      subject: z.string().min(1).describe('Subject line.'),
      segment_id: z.string().describe('Target segment id (from list_segments / create_segment).'),
      template_id: z.string().describe('Template id to send (from list_templates / create_template).'),
      batch_size: z.number().int().positive().optional().describe('Recipients per batch (default 100).'),
      emails_per_hour: z.number().int().positive().optional().describe('Throttle (default 1000/hour).'),
    },
    async ({ name, subject, segment_id, template_id, batch_size, emails_per_hour }: any) => {
      const send_config = {
        batch_size: batch_size ?? 100,
        emails_per_hour: emails_per_hour ?? 1000,
      };
      const campaign = await api('POST', '/api/campaigns', {
        body: { name, subject, segment_id, template_id, send_config },
      });
      // Report audience size so the agent knows the blast radius before confirming.
      let audience = 'unknown';
      try {
        const seg = await api<{ subscriber_count: number }>('GET', `/api/segments/${segment_id}`);
        audience = String(seg.subscriber_count);
      } catch {
        /* non-fatal */
      }
      enforceCap(Number(audience) || 0);
      return (
        `📝 Draft campaign created (id: ${campaign._id}).\n` +
        `name: "${name}"\nsubject: "${subject}"\naudience (segment size): ~${audience}\nstatus: ${campaign.status}\n\n` +
        `➡️ To send: confirm_send { type: "campaign", id: "${campaign._id}" }`
      );
    },
  );

  tool(
    server,
    'test_send',
    {
      title: 'Test-send a template',
      description:
        'Send ONE real email of a template to a single test address to preview rendering/deliverability. ' +
        'NOTE: it sends a real email IMMEDIATELY (no draft step), and if the address is not already a ' +
        'subscriber the platform creates it as an active subscriber — so use your OWN address.',
    },
    {
      template_id: z.string().describe('Template id to render and send.'),
      email: z.string().email().describe('Test recipient address.'),
      variables: z.record(z.string(), z.any()).optional().describe('Sample variable values for the render.'),
    },
    async ({ template_id, email, variables }: any) => {
      if (!config.allowSend) throw new Error('Sending is disabled (MAILGOD_ALLOW_SEND=false).');
      const res = await api('POST', `/api/templates/${template_id}/test-send`, {
        body: { email, variables },
      });
      return res?.success
        ? `✅ Test email sent to ${email} (messageId: ${res.messageId || 'n/a'}).`
        : `⚠️ Test send did not succeed: ${res?.error || 'unknown error'}`;
    },
  );

  tool(
    server,
    'confirm_send',
    {
      title: 'Confirm + send',
      description:
        'THE send gate. Actually dispatches a draft created by draft_one_off or draft_campaign. ' +
        'This sends real email to real subscribers. Make sure the draft is correct first.',
    },
    {
      type: z.enum(['one_off', 'campaign']).describe('Which kind of draft to send.'),
      id: z.string().describe('The draft id returned by draft_one_off / draft_campaign.'),
    },
    async ({ type, id }: { type: 'one_off' | 'campaign'; id: string }) => {
      if (!config.allowSend) {
        throw new Error('Sending is disabled (MAILGOD_ALLOW_SEND=false). Set it to true to dispatch.');
      }
      if (type === 'one_off') {
        await api('POST', `/api/one-off-sends/${id}/send`, {});
        return `🚀 One-off send started (id: ${id}). Check progress with get_send_status.`;
      }
      const res = await api<{ total: number }>('POST', `/api/campaigns/${id}/send`, {});
      return `🚀 Campaign send started (id: ${id}), audience ${res.total ?? '?'}. Check progress with get_send_status.`;
    },
  );

  tool(
    server,
    'schedule_send',
    {
      title: 'Schedule a draft one-off for later',
      description:
        'Schedule a DRAFT one-off (from draft_one_off) to send automatically at a future time. ' +
        'The schedule lives on the hosted platform — the send fires server-side even if this agent, ' +
        'the MCP, and the laptop are all offline. Time must be ISO 8601 WITH timezone offset ' +
        '(e.g. "2026-07-15T09:30:00+05:30" for IST) or UTC ("2026-07-15T04:00:00Z"). ' +
        'To change a scheduled email: cancel_scheduled_send → edit → schedule_send again.',
    },
    {
      id: z.string().describe('The draft id returned by draft_one_off.'),
      scheduled_at: z
        .string()
        .describe('ISO 8601 datetime with timezone offset, must be in the future.'),
    },
    async ({ id, scheduled_at }: { id: string; scheduled_at: string }) => {
      if (!config.allowSend) {
        throw new Error('Sending is disabled (MAILGOD_ALLOW_SEND=false). Scheduling is blocked.');
      }
      const when = new Date(scheduled_at);
      if (isNaN(when.getTime())) throw new Error(`Invalid datetime: "${scheduled_at}". Use ISO 8601 with offset.`);
      const res = await api('POST', `/api/one-off-sends/${id}/schedule`, {
        body: { scheduled_at: when.toISOString() },
      });
      return (
        `⏰ Scheduled (id: ${id}) for ${when.toISOString()} (UTC).\n` +
        `recipients: ${res.send?.recipient_count}\nsubject: "${res.send?.subject}"\n\n` +
        'The hosted platform sends it automatically — nothing needs to stay running. ' +
        'Cancel with cancel_scheduled_send while it is still pending.'
      );
    },
  );

  tool(
    server,
    'cancel_scheduled_send',
    {
      title: 'Cancel a scheduled send',
      description:
        'Cancel a scheduled one-off back to DRAFT (recoverable — reschedule or edit it). ' +
        'Only works while still pending; once dispatch has started it cannot be stopped.',
    },
    {
      id: z.string().describe('The scheduled one-off send id.'),
    },
    async ({ id }: { id: string }) => {
      const res = await api('POST', `/api/one-off-sends/${id}/unschedule`, {});
      return `↩️ Cancelled — back to draft (id: ${id}, subject: "${res.send?.subject}").`;
    },
  );

  tool(
    server,
    'list_scheduled_sends',
    {
      title: 'List scheduled sends',
      description:
        'List all pending scheduled one-off sends, soonest first. Use to review/verify a ' +
        'multi-day email plan (e.g. a 2-week sequence) before walking away.',
    },
    {},
    async () => {
      const sends = await api<any[]>('GET', '/api/one-off-sends?status=scheduled');
      if (!sends?.length) return 'No scheduled sends pending.';
      const rows = [...sends]
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .map(
          s =>
            `${new Date(s.scheduled_at).toISOString()}  "${s.subject}"  → ${s.recipient_count} recipient${s.recipient_count !== 1 ? 's' : ''}  (id: ${s._id})`,
        );
      return `${rows.length} scheduled send${rows.length !== 1 ? 's' : ''} pending:\n` + rows.join('\n');
    },
  );

  tool(
    server,
    'get_send_status',
    {
      title: 'Get send status',
      description: 'Report status + counts for a one-off send or a campaign.',
    },
    {
      type: z.enum(['one_off', 'campaign']).describe('Which kind to look up.'),
      id: z.string().describe('The one-off send id or campaign id.'),
    },
    async ({ type, id }: { type: 'one_off' | 'campaign'; id: string }) => {
      if (type === 'one_off') {
        const s = await api('GET', `/api/one-off-sends/${id}`);
        const sum = s.send_summary || {};
        const skipped = sum.skipped_frequency_cap ?? 0;
        const failed = sum.failed ?? 0;
        // Older sends may not have persisted send_summary.sent — derive it.
        const sent = sum.sent ?? Math.max(0, (s.recipient_count ?? 0) - skipped - failed);
        return (
          `one-off ${id}\nstatus: ${s.status}\nrecipients: ${s.recipient_count}\n` +
          `sent: ${sent}, skipped(freq cap): ${skipped}, failed: ${failed}\n` +
          `sent_at: ${s.sent_at ? new Date(s.sent_at).toISOString() : '—'}`
        );
      }
      const c = await api('GET', `/api/campaigns/${id}`);
      const st = c.stats || {};
      return (
        `campaign ${id} "${c.name}"\nstatus: ${c.status}\n` +
        `total: ${st.total ?? 0}, sent: ${st.sent ?? 0}, opened: ${st.opened ?? 0}, clicked: ${st.clicked ?? 0}, bounced: ${st.bounced ?? 0}`
      );
    },
  );
}
