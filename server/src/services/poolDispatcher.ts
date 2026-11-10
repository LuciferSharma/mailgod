import mongoose from 'mongoose';
import { Mailbox, IMailbox } from '../models/mailbox';
import { SendQueueItem } from '../models/sendQueueItem';
import { OneOffSend } from '../models/oneOffSend';
import { Message } from '../models/message';
import { sendEmail } from './emailService';
import { allowanceToday, sentToday, inSendWindow, checkAutoPause, autoResumeMailboxes } from './mailboxService';

/**
 * Put every recipient of a pool-mode one-off on the queue. The one-off stays in
 * 'sending' until the last item is done (see finalizeIfDone).
 */
export async function enqueueOneOff(sendId: string): Promise<number> {
  const send = await OneOffSend.findById(sendId);
  if (!send) return 0;
  const allowed = (send.mailbox_ids || []) as mongoose.Types.ObjectId[];
  const existing = new Set((await SendQueueItem.find({ one_off_send_id: send._id }).select('subscriber_id').lean()).map(i => i.subscriber_id.toString()));
  const docs: any[] = [];
  for (const id of send.recipient_ids) {
    if (existing.has(id.toString())) continue;
    let allow = allowed;
    if (send.thread_followup) {
      // Follow-ups must leave from the mailbox that started the thread.
      const last = await lastOutboundFor(id, send.parent_one_off_id);
      if (last?.mailbox_id) allow = [last.mailbox_id as mongoose.Types.ObjectId];
    }
    docs.push({ one_off_send_id: send._id, subscriber_id: id, allowed_mailbox_ids: allow, status: 'queued' });
  }
  if (docs.length) await SendQueueItem.insertMany(docs);
  await OneOffSend.updateOne({ _id: send._id }, { $set: { status: 'sending', inbox_last_message_at: new Date() } });
  return docs.length;
}

export async function queueSummary(sendId: mongoose.Types.ObjectId | string) {
  const rows = await SendQueueItem.aggregate([
    { $match: { one_off_send_id: new mongoose.Types.ObjectId(sendId.toString()) } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const s: Record<string, number> = { queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0 };
  rows.forEach(r => { s[r._id] = r.n; });
  return s;
}

async function finalizeIfDone(sendId: mongoose.Types.ObjectId) {
  const s = await queueSummary(sendId);
  if (s.queued + s.sending > 0) return;
  const total = s.sent + s.skipped + s.failed;
  await OneOffSend.updateOne({ _id: sendId }, {
    $set: {
      status: total > 0 && s.sent === 0 ? 'failed' : 'sent',
      sent_at: new Date(),
      'send_summary.sent': s.sent,
      'send_summary.skipped_frequency_cap': s.skipped,
      'send_summary.failed': s.failed,
      recipient_count: total,
      inbox_last_message_at: new Date(),
    },
  });
}

function randGap(mb: IMailbox): number {
  const lo = Math.max(10, mb.gap_min_sec ?? 150);
  const hi = Math.max(lo, mb.gap_max_sec ?? 420);
  return lo + Math.random() * (hi - lo);
}

/**
 * One tick (runs every minute). For each eligible mailbox: at most one queued
 * item is sent, then the mailbox's next_allowed_at is pushed out by a random gap.
 * Eligibility = active, inside its send window, allowance left, gap elapsed.
 */
let tickRunning: Promise<{ sent: number; skipped: number; failed: number; idle: number }> | null = null;

export function processPoolQueue(opts: { ignoreWindow?: boolean; maxPerMailbox?: number } = {}): Promise<{ sent: number; skipped: number; failed: number; idle: number }> {
  if (tickRunning) return tickRunning; // cron tick and "Send next now" must not overlap
  tickRunning = processPoolQueueInner(opts).finally(() => { tickRunning = null; });
  return tickRunning;
}

async function processPoolQueueInner(opts: { ignoreWindow?: boolean; maxPerMailbox?: number }): Promise<{ sent: number; skipped: number; failed: number; idle: number }> {
  const out = { sent: 0, skipped: 0, failed: 0, idle: 0 };
  const now = new Date();
  await autoResumeMailboxes();
  const boxes = await Mailbox.find({ status: 'active' });
  for (const mb of boxes) {
    if (!opts.ignoreWindow && !inSendWindow(mb, now)) { out.idle++; continue; }
    if (!opts.ignoreWindow && mb.next_allowed_at && mb.next_allowed_at > now) { out.idle++; continue; }
    const remaining = allowanceToday(mb, now) - (await sentToday(mb, now));
    if (remaining <= 0) { out.idle++; continue; }
    if (await checkAutoPause(mb)) { out.idle++; continue; }

    const perBox = Math.max(1, Math.min(opts.maxPerMailbox ?? 1, remaining));
    for (let i = 0; i < perBox; i++) {
      const item = await SendQueueItem.findOneAndUpdate(
        { status: 'queued', $or: [{ allowed_mailbox_ids: { $size: 0 } }, { allowed_mailbox_ids: mb._id }] },
        { $set: { status: 'sending', mailbox_id: mb._id }, $inc: { attempts: 1 } },
        { new: true, sort: { created_at: 1 } }
      );
      if (!item) { out.idle++; break; }
      const send = await OneOffSend.findById(item.one_off_send_id);
      if (!send) {
        await SendQueueItem.updateOne({ _id: item._id }, { $set: { status: 'failed', error: 'one-off missing' } });
        continue;
      }
      let result: { success: boolean; error?: string };
      try {
        const args: any = {
          subscriberId: item.subscriber_id.toString(),
          inlineSubject: send.subject,
          inlineHtml: send.html_body,
          oneOffSendId: send._id.toString(),
          cc: send.cc_addresses,
          bcc: send.bcc_addresses,
          mailboxId: (mb._id as mongoose.Types.ObjectId).toString(),
          enforceMailboxCap: true,
        };
        if (send.thread_followup) {
          // Reply in the original conversation: same source (so the inbox shows one thread),
          // RFC threading headers, and "Re:" + the original subject.
          const last = await lastOutboundFor(item.subscriber_id, send.parent_one_off_id);
          if (last) {
            if (last.source_type === 'one_off') args.oneOffSendId = last.source_id.toString();
            else if (last.source_type === 'campaign') { delete args.oneOffSendId; args.campaignId = last.source_id.toString(); }
            args.inReplyToMessageId = last._id.toString();
            args.inReplyToRfcId = last.rfc_message_id || null;
            const base = last.subject_override || send.subject;
            args.subjectOverride = /^re:/i.test(base) ? base : `Re: ${base}`;
          }
        }
        result = await sendEmail(args);
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
      const err = (result.error || '').toLowerCase();
      if (result.success) {
        out.sent++;
        await SendQueueItem.updateOne({ _id: item._id }, { $set: { status: 'sent', sent_at: new Date(), error: null } });
      } else if (err.includes('allowance')) {
        // mailbox exhausted mid-tick: hand the item back for another sender
        await SendQueueItem.updateOne({ _id: item._id }, { $set: { status: 'queued', mailbox_id: null } });
        break;
      } else if (err.includes('frequency cap') || err.includes('subscriber status') || err.includes('not found')) {
        out.skipped++;
        await SendQueueItem.updateOne({ _id: item._id }, { $set: { status: 'skipped', error: result.error } });
      } else {
        out.failed++;
        await SendQueueItem.updateOne({ _id: item._id }, { $set: { status: 'failed', error: result.error } });
      }
      await Mailbox.updateOne({ _id: mb._id }, { $set: { next_allowed_at: new Date(Date.now() + randGap(mb) * 1000) } });
      await finalizeIfDone(send._id as mongoose.Types.ObjectId);
    }
  }
  return out;
}

/** Latest outbound message to this subscriber (preferring the parent one-off's thread). */
async function lastOutboundFor(subscriberId: mongoose.Types.ObjectId, parentOneOffId: mongoose.Types.ObjectId | null) {
  if (parentOneOffId) {
    const m = await Message.findOne({ subscriber_id: subscriberId, direction: 'outbound', source_type: 'one_off', source_id: parentOneOffId }).sort({ sent_at: -1 });
    if (m) return m;
  }
  return Message.findOne({ subscriber_id: subscriberId, direction: 'outbound' }).sort({ sent_at: -1 });
}
