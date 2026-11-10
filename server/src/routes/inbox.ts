import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Message } from '../models/message';
import { Campaign } from '../models/campaign';
import { OneOffSend } from '../models/oneOffSend';
import { FlowStepConversation } from '../models/flowStepConversation';
import { InboxRead } from '../models/inboxRead';
import { InboxNote } from '../models/inboxNote';
import { InboxReminder } from '../models/inboxReminder';
import { Subscriber } from '../models/subscriber';
import { ConversationLabel } from '../models/conversationLabel';
import { Flow } from '../models/flow';
import { renderMessages, makeSourceCache } from '../services/inboxRenderer';
import { sendEmail } from '../services/emailService';
import { renderEmailBody } from '../utils/emailRender';

const router = Router();

// Single-user app: derive a stable user id from the JWT (admin role).
// We use a fixed ObjectId so InboxRead/Reminder can key by it.
const ADMIN_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');
function getUserId(_req: Request): mongoose.Types.ObjectId {
  return ADMIN_USER_ID;
}

type SourceType = 'campaign' | 'flow_step' | 'one_off';

function bodyPreview(html: string, maxLen = 120): string {
  const raw = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
}

interface ConversationRow {
  type: SourceType;
  id: string;
  flow_node_id?: string | null;
  subject: string;
  preview: string;
  recipient_count: number;
  reply_count: number;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_last_message_at: Date | null;
  unread: boolean;
  source_label: string;
  is_draft?: boolean;
}

// ============================================================================
// GET /api/inbox/conversations
// ============================================================================
router.get('/conversations', async (req: Request, res: Response, next: Function) => {
  try {
    const filter = (req.query.filter as string) || 'all';
    const tag = req.query.tag as string | undefined;
    const source = req.query.source as string | undefined;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) || '25', 10), 100);
    const userId = getUserId(req);

    const sourceFilter: any = {};
    if (filter === 'starred') sourceFilter.inbox_starred = true;
    if (tag) sourceFilter.inbox_tags = tag;

    // Archive filter: hide archived by default; show ONLY archived when
    // filter === 'archived'.
    if (filter === 'archived') {
      sourceFilter.inbox_archived = true;
    } else {
      sourceFilter.inbox_archived = { $ne: true };
    }

    const replyFilter = filter === 'replies' ? { reply_count: { $gt: 0 } } : {};

    const includeCampaigns = !source || source === 'campaign';
    const includeOneOffs = !source || source === 'one_off';
    const includeFlowSteps = !source || source === 'flow';

    const fetchLimit = page * limit + limit;

    const [campaigns, oneOffs, flowSteps] = await Promise.all([
      includeCampaigns
        ? Campaign.find({
            ...sourceFilter,
            ...replyFilter,
            inbox_last_message_at: { $ne: null },
            ...(filter === 'drafts' ? { status: 'draft' } : {}),
          })
            .sort({ inbox_last_message_at: -1 })
            .limit(fetchLimit)
            .lean()
        : Promise.resolve([] as any[]),
      includeOneOffs
        ? OneOffSend.find({
            ...sourceFilter,
            ...replyFilter,
            ...(filter === 'drafts' ? { status: 'draft' } : { status: { $ne: 'draft' } }),
          })
            .sort({ inbox_last_message_at: -1 })
            .limit(fetchLimit)
            .lean()
        : Promise.resolve([] as any[]),
      includeFlowSteps && filter !== 'drafts'
        ? FlowStepConversation.find({ ...sourceFilter, ...replyFilter })
            .sort({ inbox_last_message_at: -1 })
            .limit(fetchLimit)
            .lean()
        : Promise.resolve([] as any[]),
    ]);

    // build flow id -> name map for flow_step labels
    const flowIds = Array.from(new Set(flowSteps.map((f: any) => f.flow_id.toString())));
    const flows = flowIds.length
      ? await Flow.find({ _id: { $in: flowIds } }).select('name').lean()
      : [];
    const flowNameMap = new Map(flows.map((f: any) => [f._id.toString(), f.name]));

    const rows: ConversationRow[] = [];

    for (const c of campaigns as any[]) {
      rows.push({
        type: 'campaign',
        id: c._id.toString(),
        subject: c.name || c.subject || '(untitled campaign)',
        preview: c.subject || '',
        recipient_count: c.stats?.sent || 0,
        reply_count: c.reply_count || 0,
        inbox_tags: c.inbox_tags || [],
        inbox_starred: c.inbox_starred || false,
        inbox_last_message_at: c.inbox_last_message_at,
        unread: false,
        source_label: 'Campaign',
      });
    }

    for (const o of oneOffs as any[]) {
      const isDraft = o.status === 'draft';
      rows.push({
        type: 'one_off',
        id: o._id.toString(),
        subject: o.subject || '(no subject)',
        preview: bodyPreview(o.html_body || ''),
        recipient_count: o.recipient_count || 0,
        reply_count: o.reply_count || 0,
        inbox_tags: o.inbox_tags || [],
        inbox_starred: o.inbox_starred || false,
        inbox_last_message_at: o.inbox_last_message_at,
        unread: false,
        source_label: isDraft ? 'Draft' : 'One-off',
        is_draft: isDraft,
      });
    }

    for (const fs of flowSteps as any[]) {
      const flowName = flowNameMap.get(fs.flow_id.toString()) || 'Flow';
      rows.push({
        type: 'flow_step',
        id: fs.flow_id.toString(),
        flow_node_id: fs.node_id,
        subject: `${flowName} — ${fs.node_label || fs.node_id}`,
        preview: '',
        recipient_count: fs.recipient_count || 0,
        reply_count: fs.reply_count || 0,
        inbox_tags: fs.inbox_tags || [],
        inbox_starred: fs.inbox_starred || false,
        inbox_last_message_at: fs.inbox_last_message_at,
        unread: false,
        source_label: 'Flow step',
      });
    }

    // Sort merged
    rows.sort((a, b) => {
      const ta = a.inbox_last_message_at ? new Date(a.inbox_last_message_at).getTime() : 0;
      const tb = b.inbox_last_message_at ? new Date(b.inbox_last_message_at).getTime() : 0;
      return tb - ta;
    });

    // Decorate unread
    const reads = await InboxRead.find({ user_id: userId }).lean();
    const readMap = new Map(
      reads.map(r => [
        `${r.conversation_type}:${r.conversation_id.toString()}:${r.flow_node_id || ''}`,
        r.last_viewed_at,
      ])
    );

    for (const r of rows) {
      const key = `${r.type}:${r.id}:${r.flow_node_id || ''}`;
      const lastViewed = readMap.get(key);
      const lastMsg = r.inbox_last_message_at ? new Date(r.inbox_last_message_at) : null;
      r.unread = !!(lastMsg && (!lastViewed || lastMsg > lastViewed));
    }

    let filtered = rows;
    if (filter === 'unread') filtered = rows.filter(r => r.unread);
    if (filter === 'reminders') {
      const dueReminders = await InboxReminder.find({
        user_id: userId,
        dismissed: false,
      }).lean();
      // Only conversation-target reminders affect the inbox filter
      const reminderKeys = new Set(
        dueReminders
          .filter(rem => rem.target_kind === 'conversation' && rem.conversation_id)
          .map(rem =>
            `${rem.conversation_type}:${rem.conversation_id!.toString()}:${rem.flow_node_id || ''}`
          )
      );
      filtered = rows.filter(r => reminderKeys.has(`${r.type}:${r.id}:${r.flow_node_id || ''}`));
    }

    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    res.json({
      data: paged,
      total: filtered.length,
      page,
      limit,
    });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// GET /api/inbox/conversations/:type/:id
// ============================================================================
router.get('/conversations/:type/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const conv = await loadConversation(type, id, flow_node_id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// GET /api/inbox/conversations/:type/:id/recipients
// ============================================================================
router.get('/conversations/:type/:id/recipients', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    if (!['campaign', 'flow_step', 'one_off'].includes(type)) {
      return res.status(400).json({ error: 'Invalid conversation type' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    // Coerce to a primitive: the qs parser can turn ?flow_node_id[$ne]=x into an
    // object that would otherwise become a NoSQL query operator.
    const flow_node_id = typeof req.query.flow_node_id === 'string' ? req.query.flow_node_id : null;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
    const repliedOnly = req.query.replied_only === 'true';
    const needsReplyOnly = req.query.needs_reply_only === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    // First: which subscribers have replied to this conversation? Used both
    // for the optional filter and for surfacing them at the top of the list.
    const inboundMatch: any = { source_type: type, source_id: new mongoose.Types.ObjectId(id), direction: 'inbound' };
    if (type === 'flow_step' && flow_node_id) inboundMatch.flow_node_id = flow_node_id;
    const replyAgg = await Message.aggregate([
      { $match: inboundMatch },
      { $group: { _id: '$subscriber_id', count: { $sum: 1 }, last: { $max: '$received_at' } } },
    ]);
    const replyMap = new Map<string, { count: number; last: Date }>(
      replyAgg.map((r: any) => [r._id.toString(), { count: r.count, last: r.last }])
    );
    const replierIds = replyAgg.map((r: any) => r._id);

    // Outbound inbox replies (user replied back from the app).
    const userReplyMatch: any = {
      source_type: type,
      source_id: new mongoose.Types.ObjectId(id),
      direction: 'outbound',
      in_reply_to_message_id: { $ne: null },
    };
    if (type === 'flow_step' && flow_node_id) userReplyMatch.flow_node_id = flow_node_id;
    const userReplyAgg = await Message.aggregate([
      { $match: userReplyMatch },
      { $group: { _id: '$subscriber_id', count: { $sum: 1 }, last: { $max: '$sent_at' } } },
    ]);
    const userReplyMap = new Map<string, { count: number; last: Date }>(
      userReplyAgg.map((r: any) => [r._id.toString(), { count: r.count, last: r.last }]),
    );

    const needsReplyIds = replyAgg
      .filter((r: any) => {
        const userReply = userReplyMap.get(r._id.toString());
        return !userReply?.last || userReply.last < r.last;
      })
      .map((r: any) => r._id);

    // Outbound-side aggregation: latest message per subscriber
    const matchOutbound: any = { source_type: type, source_id: new mongoose.Types.ObjectId(id), direction: 'outbound' };
    if (type === 'flow_step' && flow_node_id) matchOutbound.flow_node_id = flow_node_id;

    // Optional restriction to a subset of subscribers: replied-only and/or a
    // pipeline-stage filter. We intersect them and apply at the aggregation
    // match level so pagination + counts stay correct.
    const nodeKey = type === 'flow_step' ? (flow_node_id || null) : null;
    const stageFilter = (req.query.stage as string) || '';
    if (stageFilter && !mongoose.Types.ObjectId.isValid(stageFilter)) {
      return res.json({ data: [], total: 0, page, limit, total_replied: replierIds.length });
    }
    let restrictIds: mongoose.Types.ObjectId[] | null = repliedOnly ? replierIds : null;
    if (needsReplyOnly) {
      restrictIds = restrictIds
        ? restrictIds.filter(rid => needsReplyIds.some((nid: any) => nid.equals(rid)))
        : needsReplyIds;
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchSubs = await Subscriber.find({
        $or: [
          { email: { $regex: escaped, $options: 'i' } },
          { name: { $regex: escaped, $options: 'i' } },
        ],
      }).select('_id').limit(500).lean();
      const searchIds = searchSubs.map((s: any) => s._id as mongoose.Types.ObjectId);
      if (searchIds.length === 0) {
        return res.json({
          data: [],
          total: 0,
          page,
          limit,
          total_replied: replierIds.length,
          total_needs_reply: needsReplyIds.length,
        });
      }
      restrictIds = restrictIds
        ? restrictIds.filter(rid => searchIds.some(sid => sid.equals(rid)))
        : searchIds;
    }
    if (stageFilter) {
      const labelDocs = await ConversationLabel.find({
        source_type: type,
        source_id: new mongoose.Types.ObjectId(id),
        flow_node_id: nodeKey,
        stage_id: new mongoose.Types.ObjectId(stageFilter),
      }).select('subscriber_id').lean();
      const stageIds = labelDocs.map((l: any) => l.subscriber_id);
      restrictIds = restrictIds
        ? restrictIds.filter(rid => stageIds.some((sid: any) => sid.equals(rid)))
        : stageIds;
    }
    if (restrictIds && restrictIds.length === 0) {
      return res.json({
        data: [],
        total: 0,
        page,
        limit,
        total_replied: replierIds.length,
        total_needs_reply: needsReplyIds.length,
      });
    }
    if (restrictIds) {
      matchOutbound.subscriber_id = { $in: restrictIds };
    }

    const groupStage = {
      $group: {
        _id: '$subscriber_id',
        latest_outbound_at: { $first: '$sent_at' },
        latest_status: { $first: '$status_summary' },
        to_address: { $first: '$to_address' },
      },
    };

    // Sort: replies first (by last_reply_at desc), then non-replies (by latest_outbound_at desc).
    const addReplyFlag = {
      $addFields: {
        has_reply: { $cond: [{ $in: ['$_id', replierIds] }, 1, 0] },
        reply_sort: {
          $cond: [
            { $in: ['$_id', replierIds] },
            // last reply timestamp (used for ordering repliers among themselves)
            // We can't easily look it up here; use latest_outbound_at as a tiebreaker.
            '$latest_outbound_at',
            new Date(0),
          ],
        },
      },
    };

    const pipeline: any[] = [
      { $match: matchOutbound },
      { $sort: { sent_at: -1 } },
      groupStage,
      addReplyFlag,
      { $sort: { has_reply: -1, latest_outbound_at: -1 } },
    ];

    const totalRes = await Message.aggregate([...pipeline, { $count: 'n' }]);
    const total = totalRes[0]?.n || 0;

    const rows = await Message.aggregate([
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const subscriberIds = rows.map((r: any) => r._id);
    const subscribers = subscriberIds.length
      ? await Subscriber.find({ _id: { $in: subscriberIds } }).select('email name tags status engagement_score engagement_silence_penalty engagement_score_manual').lean()
      : [];
    const subscriberMap = new Map(subscribers.map(s => [(s._id as any).toString(), s]));

    // Attach each recipient's pipeline stage (if any) for this conversation.
    const labelRows = subscriberIds.length
      ? await ConversationLabel.find({
          source_type: type,
          source_id: new mongoose.Types.ObjectId(id),
          flow_node_id: nodeKey,
          subscriber_id: { $in: subscriberIds },
        }).select('subscriber_id stage_id').lean()
      : [];
    const stageMap = new Map(
      labelRows.map((l: any) => [l.subscriber_id.toString(), l.stage_id ? l.stage_id.toString() : null]),
    );

    const data = rows.map((r: any) => {
      const sub: any = subscriberMap.get(r._id.toString());
      const reply = replyMap.get(r._id.toString());
      const userReply = userReplyMap.get(r._id.toString());
      const lastInbound = reply?.last || null;
      const lastUserReply = userReply?.last || null;
      const needsReply = !!lastInbound && (!lastUserReply || lastUserReply < lastInbound);
      const engagementScore = (sub?.engagement_score || 0) + (sub?.engagement_silence_penalty || 0) + (sub?.engagement_score_manual || 0);
      return {
        subscriber_id: r._id.toString(),
        email: sub?.email || r.to_address,
        name: sub?.name || '',
        subscriber_tags: sub?.tags || [],
        subscriber_status: sub?.status || 'active',
        latest_outbound_at: r.latest_outbound_at,
        latest_status: r.latest_status,
        reply_count: reply?.count || 0,
        last_reply_at: lastInbound,
        user_reply_count: userReply?.count || 0,
        last_user_reply_at: lastUserReply,
        needs_reply: needsReply,
        engagement_score: engagementScore,
        stage_id: stageMap.get(r._id.toString()) || null,
      };
    });

    res.json({
      data,
      total,
      page,
      limit,
      total_replied: replierIds.length,
      total_needs_reply: needsReplyIds.length,
    });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// GET /api/inbox/threads/:type/:id/:subscriber_id
// ============================================================================
router.get('/threads/:type/:id/:subscriber_id', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id, subscriber_id } = req.params as any;
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);

    const match: any = {
      source_type: type,
      source_id: new mongoose.Types.ObjectId(id),
      subscriber_id: new mongoose.Types.ObjectId(subscriber_id),
    };
    if (type === 'flow_step' && flow_node_id) match.flow_node_id = flow_node_id;

    const total = await Message.countDocuments(match);
    const messages = await Message.find(match)
      .sort({ created_at: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const rendered = await renderMessages(messages, makeSourceCache());

    const subscriber = await Subscriber.findById(subscriber_id).select('email name status tags').lean();

    res.json({
      subscriber: subscriber
        ? {
            _id: (subscriber._id as any).toString(),
            email: subscriber.email,
            name: subscriber.name,
            status: subscriber.status,
            tags: subscriber.tags || [],
          }
        : null,
      messages: rendered,
      total,
      page,
      limit,
    });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/conversations/:type/:id/star
// ============================================================================
router.post('/conversations/:type/:id/star', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    const flow_node_id = (req.query.flow_node_id as string) || null;

    const Model = getSourceModel(type);
    if (!Model) return res.status(400).json({ error: 'Invalid type' });

    if (type === 'flow_step') {
      const existing = await FlowStepConversation.findOne({ flow_id: id, node_id: flow_node_id });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      existing.inbox_starred = !existing.inbox_starred;
      await existing.save();
      return res.json({ inbox_starred: existing.inbox_starred });
    }

    const doc: any = await (Model as any).findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.inbox_starred = !doc.inbox_starred;
    await doc.save();
    res.json({ inbox_starred: doc.inbox_starred });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/conversations/:type/:id/tags
// ============================================================================
router.post('/conversations/:type/:id/tags', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const { add = [], remove = [] } = req.body as { add?: string[]; remove?: string[] };

    const $addToSet = add.length ? { inbox_tags: { $each: add } } : undefined;
    const $pull = remove.length ? { inbox_tags: { $in: remove } } : undefined;
    const update: any = {};
    if ($addToSet) update.$addToSet = $addToSet;
    if ($pull) update.$pull = $pull;
    if (!update.$addToSet && !update.$pull) return res.json({ updated: 0 });

    if (type === 'flow_step') {
      const updated = await FlowStepConversation.findOneAndUpdate(
        { flow_id: id, node_id: flow_node_id },
        update,
        { new: true }
      );
      return res.json({ inbox_tags: updated?.inbox_tags || [] });
    }

    const Model = getSourceModel(type);
    if (!Model) return res.status(400).json({ error: 'Invalid type' });
    const doc = await (Model as any).findByIdAndUpdate(id, update, { new: true });
    res.json({ inbox_tags: doc?.inbox_tags || [] });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/conversations/:type/:id/read
// ============================================================================
router.post('/conversations/:type/:id/read', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const userId = getUserId(req);

    await InboxRead.findOneAndUpdate(
      {
        user_id: userId,
        conversation_type: type,
        conversation_id: id,
        flow_node_id,
      },
      { $set: { last_viewed_at: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// Notes CRUD
// ============================================================================
router.get('/notes', async (req: Request, res: Response, next: Function) => {
  try {
    const conversation_type = req.query.conversation_type as string;
    const conversation_id = req.query.conversation_id as string;
    const flow_node_id = (req.query.flow_node_id as string) || null;
    if (!conversation_type || !conversation_id) {
      return res.status(400).json({ error: 'conversation_type and conversation_id required' });
    }
    const notes = await InboxNote.find({
      conversation_type,
      conversation_id,
      flow_node_id,
    })
      .sort({ created_at: -1 })
      .lean();
    res.json(notes);
  } catch (e) {
    next(e);
  }
});

router.post('/notes', async (req: Request, res: Response, next: Function) => {
  try {
    const { conversation_type, conversation_id, flow_node_id = null, body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    const userId = getUserId(req);
    const note = await InboxNote.create({
      conversation_type,
      conversation_id,
      flow_node_id,
      body: body.trim(),
      created_by: userId,
      created_by_name: 'Admin',
    });
    res.status(201).json(note);
  } catch (e) {
    next(e);
  }
});

router.put('/notes/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const note = await InboxNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.created_by.toString() !== userId.toString()) return res.status(403).json({ error: 'Forbidden' });
    note.body = (req.body.body || '').trim();
    await note.save();
    res.json(note);
  } catch (e) {
    next(e);
  }
});

router.delete('/notes/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const note = await InboxNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.created_by.toString() !== userId.toString()) return res.status(403).json({ error: 'Forbidden' });
    await note.deleteOne();
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// Reminders
// ============================================================================
router.get('/reminders', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const includeDismissed = req.query.includeDismissed === 'true';
    const filter: any = { user_id: userId };
    if (!includeDismissed) filter.dismissed = false;
    const reminders = await InboxReminder.find(filter).sort({ remind_at: 1 }).lean();
    res.json(reminders);
  } catch (e) {
    next(e);
  }
});

router.post('/reminders', async (req: Request, res: Response, next: Function) => {
  try {
    const { conversation_type, conversation_id, flow_node_id = null, remind_at, note = null } = req.body;
    if (!conversation_type || !conversation_id || !remind_at) {
      return res.status(400).json({ error: 'conversation_type, conversation_id, remind_at required' });
    }
    const userId = getUserId(req);
    const reminder = await InboxReminder.create({
      user_id: userId,
      conversation_type,
      conversation_id,
      flow_node_id,
      remind_at: new Date(remind_at),
      note,
    });
    res.status(201).json(reminder);
  } catch (e) {
    next(e);
  }
});

router.post('/reminders/:id/dismiss', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const reminder = await InboxReminder.findOneAndUpdate(
      { _id: req.params.id, user_id: userId },
      { $set: { dismissed: true, dismissed_at: new Date() } },
      { new: true }
    );
    if (!reminder) return res.status(404).json({ error: 'Not found' });
    res.json(reminder);
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// Tags management
// ============================================================================
router.get('/tags', async (_req: Request, res: Response, next: Function) => {
  try {
    const [c, o, fs] = await Promise.all([
      Campaign.distinct('inbox_tags'),
      OneOffSend.distinct('inbox_tags'),
      FlowStepConversation.distinct('inbox_tags'),
    ]);
    const all = Array.from(new Set([...c, ...o, ...fs])).filter(Boolean).sort();
    res.json(all);
  } catch (e) {
    next(e);
  }
});

router.delete('/tags/:tag', async (req: Request, res: Response, next: Function) => {
  try {
    const tag = req.params.tag;
    await Promise.all([
      Campaign.updateMany({ inbox_tags: tag }, { $pull: { inbox_tags: tag } }),
      OneOffSend.updateMany({ inbox_tags: tag }, { $pull: { inbox_tags: tag } }),
      FlowStepConversation.updateMany({ inbox_tags: tag }, { $pull: { inbox_tags: tag } }),
    ]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.put('/tags/:old/rename', async (req: Request, res: Response, next: Function) => {
  try {
    const oldTag = req.params.old;
    const newTag = (req.body.new_name || '').trim();
    if (!newTag) return res.status(400).json({ error: 'new_name required' });
    await Promise.all([
      Campaign.updateMany({ inbox_tags: oldTag }, { $set: { 'inbox_tags.$': newTag } }),
      OneOffSend.updateMany({ inbox_tags: oldTag }, { $set: { 'inbox_tags.$': newTag } }),
      FlowStepConversation.updateMany({ inbox_tags: oldTag }, { $set: { 'inbox_tags.$': newTag } }),
    ]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// GET /api/inbox/unread-count
// ============================================================================
router.get('/unread-count', async (req: Request, res: Response, next: Function) => {
  try {
    const userId = getUserId(req);
    const reads = await InboxRead.find({ user_id: userId }).lean();
    const readMap = new Map(
      reads.map(r => [
        `${r.conversation_type}:${r.conversation_id.toString()}:${r.flow_node_id || ''}`,
        r.last_viewed_at,
      ])
    );

    const [campaigns, oneOffs, flowSteps] = await Promise.all([
      Campaign.find({ inbox_last_message_at: { $ne: null } })
        .select('_id inbox_last_message_at')
        .lean(),
      OneOffSend.find({ status: { $ne: 'draft' } })
        .select('_id inbox_last_message_at')
        .lean(),
      FlowStepConversation.find().select('flow_id node_id inbox_last_message_at').lean(),
    ]);

    let count = 0;
    for (const c of campaigns as any[]) {
      const key = `campaign:${c._id.toString()}:`;
      const lv = readMap.get(key);
      if (!lv || (c.inbox_last_message_at && new Date(c.inbox_last_message_at) > lv)) count++;
    }
    for (const o of oneOffs as any[]) {
      const key = `one_off:${o._id.toString()}:`;
      const lv = readMap.get(key);
      if (!lv || (o.inbox_last_message_at && new Date(o.inbox_last_message_at) > lv)) count++;
    }
    for (const fs of flowSteps as any[]) {
      const key = `flow_step:${fs.flow_id.toString()}:${fs.node_id}`;
      const lv = readMap.get(key);
      if (!lv || (fs.inbox_last_message_at && new Date(fs.inbox_last_message_at) > lv)) count++;
    }

    const dueReminders = await InboxReminder.countDocuments({
      user_id: userId,
      dismissed: false,
      remind_at: { $lte: new Date() },
    });

    res.json({ unread: count, due_reminders: dueReminders });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/conversations/:type/:id/archive
// Body: { archived: boolean }   (defaults true)
// ============================================================================
router.post('/conversations/:type/:id/archive', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id } = req.params as { type: SourceType; id: string };
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const archived = req.body?.archived === false ? false : true;

    if (type === 'flow_step') {
      const updated = await FlowStepConversation.findOneAndUpdate(
        { flow_id: id, node_id: flow_node_id },
        { $set: { inbox_archived: archived } },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json({ inbox_archived: updated.inbox_archived });
    }

    const Model = getSourceModel(type);
    if (!Model) return res.status(400).json({ error: 'Invalid type' });
    const doc: any = await (Model as any).findByIdAndUpdate(id, { $set: { inbox_archived: archived } }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ inbox_archived: doc.inbox_archived });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/forward
// Creates a new one-off send seeded with the original message's content +
// a "Forwarded message" preamble. The new send is dispatched immediately.
// Body: { source_message_id, to: string[], subject?, prefix_body?, cc?, bcc? }
// ============================================================================
router.post('/forward', async (req: Request, res: Response, next: Function) => {
  try {
    const { source_message_id, to, subject, prefix_body, cc, bcc } = req.body || {};
    if (!source_message_id || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: 'source_message_id and to[] required' });
    }
    const src = await Message.findById(source_message_id);
    if (!src) return res.status(404).json({ error: 'Source message not found' });

    // Compose the forwarded body: optional user-typed prefix + quoted original
    const origSubject = src.subject_override || '';
    const fwdSubject = (subject || (origSubject.toLowerCase().startsWith('fwd:') ? origSubject : `Fwd: ${origSubject}`)).trim();
    const origDate = src.sent_at || src.received_at;
    const origFrom = src.from_address || '';
    const origTo = src.to_address || '';
    const origBody = src.html_body || src.text_body || '';

    const quotedHeader = `\n\n---------- Forwarded message ----------\nFrom: ${origFrom}\nDate: ${origDate ? new Date(origDate).toString() : ''}\nSubject: ${origSubject}\nTo: ${origTo}\n\n`;
    const body = (prefix_body || '') + quotedHeader + origBody;

    // Forwards create a new one_off send; reuse the existing route logic by
    // calling the same dispatcher path the composer uses.
    const { OneOffSend } = await import('../models/oneOffSend');
    const { Subscriber } = await import('../models/subscriber');
    // Resolve emails → subscribers (create stubs if not present, mirroring template test-send pattern)
    const subscriberIds: any[] = [];
    for (const email of to as string[]) {
      const norm = String(email).trim().toLowerCase();
      let sub = await Subscriber.findOne({ email: norm });
      if (!sub) sub = await Subscriber.create({ email: norm, name: '', status: 'active' });
      subscriberIds.push(sub._id);
    }
    const send = await OneOffSend.create({
      subject: fwdSubject,
      html_body: body,
      from_address: src.from_address || '',
      cc_addresses: Array.isArray(cc) ? cc : [],
      bcc_addresses: Array.isArray(bcc) ? bcc : [],
      recipient_ids: subscriberIds,
      recipient_count: subscriberIds.length,
      status: 'sending',
      inbox_last_message_at: new Date(),
    });

    // Fire-and-forget dispatch via the existing endpoint's worker
    const { dispatchOneOffSend } = await import('./oneOffSends');
    if (typeof dispatchOneOffSend === 'function') {
      dispatchOneOffSend(send._id.toString()).catch((err: any) => console.error('forward dispatch:', err));
    }

    res.json({ success: true, one_off_send_id: send._id });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/preview-render
// Renders a body for the preview modal — same pipeline that sendEmail uses
// for inline replies. Returns the HTML the recipient would actually see
// (minus the unsubscribe footer, which only attaches at real send time).
// ============================================================================
router.post('/preview-render', async (req: Request, res: Response, next: Function) => {
  try {
    const { html_body, body_format } = req.body as { html_body?: string; body_format?: 'plain' | 'html' | 'auto' };
    if (typeof html_body !== 'string') return res.status(400).json({ error: 'html_body required' });
    const rendered_html = renderEmailBody(html_body, body_format || 'auto');
    res.json({ rendered_html });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// POST /api/inbox/threads/:type/:id/:subscriber_id/reply
// ============================================================================
router.post('/threads/:type/:id/:subscriber_id/reply', async (req: Request, res: Response, next: Function) => {
  try {
    const { type, id, subscriber_id } = req.params as any;
    const flow_node_id = (req.query.flow_node_id as string) || null;
    const { subject, html_body, in_reply_to_message_id, cc, bcc, body_format, to } = req.body;

    if (!html_body?.trim()) return res.status(400).json({ error: 'html_body required' });

    let resolvedSubject = subject;
    let parentRfcId: string | null = null;
    let parentReferences: string | null = null;
    {
      // Find the parent message — either the explicitly-provided one, or
      // the latest message in the recipient thread. We need it for the
      // RFC 5322 threading headers and (optionally) the subject default.
      const match: any = {
        source_type: type,
        source_id: new mongoose.Types.ObjectId(id),
        subscriber_id: new mongoose.Types.ObjectId(subscriber_id),
      };
      if (type === 'flow_step' && flow_node_id) match.flow_node_id = flow_node_id;

      let parent: any = null;
      if (in_reply_to_message_id) {
        parent = await Message.findById(in_reply_to_message_id);
      }
      if (!parent) {
        parent = await Message.findOne(match).sort({ created_at: -1 });
      }
      if (parent) {
        parentRfcId = parent.rfc_message_id || null;
        // For inbound replies, the rfc_message_id is the sender's own ID; for
        // outbound the rfc_message_id is ours. Either way it's what we set
        // as In-Reply-To on the new send.
      }

      if (!resolvedSubject) {
        const baseSubj = parent?.subject_override || '';
        resolvedSubject = baseSubj.toLowerCase().startsWith('re:') ? baseSubj : `Re: ${baseSubj}`;
      }
    }

    // Replies are sent on the same source the conversation belongs to
    const sendArgs: any = {
      subscriberId: subscriber_id,
      inlineSubject: resolvedSubject,
      inlineHtml: html_body,
      inReplyToMessageId: in_reply_to_message_id || null,
      inReplyToRfcId: parentRfcId,
      referencesChain: parentReferences,  // future: walk chain for nested threads
      cc: Array.isArray(cc) ? cc : undefined,
      bcc: Array.isArray(bcc) ? bcc : undefined,
      bodyFormat: body_format || 'auto',
      // Inbox replies are 1-to-1 conversations, not marketing — drop the
      // unsubscribe footer and List-Unsubscribe header.
      personalEmail: true,
    };
    // `to` array is accepted from the client (editable To chips in the reply
    // form). For v1 we only send to the first one and add the rest as Cc so we
    // don't have to fan out the send pipeline. Most replies are single-To.
    if (Array.isArray(to) && to.length > 1) {
      const extras = to.slice(1).filter((e: any) => typeof e === 'string' && e.trim());
      sendArgs.cc = Array.from(new Set([...(sendArgs.cc || []), ...extras]));
    }

    if (type === 'campaign') sendArgs.campaignId = id;
    else if (type === 'one_off') sendArgs.oneOffSendId = id;
    else if (type === 'flow_step') {
      sendArgs.flowId = id;
      sendArgs.flowNodeId = flow_node_id;
    }

    // Replies always go out from the mailbox that started the thread.
    {
      const lastOut: any = await Message.findOne({
        source_type: type,
        source_id: new mongoose.Types.ObjectId(id),
        subscriber_id: new mongoose.Types.ObjectId(subscriber_id),
        direction: 'outbound',
      }).sort({ created_at: -1 }).select('mailbox_id').lean();
      if (lastOut?.mailbox_id) sendArgs.mailboxId = lastOut.mailbox_id.toString();
    }

    const result = await sendEmail(sendArgs);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, message_id: result.inboxMessageId });
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// helpers
// ============================================================================
function getSourceModel(type: SourceType) {
  if (type === 'campaign') return Campaign;
  if (type === 'one_off') return OneOffSend;
  return null;
}

async function loadConversation(type: SourceType, id: string, flow_node_id: string | null) {
  if (type === 'campaign') {
    const c: any = await Campaign.findById(id).lean();
    if (!c) return null;
    return {
      type: 'campaign',
      id,
      subject: c.name,
      preview: c.subject,
      recipient_count: c.stats?.sent || 0,
      reply_count: c.reply_count || 0,
      inbox_tags: c.inbox_tags || [],
      inbox_starred: c.inbox_starred || false,
      inbox_last_message_at: c.inbox_last_message_at,
      source_label: 'Campaign',
      source: { _id: id, name: c.name, status: c.status },
    };
  }
  if (type === 'one_off') {
    const o: any = await OneOffSend.findById(id).lean();
    if (!o) return null;
    const isDraft = o.status === 'draft';
    return {
      type: 'one_off',
      id,
      subject: o.subject,
      preview: bodyPreview(o.html_body || ''),
      recipient_count: o.recipient_count || 0,
      reply_count: o.reply_count || 0,
      inbox_tags: o.inbox_tags || [],
      inbox_starred: o.inbox_starred || false,
      inbox_last_message_at: o.inbox_last_message_at,
      source_label: isDraft ? 'Draft' : 'One-off',
      is_draft: isDraft,
      source: { _id: id, status: o.status, subject: o.subject },
    };
  }
  if (type === 'flow_step') {
    const fs: any = await FlowStepConversation.findOne({ flow_id: id, node_id: flow_node_id }).lean();
    if (!fs) return null;
    const flow = await Flow.findById(id).select('name').lean();
    return {
      type: 'flow_step',
      id,
      flow_node_id,
      subject: `${(flow as any)?.name || 'Flow'} — ${fs.node_label || flow_node_id}`,
      preview: '',
      recipient_count: fs.recipient_count || 0,
      reply_count: fs.reply_count || 0,
      inbox_tags: fs.inbox_tags || [],
      inbox_starred: fs.inbox_starred || false,
      inbox_last_message_at: fs.inbox_last_message_at,
      source_label: 'Flow step',
      source: { _id: id, name: (flow as any)?.name },
    };
  }
  return null;
}

// Cross-conversation history for the inbox prospect panel: the most recent
// messages for a subscriber across ALL campaigns / flows / one-offs. Powers the
// "N sent · M replies" history list. Read-only; capped at 50.
router.get('/subscriber/:id/recent-messages', async (req: Request, res: Response, next: Function) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid subscriber id' });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const messages = await Message.find({ subscriber_id: id })
      .sort({ sent_at: -1, created_at: -1 })
      .limit(limit)
      .select('direction source_type source_id flow_node_id subject_override text_body html_body sent_at received_at created_at status_summary')
      .lean();

    const outbound = messages.filter(m => m.direction === 'outbound').length;
    const items = messages.map(m => {
      const raw = m.text_body || (m.html_body || '').replace(/<[^>]+>/g, ' ');
      return {
        _id: String(m._id),
        direction: m.direction,
        source_type: m.source_type,
        source_id: String(m.source_id),
        flow_node_id: m.flow_node_id || null,
        subject: m.subject_override || null,
        preview: raw.replace(/\s+/g, ' ').trim().slice(0, 100),
        at: m.sent_at || m.received_at || m.created_at || null,
        status: m.status_summary,
      };
    });

    res.json({ total: messages.length, outbound, inbound: messages.length - outbound, items });
  } catch (e) {
    next(e);
  }
});

export { router as inboxRoutes };
