import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Mailbox, DEFAULT_RAMP } from '../models/mailbox';
import { Message } from '../models/message';
import { Subscriber } from '../models/subscriber';
import { SendQueueItem } from '../models/sendQueueItem';
import { OneOffSend } from '../models/oneOffSend';
import { encryptSecret } from '../services/mailboxCrypto';
import { ensureSendgridMailbox, mailboxSummary, testMailbox } from '../services/mailboxService';
import { pollMailbox } from '../services/imapPoller';
import { processPoolQueue, queueSummary } from '../services/poolDispatcher';

const router = Router();
const EDITABLE = ['display_name', 'smtp_host', 'smtp_port', 'smtp_secure', 'imap_host', 'imap_port', 'include_in_pool', 'drop_footer',
  'daily_cap', 'ramp', 'warmup_started_at', 'send_window', 'gap_min_sec', 'gap_max_sec', 'auto_pause'];

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    await ensureSendgridMailbox();
    const boxes = await Mailbox.find({}).sort({ kind: 1, created_at: 1 });
    res.json(await Promise.all(boxes.map(mailboxSummary)));
  } catch (e) { next(e); }
});

router.get('/pool/summary', async (_req: Request, res: Response, next: Function) => {
  try {
    const byStatus = await SendQueueItem.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const status: Record<string, number> = { queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0 };
    byStatus.forEach(r => { status[r._id] = r.n; });
    const active = await OneOffSend.find({ sender_mode: { $in: ['pool', 'mailbox'] }, status: { $in: ['sending', 'sent', 'failed'] } })
      .sort({ created_at: -1 }).limit(20).select('subject status created_at sent_at recipient_count sender_mode mailbox_ids').lean();
    const sends = await Promise.all(active.map(async s => ({ ...s, queue: await queueSummary(s._id as mongoose.Types.ObjectId) })));
    res.json({ status, sends });
  } catch (e) { next(e); }
});

router.post('/pool/tick', async (req: Request, res: Response, next: Function) => {
  try {
    const r = await processPoolQueue({ ignoreWindow: !!req.body?.ignore_window, maxPerMailbox: Number(req.body?.max_per_mailbox) || 1 });
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/', async (req: Request, res: Response, next: Function) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });
    if (!b.password) return res.status(400).json({ error: 'password required' });
    if (await Mailbox.findOne({ email })) return res.status(409).json({ error: 'Mailbox already exists' });
    const mb = await Mailbox.create({
      kind: 'smtp',
      email,
      display_name: b.display_name || email.split('@')[0],
      domain: email.split('@')[1],
      smtp_host: b.smtp_host || `smtp.${email.split('@')[1]}`,
      smtp_port: Number(b.smtp_port) || 465,
      smtp_secure: b.smtp_secure !== false,
      imap_host: b.imap_host || `imap.${email.split('@')[1]}`,
      imap_port: Number(b.imap_port) || 993,
      password_enc: encryptSecret(String(b.password)),
      daily_cap: Number(b.daily_cap) || 30,
      ramp: Array.isArray(b.ramp) && b.ramp.length ? b.ramp.map(Number) : DEFAULT_RAMP,
      warmup_started_at: b.warmup_started_at ? new Date(b.warmup_started_at) : new Date(),
      send_window: b.send_window || undefined,
      gap_min_sec: Number(b.gap_min_sec) || 150,
      gap_max_sec: Number(b.gap_max_sec) || 420,
      include_in_pool: b.include_in_pool !== false,
      drop_footer: b.drop_footer !== false,
      auto_pause: b.auto_pause || undefined,
      status: 'active',
    });
    // Start IMAP from "now": don't ingest the mailbox's historical inbox.
    const test = b.skip_test ? null : await testMailbox(mb);
    res.status(201).json({ ...(await mailboxSummary(mb)), test });
  } catch (e) { next(e); }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findById(req.params.id);
    if (!mb) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    for (const k of EDITABLE) {
      if (b[k] === undefined) continue;
      if (k === 'ramp') (mb as any).ramp = Array.isArray(b.ramp) ? b.ramp.map(Number).filter((n: number) => n > 0) : mb.ramp;
      else if (k === 'warmup_started_at') mb.warmup_started_at = b[k] ? new Date(b[k]) : null;
      else (mb as any)[k] = b[k];
    }
    if (b.password) mb.password_enc = encryptSecret(String(b.password));
    if (b.status === 'active' || b.status === 'paused') {
      mb.status = b.status;
      mb.paused_reason = b.status === 'paused' ? (b.paused_reason || 'Paused manually') : null;
    }
    await mb.save();
    res.json(await mailboxSummary(mb));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findById(req.params.id);
    if (!mb) return res.status(404).json({ error: 'Not found' });
    if (mb.kind === 'sendgrid') return res.status(400).json({ error: 'The SendGrid sender cannot be deleted' });
    await mb.deleteOne();
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/test', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findById(req.params.id);
    if (!mb) return res.status(404).json({ error: 'Not found' });
    res.json(await testMailbox(mb));
  } catch (e) { next(e); }
});

router.post('/:id/pause', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findByIdAndUpdate(req.params.id, { $set: { status: 'paused', paused_reason: req.body?.reason || 'Paused manually' } }, { new: true });
    if (!mb) return res.status(404).json({ error: 'Not found' });
    res.json(await mailboxSummary(mb));
  } catch (e) { next(e); }
});

router.post('/:id/resume', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findByIdAndUpdate(req.params.id, { $set: { status: 'active', paused_reason: null, last_error: null } }, { new: true });
    if (!mb) return res.status(404).json({ error: 'Not found' });
    res.json(await mailboxSummary(mb));
  } catch (e) { next(e); }
});

router.post('/:id/poll', async (req: Request, res: Response, next: Function) => {
  try {
    const mb = await Mailbox.findById(req.params.id);
    if (!mb) return res.status(404).json({ error: 'Not found' });
    if (mb.kind !== 'smtp') return res.status(400).json({ error: 'Only SMTP mailboxes have an inbox to poll' });
    res.json(await pollMailbox(mb));
  } catch (e) { next(e); }
});

router.get('/:id/messages', async (req: Request, res: Response, next: Function) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const msgs = await Message.find({ mailbox_id: req.params.id }).sort({ created_at: -1 }).limit(limit)
      .select('direction subscriber_id to_address from_address subject_override sent_at received_at status_summary source_type source_id is_auto_reply flow_node_id').lean();
    const subs = await Subscriber.find({ _id: { $in: msgs.map(m => m.subscriber_id) } }).select('email name').lean();
    const subMap = new Map(subs.map(s => [s._id.toString(), s]));
    res.json(msgs.map(m => ({ ...m, subscriber: subMap.get(m.subscriber_id.toString()) || null })));
  } catch (e) { next(e); }
});

export { router as mailboxRoutes };
