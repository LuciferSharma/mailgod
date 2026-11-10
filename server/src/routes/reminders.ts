import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { InboxReminder } from '../models/inboxReminder';
import { Subscriber } from '../models/subscriber';
import { Campaign } from '../models/campaign';
import { OneOffSend } from '../models/oneOffSend';
import { FlowStepConversation } from '../models/flowStepConversation';
import { Flow } from '../models/flow';

const router = Router();

// Same single-user ADMIN_USER_ID pattern used by inbox routes
const ADMIN_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');
function getUserId(_req: Request): mongoose.Types.ObjectId { return ADMIN_USER_ID; }

/**
 * POST /api/reminders
 * Body for conversation target:
 *   { target_kind: 'conversation', conversation_type, conversation_id, flow_node_id?, remind_at, note? }
 * Body for subscriber target:
 *   { target_kind: 'subscriber', subscriber_id, remind_at, note? }
 */
router.post('/', async (req: Request, res: Response, next: Function) => {
  try {
    const { target_kind, conversation_type, conversation_id, flow_node_id, subscriber_id, remind_at, note } = req.body || {};
    if (!target_kind || !remind_at) return res.status(400).json({ error: 'target_kind + remind_at required' });

    const userId = getUserId(req);
    const doc: any = {
      user_id: userId,
      target_kind,
      remind_at: new Date(remind_at),
      note: note || null,
    };

    if (target_kind === 'conversation') {
      if (!conversation_type || !conversation_id) {
        return res.status(400).json({ error: 'conversation_type + conversation_id required' });
      }
      doc.conversation_type = conversation_type;
      doc.conversation_id = conversation_id;
      doc.flow_node_id = flow_node_id || null;
    } else if (target_kind === 'subscriber') {
      if (!subscriber_id) return res.status(400).json({ error: 'subscriber_id required' });
      doc.subscriber_id = subscriber_id;
    } else {
      return res.status(400).json({ error: 'Invalid target_kind' });
    }

    const created = await InboxReminder.create(doc);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/reminders
 * Returns active (non-dismissed) reminders for the current user with the
 * referenced target enriched (conversation subject OR subscriber email/name).
 *
 * Query params:
 *   includeDismissed=true  → include dismissed
 *   kind=conversation|subscriber → filter to one target type
 */
router.get('/', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const includeDismissed = req.query.includeDismissed === 'true';
    const kindFilter = req.query.kind as string | undefined;

    const filter: any = { user_id: userId };
    if (!includeDismissed) filter.dismissed = false;
    if (kindFilter === 'conversation' || kindFilter === 'subscriber') filter.target_kind = kindFilter;

    const reminders = await InboxReminder.find(filter).sort({ remind_at: 1 }).lean();

    // Batch-resolve targets
    const subIds = reminders.filter(r => r.target_kind === 'subscriber' && r.subscriber_id).map(r => r.subscriber_id);
    const subs = subIds.length ? await Subscriber.find({ _id: { $in: subIds } }).select('email name').lean() : [];
    const subMap = new Map(subs.map(s => [(s._id as any).toString(), s]));

    const campaignIds = reminders.filter(r => r.target_kind === 'conversation' && r.conversation_type === 'campaign').map(r => r.conversation_id);
    const campaigns = campaignIds.length ? await Campaign.find({ _id: { $in: campaignIds } }).select('name subject').lean() : [];
    const campaignMap = new Map(campaigns.map(c => [(c._id as any).toString(), c]));

    const oneOffIds = reminders.filter(r => r.target_kind === 'conversation' && r.conversation_type === 'one_off').map(r => r.conversation_id);
    const oneOffs = oneOffIds.length ? await OneOffSend.find({ _id: { $in: oneOffIds } }).select('subject').lean() : [];
    const oneOffMap = new Map(oneOffs.map(o => [(o._id as any).toString(), o]));

    const flowIds = reminders.filter(r => r.target_kind === 'conversation' && r.conversation_type === 'flow_step').map(r => r.conversation_id);
    const flows = flowIds.length ? await Flow.find({ _id: { $in: flowIds } }).select('name').lean() : [];
    const flowMap = new Map(flows.map(f => [(f._id as any).toString(), f]));

    const data = reminders.map(r => {
      let target_label = '';
      let target_link: string | null = null;
      if (r.target_kind === 'subscriber' && r.subscriber_id) {
        const sub: any = subMap.get(r.subscriber_id.toString());
        target_label = sub ? (sub.name ? `${sub.name} (${sub.email})` : sub.email) : '(unknown subscriber)';
        target_link = `/subscribers/${r.subscriber_id.toString()}`;
      } else if (r.target_kind === 'conversation' && r.conversation_id) {
        if (r.conversation_type === 'campaign') {
          const c: any = campaignMap.get(r.conversation_id.toString());
          target_label = c ? `${c.name} (campaign)` : '(deleted campaign)';
        } else if (r.conversation_type === 'one_off') {
          const o: any = oneOffMap.get(r.conversation_id.toString());
          target_label = o ? `${o.subject} (one-off)` : '(deleted one-off)';
        } else if (r.conversation_type === 'flow_step') {
          const f: any = flowMap.get(r.conversation_id.toString());
          target_label = f ? `${f.name} — ${r.flow_node_id} (flow)` : '(deleted flow)';
        }
        target_link = `/inbox`;  // landing in inbox; user opens conversation from there
      }
      return { ...r, target_label, target_link };
    });

    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/dismiss', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const updated = await InboxReminder.findOneAndUpdate(
      { _id: req.params.id, user_id: userId },
      { $set: { dismissed: true, dismissed_at: new Date() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export { router as reminderRoutes };
