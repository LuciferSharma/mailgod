import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { OneOffSend } from '../models/oneOffSend';
import { Subscriber } from '../models/subscriber';
import { Template } from '../models/template';
import { sendEmail } from '../services/emailService';
import { config } from '../config';
import { enqueueOneOff, queueSummary } from '../services/poolDispatcher';

const POOL_LIMIT = 2000;
const normMode = (m: any): 'default' | 'pool' | 'mailbox' => (m === 'pool' || m === 'mailbox' || m === 'default' ? m : 'pool');

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveRecipientIds(
  recipientIds: string[] = [],
  recipientEmails: string[] = []
): Promise<mongoose.Types.ObjectId[]> {
  const seen = new Set<string>();
  const ids: mongoose.Types.ObjectId[] = [];

  for (const id of recipientIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) continue;
    const sub = await Subscriber.findById(id);
    if (!sub) continue;
    const key = sub.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(sub._id as mongoose.Types.ObjectId);
  }

  for (const raw of recipientEmails) {
    const norm = String(raw).trim().toLowerCase();
    if (!norm || !EMAIL_RE.test(norm) || seen.has(norm)) continue;
    let sub = await Subscriber.findOne({ email: norm });
    if (!sub) {
      sub = await Subscriber.create({
        email: norm,
        name: '',
        status: 'active',
        signup_source: 'inbox_compose',
      });
    }
    seen.add(norm);
    ids.push(sub._id as mongoose.Types.ObjectId);
  }

  return ids;
}

router.get('/', async (req: Request, res: Response, next: Function) => {
  try {
    const status = req.query.status as string;
    const filter: any = {};
    if (status) filter.status = status;
    const sends = await OneOffSend.find(filter).sort({ created_at: -1 }).limit(100).lean();
    res.json(sends);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const send = await OneOffSend.findById(req.params.id).lean();
    if (!send) return res.status(404).json({ error: 'Not found' });
    const queue = send.sender_mode && send.sender_mode !== 'default' ? await queueSummary(send._id as mongoose.Types.ObjectId) : null;
    const recipients = send.recipient_ids?.length
      ? await Subscriber.find({ _id: { $in: send.recipient_ids } })
          .select('email name plan_tier tags status')
          .lean()
      : [];
    res.json({ ...send, recipients, queue });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req: Request, res: Response, next: Function) => {
  try {
    const {
      subject,
      html_body,
      template_id,
      from_address,
      recipient_ids = [],
      recipient_emails = [],
      cc = [],
      bcc = [],
      action,
      sender_mode,
      mailbox_ids = [],
      thread_followup = false,
      parent_one_off_id = null,
    } = req.body;
    const mode = normMode(sender_mode);
    const limit = mode === 'default' ? config.inboxOneOffLimit : POOL_LIMIT;
    if (!subject || (!html_body && !template_id)) {
      return res.status(400).json({ error: 'subject and (html_body or template_id) required' });
    }

    const resolvedIds = await resolveRecipientIds(recipient_ids, recipient_emails);
    if (resolvedIds.length > limit) {
      return res.status(400).json({
        error: `Too many recipients. Max ${limit} for ${mode === 'default' ? 'immediate one-off sends (use the sender pool or a Campaign for larger lists)' : 'pool sends'}.`,
      });
    }
    if (resolvedIds.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    let body = html_body || '';
    let resolvedSubject = subject;
    if (template_id) {
      const tmpl = await Template.findById(template_id);
      if (!tmpl) return res.status(400).json({ error: 'Template not found' });
      if (!html_body) body = tmpl.html_content;
      if (!subject) resolvedSubject = tmpl.subject;
    }

    const send = await OneOffSend.create({
      subject: resolvedSubject,
      html_body: body,
      template_id: template_id || null,
      from_address: from_address || config.fromEmail,
      cc_addresses: Array.isArray(cc) ? cc : [],
      bcc_addresses: Array.isArray(bcc) ? bcc : [],
      recipient_ids: resolvedIds,
      recipient_count: resolvedIds.length,
      sender_mode: mode,
      mailbox_ids: Array.isArray(mailbox_ids) ? mailbox_ids.filter((x: any) => mongoose.Types.ObjectId.isValid(x)) : [],
      thread_followup: !!thread_followup,
      parent_one_off_id: parent_one_off_id && mongoose.Types.ObjectId.isValid(parent_one_off_id) ? parent_one_off_id : null,
      status: action === 'send' ? 'sending' : 'draft',
      inbox_last_message_at: new Date(),
    });

    if (action === 'send') {
      // dispatch async
      dispatchOneOffSend((send._id as mongoose.Types.ObjectId).toString()).catch(err =>
        console.error('one-off dispatch error:', err)
      );
    }

    res.status(201).json(send);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const existing = await OneOffSend.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be edited' });

    const { subject, html_body, template_id, from_address, recipient_ids, recipient_emails, cc, bcc, sender_mode, mailbox_ids } = req.body;
    if (sender_mode !== undefined) existing.sender_mode = normMode(sender_mode);
    if (Array.isArray(mailbox_ids)) existing.mailbox_ids = mailbox_ids.filter((x: any) => mongoose.Types.ObjectId.isValid(x));
    const limit = existing.sender_mode === 'default' ? config.inboxOneOffLimit : POOL_LIMIT;

    if (recipient_ids !== undefined || recipient_emails !== undefined) {
      const resolvedIds = await resolveRecipientIds(
        Array.isArray(recipient_ids) ? recipient_ids : existing.recipient_ids.map(String),
        Array.isArray(recipient_emails) ? recipient_emails : []
      );
      if (resolvedIds.length > limit) {
        return res.status(400).json({
          error: `Too many recipients. Max ${limit}.`,
        });
      }
      existing.recipient_ids = resolvedIds;
      existing.recipient_count = resolvedIds.length;
    }
    if (subject !== undefined) existing.subject = subject;
    if (html_body !== undefined) existing.html_body = html_body;
    if (template_id !== undefined) existing.template_id = template_id;
    if (from_address !== undefined) existing.from_address = from_address;
    if (Array.isArray(cc)) existing.cc_addresses = cc;
    if (Array.isArray(bcc)) existing.bcc_addresses = bcc;
    await existing.save();
    res.json(existing);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const existing = await OneOffSend.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'sending') return res.status(400).json({ error: 'Cannot delete a send in progress' });
    await existing.deleteOne();
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Schedule a draft for a future send. The hosted server's cron (one_off_processor,
// runs every minute) dispatches it when scheduled_at arrives — no client needs to
// stay online. Atomic draft→scheduled so a concurrent send/schedule can't race.
router.post('/:id/schedule', async (req: Request, res: Response, next: Function) => {
  try {
    const { scheduled_at } = req.body;
    const when = scheduled_at ? new Date(scheduled_at) : null;
    if (!when || isNaN(when.getTime()) || when <= new Date()) {
      return res.status(400).json({ error: 'scheduled_at must be a valid future date/time (ISO 8601)' });
    }
    const send = await OneOffSend.findOneAndUpdate(
      { _id: req.params.id, status: 'draft' },
      { $set: { status: 'scheduled', scheduled_at: when } },
      { new: true }
    );
    if (!send) return res.status(409).json({ error: 'Only drafts can be scheduled' });
    res.json({ success: true, send });
  } catch (e) {
    next(e);
  }
});

// Cancel a scheduled send back to draft (only while still scheduled — once the
// cron has claimed it to 'sending' it can no longer be stopped).
router.post('/:id/unschedule', async (req: Request, res: Response, next: Function) => {
  try {
    const send = await OneOffSend.findOneAndUpdate(
      { _id: req.params.id, status: 'scheduled' },
      { $set: { status: 'draft', scheduled_at: null } },
      { new: true }
    );
    if (!send) return res.status(409).json({ error: 'Send is not scheduled (already sent, sending, or draft)' });
    res.json({ success: true, send });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/send', async (req: Request, res: Response, next: Function) => {
  try {
    const send = await OneOffSend.findOneAndUpdate(
      { _id: req.params.id, status: 'draft' },
      { $set: { status: 'sending' } },
      { new: true }
    );
    if (!send) return res.status(409).json({ error: 'Send is not in draft status' });

    dispatchOneOffSend((send._id as mongoose.Types.ObjectId).toString()).catch(err =>
      console.error('one-off dispatch error:', err)
    );

    res.json({ success: true, send });
  } catch (e) {
    next(e);
  }
});

export async function dispatchOneOffSend(sendId: string): Promise<void> {
  const send = await OneOffSend.findById(sendId);
  if (!send) return;

  // Sender-pool sends are paced by the mailbox pool processor, not blasted here.
  if (send.sender_mode && send.sender_mode !== 'default') {
    const n = await enqueueOneOff(sendId);
    console.log(`[one-off] ${sendId} queued ${n} recipients for the sender pool`);
    return;
  }

  const subscribers = await Subscriber.find({ _id: { $in: send.recipient_ids } });
  let sentCount = 0;
  let skippedCap = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      const result = await sendEmail({
        subscriberId: (sub._id as mongoose.Types.ObjectId).toString(),
        inlineSubject: send.subject,
        inlineHtml: send.html_body,
        oneOffSendId: sendId,
        cc: send.cc_addresses,
        bcc: send.bcc_addresses,
      });
      if (result.success) {
        sentCount++;
      } else if (result.error?.toLowerCase().includes('frequency cap')) {
        skippedCap++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('one-off send error for subscriber', sub._id, err);
      failed++;
    }
  }

  await OneOffSend.findByIdAndUpdate(sendId, {
    $set: {
      status: failed === subscribers.length ? 'failed' : 'sent',
      sent_at: new Date(),
      'send_summary.sent': sentCount,
      'send_summary.skipped_frequency_cap': skippedCap,
      'send_summary.failed': failed,
      recipient_count: sentCount + skippedCap + failed,
      inbox_last_message_at: new Date(),
    },
  });
}

/**
 * Claim + dispatch all due scheduled one-off sends. Called by the cron scheduler
 * every minute. The claim (scheduled→sending) is a single findOneAndUpdate, so
 * even multiple server instances can never double-dispatch the same send.
 */
export async function processDueOneOffSends(maxPerRun = 50): Promise<{ dispatched: number; failed: number }> {
  const now = new Date();
  let dispatched = 0;
  let failed = 0;

  for (let i = 0; i < maxPerRun; i++) {
    const send = await OneOffSend.findOneAndUpdate(
      { status: 'scheduled', scheduled_at: { $lte: now } },
      { $set: { status: 'sending' } },
      { new: true, sort: { scheduled_at: 1 } }
    );
    if (!send) break;
    try {
      await dispatchOneOffSend((send._id as mongoose.Types.ObjectId).toString());
      dispatched++;
    } catch (err) {
      failed++;
      console.error('[one_off_processor] dispatch failed for', send._id, err);
      await OneOffSend.findByIdAndUpdate(send._id, { $set: { status: 'failed' } }).catch(() => {});
    }
  }

  return { dispatched, failed };
}

export { router as oneOffSendRoutes };
