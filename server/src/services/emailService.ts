import sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { config } from '../config';
import { Subscriber, ISubscriber } from '../models/subscriber';
import { Template } from '../models/template';
import { EmailEvent } from '../models/emailEvent';
import { getSetting } from '../models/settings';
import { rateLimiter } from '../utils/rateLimiter';
import { getUnsubscribeUrl } from '../utils/unsubscribe';
import { recordOutboundMessage, buildReplyToAddress } from './inboxRecorder';
import type { MessageSourceType } from '../models/message';
import { renderEmailBody } from '../utils/emailRender';
import { Mailbox, IMailbox } from '../models/mailbox';
import { getDefaultMailbox, getTransport, allowanceToday, sentToday, htmlToText } from './mailboxService';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function getTemplateVariables(): Promise<Record<string, string>> {
  return (await getSetting('template_variables', {})) as Record<string, string>;
}

/**
 * Resolve the daily frequency cap from a Settings value that may be a string,
 * number, empty, or garbage. Preserves a legitimate 0 ("pause marketing"); only
 * falls back to the default for empty / non-numeric / negative values.
 */
export function resolveFrequencyCap(raw: unknown, fallback: number): number {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

if (config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

interface SendEmailParams {
  subscriberId: string;
  templateId?: string;
  // Inline content (used for one-off composer); takes precedence over templateId
  inlineSubject?: string;
  inlineHtml?: string;
  variables?: Record<string, any>;
  campaignId?: string;
  flowId?: string;
  flowNodeId?: string;
  flowExecutionId?: string;
  // Inbox source: needed so we can record an outbound Message with proper linkage
  oneOffSendId?: string;
  // For replies, link to the inbound message we're answering
  inReplyToMessageId?: string;
  // CC/BCC addresses (free-text emails, not subscriber refs)
  cc?: string[];
  bcc?: string[];
  // Threading headers for proper RFC 5322 conversation grouping
  inReplyToRfcId?: string | null;     // parent's Message-ID like "<abc@host>"
  referencesChain?: string | null;    // existing References header value to extend
  // When set, treat inlineHtml as plain text and convert to HTML server-side
  // (paragraph breaks + auto-linkify + escape). Default 'auto' detects via
  // looksLikeHtml heuristic.
  bodyFormat?: 'plain' | 'html' | 'auto';
  // When true, skip the unsubscribe footer AND the List-Unsubscribe header.
  // Use for 1-to-1 personal replies in the inbox so they look like a normal
  // email and not a marketing blast. Campaigns/flows/one-offs keep both.
  personalEmail?: boolean;
  // Overrides the template's subject. Used by the flow executor to force
  // follow-up emails to use the FIRST email's subject (with "Re:" prefix)
  // so the whole sequence threads as one conversation in mail clients.
  subjectOverride?: string;
  // If false, emailService will not write a Message row (e.g. test sends)
  recordInbox?: boolean;
  // Sender pool: send through a specific Mailbox row (smtp or the sendgrid row). Default = SendGrid sender.
  mailboxId?: string;
  // Pool processor sets this: fail with 'Mailbox allowance reached' when the mailbox hit today's cap.
  enforceMailboxCap?: boolean;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string; inboxMessageId?: string }> {
  const {
    subscriberId,
    templateId,
    inlineSubject,
    inlineHtml,
    variables = {},
    campaignId,
    flowId,
    flowNodeId,
    flowExecutionId,
    oneOffSendId,
    inReplyToMessageId,
    cc = [],
    bcc = [],
    inReplyToRfcId = null,
    referencesChain = null,
    bodyFormat = 'auto',
    personalEmail = false,
    subjectOverride,
    recordInbox = true,
  } = params;
  // Filter and dedupe cc/bcc — must look like emails, not the recipient itself
  const sanitizeList = (list: string[], excludeAddr: string): string[] => {
    const seen = new Set<string>([excludeAddr.toLowerCase()]);
    const out: string[] = [];
    for (const raw of list) {
      const v = String(raw || '').trim().toLowerCase();
      if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  const eventBase = {
    subscriber_id: subscriberId,
    campaign_id: campaignId || null,
    flow_id: flowId || null,
    flow_execution_id: flowExecutionId || null,
  };

  const subscriber = await Subscriber.findById(subscriberId);
  if (!subscriber || subscriber.status !== 'active') {
    const reason = !subscriber ? 'Subscriber not found' : `Subscriber status is ${subscriber.status}`;
    await recordFailedEvent(eventBase, reason);
    return { success: false, error: reason };
  }

  const frequencyCapDaily = resolveFrequencyCap(
    await getSetting('frequency_cap_daily', config.frequencyCapDaily),
    config.frequencyCapDaily,
  );
  // From identity: Settings (DB) takes precedence over env vars. This lets
  // the user change the sender name / address
  // via the Settings page without a redeploy.
  let fromEmail = (await getSetting('from_email', config.fromEmail)) as string;
  let fromName = (await getSetting('from_name', config.fromName)) as string;

  // Sender pool: resolve the mailbox this send goes through (explicit, else the SendGrid row).
  let mailbox: IMailbox | null = null;
  if (params.mailboxId) {
    mailbox = await Mailbox.findById(params.mailboxId);
    if (!mailbox) {
      await recordFailedEvent(eventBase, 'Mailbox not found');
      return { success: false, error: 'Mailbox not found' };
    }
    if (params.enforceMailboxCap) {
      if (mailbox.status !== 'active') return { success: false, error: 'Mailbox allowance reached (paused)' };
      if ((await sentToday(mailbox)) >= allowanceToday(mailbox)) return { success: false, error: 'Mailbox allowance reached' };
    }
  } else {
    mailbox = await getDefaultMailbox();
  }
  const viaSmtp = !!mailbox && mailbox.kind === 'smtp';
  if (viaSmtp && mailbox) {
    fromEmail = mailbox.email;
    fromName = mailbox.display_name || fromName;
  }
  const mailboxIdForRecords = mailbox ? (mailbox._id as any) : null;

  const sentAt = new Date();

  // The daily frequency cap is a MARKETING control. 1-to-1 conversational
  // replies (personalEmail) must never be capped or consume the subscriber's
  // daily slot — otherwise replying to someone a campaign/flow already emailed
  // today would be wrongly rejected. So we only reserve for non-personal sends.
  // engagement.* is advanced on confirmed success (below), not here.
  if (!personalEmail) {
    // A cap of 0 (or less) means "no marketing sends right now" — block without
    // reserving. (Personal replies bypass this whole block.)
    if (frequencyCapDaily <= 0) {
      await recordFailedEvent(eventBase, 'Frequency cap reached');
      return { success: false, error: 'Frequency cap reached for this subscriber today' };
    }
    // Atomically reserve a daily-frequency slot: match only when the subscriber
    // is active AND (new day OR under today's cap); the pipeline resets the
    // counter to 1 on a new day, else increments it — one atomic op that closes
    // the read-check-then-write race where two concurrent sends could each pass
    // a stale check and breach the cap. Null = cap reached; the slot is released
    // if the SendGrid call later fails (releaseFrequencySlot).
    const startOfToday = new Date(sentAt);
    startOfToday.setHours(0, 0, 0, 0);
    const reserved = await Subscriber.findOneAndUpdate(
      {
        _id: subscriberId,
        status: 'active',
        $or: [
          { 'frequency.last_email_date': null },
          { 'frequency.last_email_date': { $lt: startOfToday } },
          { 'frequency.emails_sent_today': { $lt: frequencyCapDaily } },
        ],
      },
      [
        {
          $set: {
            'frequency.emails_sent_today': {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $ifNull: ['$frequency.last_email_date', null] }, null] },
                    { $lt: ['$frequency.last_email_date', startOfToday] },
                  ],
                },
                1,
                { $add: [{ $ifNull: ['$frequency.emails_sent_today', 0] }, 1] },
              ],
            },
            'frequency.last_email_date': sentAt,
          },
        },
      ],
      { new: true },
    );
    if (!reserved) {
      await recordFailedEvent(eventBase, 'Frequency cap reached');
      return { success: false, error: 'Frequency cap reached for this subscriber today' };
    }
  }

  let subjectSource: string;
  let htmlSource: string;

  if (inlineSubject !== undefined && inlineHtml !== undefined) {
    subjectSource = inlineSubject;
    // For inline sends (composer + replies), run the user's body through the
    // text-to-HTML renderer so plain text gets paragraph breaks, hyperlinks,
    // and a consistent styled shell. Templates skip this — they already have
    // their own HTML structure.
    htmlSource = renderEmailBody(inlineHtml, bodyFormat);
  } else {
    if (!templateId) {
      await recordFailedEvent(eventBase, 'Neither templateId nor inline content provided');
      return { success: false, error: 'Neither templateId nor inline content provided' };
    }
    const template = await Template.findById(templateId);
    if (!template) {
      await recordFailedEvent(eventBase, `Template ${templateId} not found`);
      return { success: false, error: 'Template not found' };
    }
    subjectSource = template.subject;
    htmlSource = template.html_content;
  }

  const unsubscribeUrl = getUnsubscribeUrl(subscriberId);
  // mailto unsubscribe is the RFC-compliant opt-out that works even when the
  // HTTPS endpoint isn't publicly reachable. The subscriber id is in the subject
  // so inbound replies can be matched to a suppression entry.
  const unsubscribeMailto = `mailto:reply@${config.replyDomain}?subject=unsubscribe%20${subscriberId}`;
  const globalVars = await getTemplateVariables();
  const customAttrs = (subscriber.custom_attributes || {}) as Record<string, any>;
  const baseVars: Record<string, any> = {
    ...globalVars,
    ...customAttrs,                      // {{channel_link}} etc. (top-level alias)
    custom: customAttrs,                 // {{custom.channel_link}} (namespaced)
    ...variables,                        // overrides above if explicitly passed
    name: subscriber.name || 'there',
    first_name: (subscriber.name || 'there').split(' ')[0],
    email: subscriber.email,
    plan_tier: subscriber.plan_tier,
    unsubscribe_url: unsubscribeUrl,
    // Sender identity for the pool: {{sender_name}} signs as whichever mailbox sends.
    sender_name: fromName,
    sender_email: fromEmail,
  };
  const templateVars = withCaseAliases(baseVars);
  const footerLine = [globalVars.product_name || fromName, globalVars.company_address]
    .filter(Boolean).map(s => escapeHtml(String(s))).join(' · ');

  // subjectOverride wins over both inline + template subjects. Used by the
  // flow executor to force every follow-up to use email-1's subject so the
  // whole sequence threads visually as a single conversation.
  const effectiveSubjectSource = subjectOverride !== undefined && subjectOverride !== '' ? subjectOverride : subjectSource;
  const compiledSubject = Handlebars.compile(effectiveSubjectSource)(templateVars);
  const compiledHtml = Handlebars.compile(htmlSource)(templateVars);

  // Personal replies skip the marketing-style footer — they should look like
  // a normal 1-to-1 email, not a broadcast.
  const htmlWithUnsubscribe = (personalEmail || (viaSmtp && mailbox?.drop_footer))
    ? compiledHtml
    : compiledHtml + `
    <div style="text-align:center;padding:20px;font-size:12px;color:#999;">
      <a href="${unsubscribeMailto}" style="color:#999;">Unsubscribe</a> from these emails.
      ${footerLine ? `<br/>${footerLine}` : ''}
    </div>`;

  // Determine inbox source (only one of these should be present)
  const inboxSource = resolveInboxSource({ campaignId, oneOffSendId, flowId, flowNodeId });

  // Pre-generate reply token so we can put it in the Reply-To header
  const { generateReplyToken } = await import('./inboxRecorder');
  const replyToken = inboxSource && recordInbox ? generateReplyToken() : null;
  const replyToAddress = replyToken ? buildReplyToAddress(replyToken) : undefined;
  // RFC 5322 Message-ID for proper email-client threading. Deterministic from
  // reply_token + reply domain.
  const rfcMessageId = replyToken ? `<${replyToken}@${viaSmtp && mailbox ? mailbox.domain : config.replyDomain}>` : null;

  try {
    const msg: any = {
      to: subscriber.email,
      from: { email: fromEmail, name: fromName },
      subject: compiledSubject,
      html: htmlWithUnsubscribe,
      // Personal replies omit List-Unsubscribe so Gmail/Apple Mail don't show
      // an "Unsubscribe" link next to the sender — that's wrong for a 1-to-1
      // conversation. Marketing sends keep it (required for deliverability).
      // mailto List-Unsubscribe (honored by Gmail/Apple/Outlook). No
      // List-Unsubscribe-Post: one-click is HTTPS-POST-only, invalid with mailto.
      headers: personalEmail ? {} : {
        'List-Unsubscribe': `<${unsubscribeMailto}>`,
      },
      customArgs: {
        subscriber_id: subscriberId,
        campaign_id: campaignId || '',
        flow_id: flowId || '',
        flow_execution_id: flowExecutionId || '',
        one_off_send_id: oneOffSendId || '',
      },
      // Deliverability: SendGrid click-tracking rewrites every link through the
      // url<id>.<your-domain> HTTP redirector, a strong cold-email/bulk
      // fingerprint. Disable it so links stay clean.
      // Subscription tracking off too — we inject our own List-Unsubscribe header
      // + footer. Open tracking stays ON so we keep the open-rate signal we need
      // to gate the warmup ramp.
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: true },
        subscriptionTracking: { enable: false },
      },
    };

    // SMTP mailboxes receive replies directly (IMAP poller threads them); no tracked Reply-To.
    if (replyToAddress && !viaSmtp) {
      msg.replyTo = replyToAddress;
    }

    // RFC 5322 threading headers. Always set Message-ID on outbound so future
    // replies-to-replies can reference it. Only set In-Reply-To/References
    // when this send IS a reply (parent context provided by caller).
    if (rfcMessageId) {
      msg.headers['Message-ID'] = rfcMessageId;
    }
    if (inReplyToRfcId) {
      msg.headers['In-Reply-To'] = inReplyToRfcId;
      // RFC 2822: References chain = old chain + parent's Message-ID
      const refs = referencesChain ? `${referencesChain} ${inReplyToRfcId}` : inReplyToRfcId;
      msg.headers['References'] = refs;
    }

    const ccList = sanitizeList(cc, subscriber.email);
    const bccList = sanitizeList(bcc, subscriber.email);
    if (ccList.length > 0) msg.cc = ccList;
    if (bccList.length > 0) msg.bcc = bccList;

    let messageId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (!config.sendgridApiKey && !viaSmtp) {
      if (!personalEmail) await releaseFrequencySlot(subscriberId);
      await recordFailedEvent(eventBase, 'SendGrid API key not configured');
      return { success: false, error: 'SendGrid API key not configured' };
    }

    // Global throughput guard (shared across instances via Mongo). Reserve here
    // — right before the actual API call — so we only count real send attempts.
    if (!(await rateLimiter.reserve())) {
      await rateLimiter.release(); // we incremented but won't send — give it back
      if (!personalEmail) await releaseFrequencySlot(subscriberId);
      await recordFailedEvent(eventBase, 'Rate limit exceeded');
      return { success: false, error: 'Rate limit exceeded' };
    }

    if (viaSmtp && mailbox) {
      const info = await getTransport(mailbox).sendMail({
        from: { name: fromName, address: fromEmail },
        to: subscriber.email,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: compiledSubject,
        html: htmlWithUnsubscribe,
        text: htmlToText(htmlWithUnsubscribe),
        messageId: rfcMessageId || undefined,
        inReplyTo: inReplyToRfcId || undefined,
        references: msg.headers['References'] || undefined,
        headers: msg.headers['List-Unsubscribe'] && !mailbox.drop_footer ? { 'List-Unsubscribe': msg.headers['List-Unsubscribe'] } : undefined,
      });
      messageId = info.messageId || rfcMessageId || messageId;
      await Mailbox.updateOne({ _id: mailbox._id }, { $set: { last_sent_at: new Date(), last_error: null }, $inc: { 'stats.sent_total': 1 } }).catch(() => {});
    } else {
      const [response] = await sgMail.send(msg);
      messageId = response.headers['x-message-id'] || messageId;
      if (mailbox) await Mailbox.updateOne({ _id: mailbox._id }, { $set: { last_sent_at: new Date() }, $inc: { 'stats.sent_total': 1 } }).catch(() => {});
    }

    // Bookkeeping AFTER a confirmed send must never reach the outer catch (which
    // would release slots and mis-record a delivered email as failed). Swallow.
    try {
      await EmailEvent.create({
        ...eventBase,
        sendgrid_message_id: messageId,
        mailbox_id: mailboxIdForRecords,
        event: 'sent',
        timestamp: new Date(),
      });
    } catch (e) {
      console.error('Failed to record sent EmailEvent:', e);
    }

    let inboxMessageId: string | undefined;
    if (inboxSource && recordInbox && replyToken) {
      try {
        const recorded = await recordOutboundMessage({
          source_type: inboxSource.source_type,
          source_id: inboxSource.source_id,
          flow_node_id: inboxSource.flow_node_id || null,
          subscriber_id: subscriberId,
          mailbox_id: mailboxIdForRecords,
          to_address: subscriber.email,
          from_address: fromEmail,
          cc_addresses: ccList,
          bcc_addresses: bccList,
          subject: compiledSubject,
          variables,
          sendgrid_message_id: messageId,
          in_reply_to_message_id: inReplyToMessageId,
          reply_token: replyToken,
          rfc_message_id: rfcMessageId,
          // Persist the exact HTML we sent so inbox threads show reply
          // content instead of re-rendering the original campaign template.
          html_body: inlineHtml !== undefined ? htmlWithUnsubscribe : null,
        });
        inboxMessageId = recorded.message_id;
      } catch (e) {
        console.error('Failed to record inbox Message:', e);
      }
    }

    // Engagement reflects emails ACTUALLY sent — advance it only here, on
    // confirmed success (for both marketing and personal sends). The frequency
    // counter was advanced by the reservation above (non-personal only).
    await Subscriber.updateOne(
      { _id: subscriberId },
      { $inc: { 'engagement.emails_sent': 1 }, $set: { 'engagement.last_email_at': sentAt } },
    ).catch(() => { /* non-fatal: send already succeeded */ });

    return { success: true, messageId, inboxMessageId };
  } catch (error: any) {
    await rateLimiter.release(); // reserved a slot just before the throw
    if (!personalEmail) await releaseFrequencySlot(subscriberId);
    const errorMsg = error?.response?.body?.errors?.[0]?.message || error.message;
    console.error(viaSmtp ? 'SMTP error:' : 'SendGrid error:', errorMsg);
    if (viaSmtp && mailbox) await Mailbox.updateOne({ _id: mailbox._id }, { $set: { last_error: `SMTP: ${errorMsg}` } }).catch(() => {});
    await recordFailedEvent(eventBase, `${viaSmtp ? 'SMTP' : 'SendGrid'}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function recordFailedEvent(base: Record<string, any>, reason: string) {
  try {
    await EmailEvent.create({
      ...base,
      event: 'bounce',
      metadata: { reason },
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to record email failure event:', err);
  }
}

/**
 * Release a daily-frequency slot reserved by the atomic reservation in sendEmail,
 * used when the actual SendGrid call doesn't go out — so a failed send doesn't
 * consume the subscriber's cap for the day. Best-effort; guarded so the counter
 * never goes below zero.
 */
async function releaseFrequencySlot(subscriberId: string): Promise<void> {
  await Subscriber.updateOne(
    { _id: subscriberId, 'frequency.emails_sent_today': { $gt: 0 } },
    { $inc: { 'frequency.emails_sent_today': -1 } },
  ).catch(() => { /* best-effort */ });
}

export async function renderTemplate(templateId: string, variables: Record<string, any> = {}): Promise<string> {
  const template = await Template.findById(templateId);
  if (!template) throw new Error('Template not found');
  return Handlebars.compile(template.html_content)(variables);
}

/**
 * Add UPPERCASE and TitleCase aliases for every variable so {{email}}, {{EMAIL}},
 * and {{Email}} all resolve. Existing keys (incl. global vars) get their aliases
 * added too unless they're already defined in the original object.
 */
function withCaseAliases(vars: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...vars };
  for (const [k, v] of Object.entries(vars)) {
    const upper = k.toUpperCase();
    const title = k.replace(/(^|_)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
    if (!(upper in out)) out[upper] = v;
    if (!(title in out)) out[title] = v;
  }
  return out;
}

function resolveInboxSource(args: {
  campaignId?: string;
  oneOffSendId?: string;
  flowId?: string;
  flowNodeId?: string;
}): { source_type: MessageSourceType; source_id: string; flow_node_id?: string | null } | null {
  if (args.campaignId) {
    return { source_type: 'campaign', source_id: args.campaignId };
  }
  if (args.oneOffSendId) {
    return { source_type: 'one_off', source_id: args.oneOffSendId };
  }
  if (args.flowId && args.flowNodeId) {
    return { source_type: 'flow_step', source_id: args.flowId, flow_node_id: args.flowNodeId };
  }
  return null;
}
