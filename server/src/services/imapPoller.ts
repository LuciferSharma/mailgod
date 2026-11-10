import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import mongoose from 'mongoose';
import { Mailbox, IMailbox } from '../models/mailbox';
import { Message, IMessage } from '../models/message';
import { Subscriber } from '../models/subscriber';
import { config } from '../config';
import { imapClient, allMailboxEmails, checkAutoPause } from './mailboxService';
import { ingestInboundReply, recordBounce } from './inboundIngest';

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery|delivery status/i;
const BOUNCE_SUBJ = /undeliver|delivery (status|failure|has failed)|failure notice|returned mail|not delivered|address not found|delivery incomplete|rejected/i;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

function addrList(a?: AddressObject | AddressObject[]): string[] {
  const arr = Array.isArray(a) ? a : a ? [a] : [];
  return arr.flatMap(x => x.value.map(v => (v.address || '').toLowerCase()).filter(Boolean));
}

function headerMap(parsed: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  parsed.headerLines.forEach(h => { out[h.key.toLowerCase()] = h.line.slice(h.line.indexOf(':') + 1).trim(); });
  if (parsed.messageId) out['message-id'] = parsed.messageId;
  if (parsed.inReplyTo) out['in-reply-to'] = parsed.inReplyTo;
  return out;
}

/** Tokens of our own Message-IDs (<token@domain>) found in a header/text blob. */
function ourTokens(blob: string, domains: string[]): string[] {
  const out: string[] = [];
  const re = /<([A-Za-z0-9_-]{6,16})@([A-Za-z0-9.-]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) if (domains.includes(m[2].toLowerCase())) out.push(m[1]);
  return out;
}

async function findOutboundByTokens(tokens: string[]): Promise<IMessage | null> {
  for (const t of tokens) {
    const m = await Message.findOne({ reply_token: t, direction: 'outbound' });
    if (m) return m;
  }
  return null;
}

// One poll per mailbox at a time (cron tick and "Poll now" can overlap; a second
// concurrent poll would fetch the same UIDs before the cursor advances).
const polling = new Map<string, Promise<{ fetched: number; replies: number; bounces: number; other: number }>>();

export function pollMailbox(mb: IMailbox): Promise<{ fetched: number; replies: number; bounces: number; other: number }> {
  const key = (mb._id as mongoose.Types.ObjectId).toString();
  const running = polling.get(key);
  if (running) return running;
  const p = pollMailboxInner(mb).finally(() => polling.delete(key));
  polling.set(key, p);
  return p;
}

async function pollMailboxInner(mb: IMailbox): Promise<{ fetched: number; replies: number; bounces: number; other: number }> {
  const res = { fetched: 0, replies: 0, bounces: 0, other: 0 };
  const ours = await allMailboxEmails();
  const ourDomains = [mb.domain.toLowerCase(), config.replyDomain.toLowerCase()];
  const client = imapClient(mb);
  let lastUid = mb.imap_last_uid || 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidValidity = Number((client.mailbox as any)?.uidValidity || 0);
      if (mb.imap_uidvalidity && uidValidity && uidValidity !== mb.imap_uidvalidity) lastUid = 0;
      const range = `${lastUid + 1}:*`;
      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid) continue;
        res.fetched++;
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const kind = await handleInbound(mb, parsed, ours, ourDomains);
          res[kind]++;
        } catch (e: any) {
          console.error(`[imap ${mb.email}] uid ${msg.uid} failed:`, e.message);
          res.other++;
        }
        lastUid = msg.uid;
        await Mailbox.updateOne({ _id: mb._id }, { $set: { imap_last_uid: lastUid, imap_uidvalidity: uidValidity || mb.imap_uidvalidity } });
      }
      await Mailbox.updateOne({ _id: mb._id }, { $set: { imap_last_polled_at: new Date(), last_error: null, imap_uidvalidity: uidValidity || mb.imap_uidvalidity } });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e: any) {
    await Mailbox.updateOne({ _id: mb._id }, { $set: { last_error: `IMAP: ${e.message}` } });
    try { await client.logout(); } catch { /* ignore */ }
    throw e;
  }
  return res;
}

async function handleInbound(mb: IMailbox, parsed: ParsedMail, ours: Set<string>, ourDomains: string[]): Promise<'replies' | 'bounces' | 'other'> {
  const from = addrList(parsed.from)[0] || '';
  const subject = parsed.subject || '';
  const text = parsed.text || '';
  const html = typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml || '');
  const headers = headerMap(parsed);
  const ctype = (parsed.headers.get('content-type') as any)?.value || '';

  // Idempotency: never ingest the same inbound RFC message twice.
  if (parsed.messageId && await Message.exists({ direction: 'inbound', rfc_message_id: parsed.messageId })) return 'other';

  // --- Delivery status notifications (bounces) ------------------------------
  const isDsn = ctype === 'multipart/report' || BOUNCE_FROM.test(from) || BOUNCE_FROM.test(parsed.from?.text || '') || BOUNCE_SUBJ.test(subject);
  if (isDsn) {
    let dsnText = text;
    let failed: string | null = null;
    let tokenBlob = `${headers['in-reply-to'] || ''} ${headers['references'] || ''} ${text}`;
    for (const att of parsed.attachments || []) {
      const body = att.content?.toString('utf8') || '';
      if (att.contentType === 'message/delivery-status') {
        dsnText += '\n' + body;
        const r = body.match(/(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s>]+)/i);
        if (r) failed = r[1].toLowerCase();
      }
      if (att.contentType === 'message/rfc822' || att.contentType === 'text/rfc822-headers') tokenBlob += '\n' + body;
    }
    if (!failed) {
      const cands = (dsnText.match(EMAIL_RE) || []).map(e => e.toLowerCase()).filter(e => !ours.has(e) && !/mailer-daemon|postmaster/.test(e) && !e.endsWith('@' + mb.domain));
      failed = cands[0] || null;
    }
    let outbound = await findOutboundByTokens(ourTokens(tokenBlob, ourDomains));
    if (!outbound && failed) {
      outbound = await Message.findOne({ mailbox_id: mb._id, direction: 'outbound', to_address: failed }).sort({ sent_at: -1 });
    }
    const subscriberId = outbound?.subscriber_id || (failed ? (await Subscriber.findOne({ email: failed }).select('_id'))?._id : null);
    if (!subscriberId) {
      console.warn(`[imap ${mb.email}] bounce-like mail, no match: from=${from} subj=${subject.slice(0, 60)}`);
      return 'other';
    }
    const diag = (dsnText.match(/Diagnostic-Code:\s*(.+)/i)?.[1] || dsnText.match(/Status:\s*(\d\.\d+\.\d+)/i)?.[0] || subject).trim();
    if (outbound && outbound.status_summary === 'bounced') return 'other'; // already recorded for this send
    await recordBounce({ subscriberId, mailboxId: mb._id as mongoose.Types.ObjectId, outbound, reason: diag });
    console.log(`[imap ${mb.email}] BOUNCE ${failed || subscriberId}: ${diag.slice(0, 80)}`);
    await checkAutoPause(mb);
    return 'bounces';
  }

  // --- Our own mailboxes / reply domain (loop guard) -------------------------
  if (!from || ours.has(from) || from.endsWith('@' + config.replyDomain.toLowerCase())) return 'other';

  // --- Replies: thread via our Message-ID token, then rfc id, then sender -----
  let outbound = await findOutboundByTokens(ourTokens(`${headers['in-reply-to'] || ''} ${headers['references'] || ''}`, ourDomains));
  if (!outbound && parsed.inReplyTo) outbound = await Message.findOne({ rfc_message_id: parsed.inReplyTo, direction: 'outbound' });
  if (!outbound) {
    const since = new Date(Date.now() - 90 * 86_400_000);
    outbound = await Message.findOne({ mailbox_id: mb._id, direction: 'outbound', to_address: from, sent_at: { $gte: since } }).sort({ sent_at: -1 });
  }
  if (!outbound) {
    console.log(`[imap ${mb.email}] unmatched mail from=${from} subj=${subject.slice(0, 60)}`);
    return 'other';
  }
  await ingestInboundReply({
    outbound,
    toAddress: mb.email,
    fromAddress: parsed.from?.text || from,
    ccAddresses: addrList(parsed.cc),
    subject,
    textBody: text,
    htmlBody: html,
    rawBody: text,
    headers,
    logTag: `imap ${mb.email}`,
  });
  return 'replies';
}

export async function pollAllMailboxes(): Promise<{ mailboxes: number; fetched: number; replies: number; bounces: number; errors: number }> {
  const out = { mailboxes: 0, fetched: 0, replies: 0, bounces: 0, errors: 0 };
  const boxes = await Mailbox.find({ kind: 'smtp', imap_host: { $ne: '' } });
  for (const mb of boxes) {
    out.mailboxes++;
    try {
      const r = await pollMailbox(mb);
      out.fetched += r.fetched; out.replies += r.replies; out.bounces += r.bounces;
    } catch (e: any) {
      out.errors++;
      console.error(`[imap ${mb.email}] poll failed:`, e.message);
    }
  }
  return out;
}
