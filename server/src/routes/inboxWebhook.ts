import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Message } from '../models/message';
import { Subscriber } from '../models/subscriber';
import { EmailEvent } from '../models/emailEvent';
import { applyEngagementEvent } from '../services/engagementScorer';
import { extractReplyToken } from '../utils/replyParser';
import { ingestInboundReply } from '../services/inboundIngest';
import { allMailboxEmails } from '../services/mailboxService';
import { config } from '../config';

const router = Router();
const upload = multer();

router.post('/sendgrid-inbound', upload.any(), async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};

    const toRaw = (body.to || body.envelope || '').toString();
    let toAddress = toRaw;
    if (toRaw.startsWith('{')) {
      try {
        const env = JSON.parse(toRaw);
        if (Array.isArray(env.to)) toAddress = env.to[0];
      } catch {
        /* ignore */
      }
    }

    const fromAddress = (body.from || '').toString();
    const subject = (body.subject || '').toString();

    // Some clients drop the "reply+" prefix and send to "<token>@reply.domain".
    const bareToken = (addr: string): string | null => {
      const m = String(addr || '').match(/<?([A-Za-z0-9_-]{6,16})@([A-Za-z0-9.-]+)>?/);
      return m && m[2].toLowerCase() === config.replyDomain.toLowerCase() && m[1].toLowerCase() !== 'reply' ? m[1] : null;
    };
    const token = extractReplyToken(toAddress) || extractReplyToken(body.envelope || '') || bareToken(toAddress);

    // Footer unsubscribe: "mailto:reply@reply.domain?subject=unsubscribe <subscriberId>"
    if (!token) {
      const unsub = subject.match(/unsubscribe\s*[:\-]?\s*([a-f0-9]{24})/i);
      if (unsub) {
        const sub = await Subscriber.findById(unsub[1]);
        if (sub && sub.status === 'active') {
          await Subscriber.updateOne({ _id: sub._id }, { $set: { status: 'unsubscribed' }, $addToSet: { tags: 'opted-out' } });
          await EmailEvent.create({ subscriber_id: sub._id, sendgrid_message_id: '', event: 'unsubscribe', metadata: { reason: 'mailto unsubscribe' }, timestamp: new Date() }).catch(() => {});
          await applyEngagementEvent(sub._id.toString(), 'unsubscribe');
          console.log('[sendgrid-inbound] unsubscribe honoured for', sub.email);
          return res.status(200).json({ received: true, unsubscribed: sub.email });
        }
      }
      console.warn('[sendgrid-inbound] no reply token in to=', toAddress, 'subject=', subject.slice(0, 60));
      return res.status(200).json({ received: true, error: 'no_token' });
    }
    const textBody = (body.text || '').toString();
    const htmlBody = (body.html || '').toString();
    const rawBody = (body.email || '').toString() || textBody;
    const headers = parseHeaders(body.headers);

    const ccRaw = (body.cc || '').toString();
    const ccAddresses = ccRaw ? ccRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    // Loop guard: drop if from address belongs to our reply domain or any of our senders
    const fromAddrOnly = extractEmailAddress(fromAddress).toLowerCase();
    const replyDomain = config.replyDomain.toLowerCase();
    const ours = await allMailboxEmails();
    if (fromAddrOnly.endsWith(`@${replyDomain}`) || fromAddrOnly === config.fromEmail.toLowerCase() || ours.has(fromAddrOnly)) {
      console.warn('[sendgrid-inbound] dropping likely loop from=', fromAddrOnly);
      return res.status(200).json({ received: true, error: 'loop' });
    }

    // Ticketing systems and Outlook lowercase the address; tokens are case-sensitive base64url.
    const outbound = (await Message.findOne({ reply_token: token }))
      || (await Message.findOne({ reply_token: { $regex: `^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, direction: 'outbound' }));
    if (!outbound) {
      console.warn('[sendgrid-inbound] orphan reply, token=', token);
      return res.status(200).json({ received: true, error: 'orphan' });
    }

    const { inbound } = await ingestInboundReply({
      outbound,
      toAddress,
      fromAddress,
      ccAddresses,
      subject,
      textBody,
      htmlBody,
      rawBody,
      headers,
      logTag: 'sendgrid-inbound',
    });

    res.status(200).json({ received: true, message_id: inbound._id });
  } catch (error: any) {
    console.error('[sendgrid-inbound] error:', error);
    // Always 200 so SendGrid doesn't retry forever
    res.status(200).json({ received: true, error: 'internal' });
  }
});

function parseHeaders(raw: any): Record<string, string> {
  if (!raw) return {};
  const text = typeof raw === 'string' ? raw : '';
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function extractEmailAddress(s: string): string {
  if (!s) return '';
  const m = s.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return s.trim();
}

export { router as inboxWebhookRoutes };
