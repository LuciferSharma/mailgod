import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { PipelineStage, ensureStagesSeeded } from '../models/pipelineStage';
import { ConversationLabel } from '../models/conversationLabel';
import { Subscriber } from '../models/subscriber';
import { Campaign } from '../models/campaign';
import { OneOffSend } from '../models/oneOffSend';
import { FlowStepConversation } from '../models/flowStepConversation';
import { Flow } from '../models/flow';
import { invalidateStageCache } from '../services/pipelineAuto';

const router = Router();

const SOURCE_TYPES = ['campaign', 'flow_step', 'one_off'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const NAME_MAX = 60;
const BOARD_SCAN_CAP = 5000;
const DEFAULT_COLUMN_LIMIT = 200;
const MAX_COLUMN_LIMIT = 500;

/** Escape a string for safe embedding in a RegExp (case-insensitive name dedup). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trim + validate a stage name. Returns { name } on success or { error }. */
function normalizeName(raw: unknown): { name?: string; error?: string } {
  if (typeof raw !== 'string') return { error: 'name required' };
  const name = raw.trim();
  if (!name) return { error: 'name required' };
  if (name.length > NAME_MAX) return { error: `name must be <= ${NAME_MAX} chars` };
  return { name };
}

/** GET /api/pipeline/stages — list stages (seeds defaults on first call). */
router.get('/stages', async (_req: Request, res: Response, next: Function) => {
  try {
    await ensureStagesSeeded();
    const stages = await PipelineStage.find().sort({ order: 1 }).lean();
    res.json(stages);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/pipeline/stages — create a stage.
 * Body: { name, color?, terminal? }. Name is unique (case-insensitive).
 */
router.post('/stages', async (req: Request, res: Response, next: Function) => {
  try {
    await ensureStagesSeeded();
    const { name: rawName, color, terminal } = req.body || {};

    const norm = normalizeName(rawName);
    if (norm.error) return res.status(400).json({ error: norm.error });
    const name = norm.name as string;

    if (color !== undefined && !HEX_COLOR.test(color)) {
      return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
    }

    // Case-insensitive duplicate-name check.
    const existing = await PipelineStage.findOne({
      name: new RegExp('^' + escapeRegExp(name) + '$', 'i'),
    }).lean();
    if (existing) return res.status(409).json({ error: 'a stage with that name already exists' });

    // Append to the end of the order.
    const last = await PipelineStage.findOne().sort({ order: -1 }).select('order').lean();
    const order = (last?.order || 0) + 1;

    const stage = await PipelineStage.create({
      name,
      color: color || undefined,
      order,
      terminal: !!terminal,
      system: false,
    });
    res.status(201).json(stage.toObject());
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'a stage with that name already exists' });
    }
    next(e);
  }
});

/**
 * PATCH /api/pipeline/stages/reorder — reorder all stages.
 * Body: { order: [stageId, ...] }. Registered BEFORE /stages/:id so Express
 * doesn't capture id='reorder'.
 */
router.patch('/stages/reorder', async (req: Request, res: Response, next: Function) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'order must be a non-empty array of stage ids' });
    }
    if (!order.every((id: any) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: 'order contains an invalid stage id' });
    }
    // Require the full set so omitted stages can't keep stale order values that
    // collide with the new 1..N numbering.
    const stageCount = await PipelineStage.estimatedDocumentCount();
    const uniqueIds = new Set(order.map((id: any) => String(id)));
    if (uniqueIds.size !== order.length || order.length !== stageCount) {
      return res.status(400).json({ error: 'order must list every stage exactly once' });
    }

    await PipelineStage.bulkWrite(
      order.map((id: string, i: number) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: i + 1 } } },
      })),
      { ordered: false },
    );

    const stages = await PipelineStage.find().sort({ order: 1 }).lean();
    res.json(stages);
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/pipeline/stages/:id — rename / recolor / set terminal.
 * Body: { name?, color?, terminal? }.
 */
router.patch('/stages/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const { id } = req.params as { id: string };
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'valid stage id required' });
    }

    const update: Record<string, any> = {};
    const { name: rawName, color, terminal } = req.body || {};

    if (rawName !== undefined) {
      const norm = normalizeName(rawName);
      if (norm.error) return res.status(400).json({ error: norm.error });
      const name = norm.name as string;
      // Case-insensitive duplicate-name check, excluding self.
      const existing = await PipelineStage.findOne({
        _id: { $ne: id },
        name: new RegExp('^' + escapeRegExp(name) + '$', 'i'),
      }).lean();
      if (existing) return res.status(409).json({ error: 'a stage with that name already exists' });
      update.name = name;
    }

    if (color !== undefined) {
      if (!HEX_COLOR.test(color)) {
        return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
      }
      update.color = color;
    }

    if (terminal !== undefined) update.terminal = !!terminal;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }

    const stage = await PipelineStage.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!stage) return res.status(404).json({ error: 'stage not found' });
    res.json(stage);
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'a stage with that name already exists' });
    }
    next(e);
  }
});

/**
 * DELETE /api/pipeline/stages/:id — delete a stage, reassigning its labels.
 * Body/query: { reassignTo } — id of the stage to move existing labels to.
 * reassignTo is required so no conversation is orphaned (stage_id is required
 * on ConversationLabel).
 */
router.delete('/stages/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const { id } = req.params as { id: string };
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'valid stage id required' });
    }

    const stage = await PipelineStage.findById(id).lean();
    if (!stage) return res.status(404).json({ error: 'stage not found' });
    if (stage.system) return res.status(403).json({ error: 'system stages cannot be deleted' });

    const refCount = await ConversationLabel.countDocuments({ stage_id: id });
    const reassignRaw = (req.body && req.body.reassignTo) || req.query.reassignTo;
    const reassignTo = typeof reassignRaw === 'string' ? reassignRaw : '';

    // Referenced but no target → ask the client to pick one (it shows a reassign
    // picker on this 409). An unreferenced stage deletes directly.
    if (refCount > 0 && !reassignTo) {
      return res.status(409).json({
        error: 'stage_in_use',
        refCount,
        message: `${refCount} conversation(s) use this stage; choose a stage to reassign them to.`,
      });
    }

    if (reassignTo) {
      if (!mongoose.Types.ObjectId.isValid(reassignTo) || String(reassignTo) === String(id)) {
        return res.status(400).json({ error: 'valid reassignTo stage id required' });
      }
      const target = await PipelineStage.findById(reassignTo).lean();
      if (!target) return res.status(400).json({ error: 'reassignTo stage does not exist' });

      // Reassign current stage pointers, then rewrite the same id wherever it
      // appears inside history arrays.
      await ConversationLabel.updateMany({ stage_id: id }, { $set: { stage_id: reassignTo } });
      await ConversationLabel.updateMany(
        { 'history.stage_id': id },
        { $set: { 'history.$[e].stage_id': reassignTo } },
        { arrayFilters: [{ 'e.stage_id': id }] },
      );
    }

    await PipelineStage.deleteOne({ _id: id });
    res.json({ ok: true, deleted: id, reassignedTo: reassignTo || null, reassigned: refCount });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/pipeline/board — Kanban board: stages as columns, each with its
 * most-recently-updated conversation cards.
 * Query: { limit? } — per-column card cap (default 200).
 *
 * PROD-safety: the ConversationLabel scan is hard-capped at BOARD_SCAN_CAP and
 * all subscriber/source lookups are batched (no per-card queries).
 */
router.get('/board', async (req: Request, res: Response, next: Function) => {
  try {
    await ensureStagesSeeded();
    const columnLimit = Math.min(
      Math.max(parseInt((req.query.limit as string) || String(DEFAULT_COLUMN_LIMIT), 10) || DEFAULT_COLUMN_LIMIT, 1),
      MAX_COLUMN_LIMIT,
    );

    const stages = await PipelineStage.find().sort({ order: 1 }).lean();

    // Optional source filter (the board's source tabs). 'flow' → 'flow_step'.
    const sourceParam = (req.query.source as string) || '';
    const sourceType = sourceParam === 'flow' ? 'flow_step' : sourceParam;
    const match: Record<string, any> = {};
    if (sourceType && SOURCE_TYPES.includes(sourceType as SourceType)) {
      match.source_type = sourceType;
    }
    const search = ((req.query.search as string) || '').trim().toLowerCase();

    // Capped, most-recently-updated-first scan of labels.
    const labels = await ConversationLabel.find(match)
      .sort({ updated_at: -1 })
      .limit(BOARD_SCAN_CAP)
      .lean();

    // Bulk-collect the referenced ids per source type + subscribers.
    const subscriberIds = new Set<string>();
    const campaignIds = new Set<string>();
    const oneOffIds = new Set<string>();
    const flowIds = new Set<string>();
    for (const l of labels as any[]) {
      subscriberIds.add(l.subscriber_id.toString());
      if (l.source_type === 'campaign') campaignIds.add(l.source_id.toString());
      else if (l.source_type === 'one_off') oneOffIds.add(l.source_id.toString());
      else if (l.source_type === 'flow_step') flowIds.add(l.source_id.toString());
    }

    const [subs, campaigns, oneOffs, flows] = await Promise.all([
      subscriberIds.size
        ? Subscriber.find({ _id: { $in: [...subscriberIds] } }).select('email name status tags').lean()
        : Promise.resolve([] as any[]),
      campaignIds.size
        ? Campaign.find({ _id: { $in: [...campaignIds] } }).select('name subject').lean()
        : Promise.resolve([] as any[]),
      oneOffIds.size
        ? OneOffSend.find({ _id: { $in: [...oneOffIds] } }).select('subject').lean()
        : Promise.resolve([] as any[]),
      flowIds.size
        ? Flow.find({ _id: { $in: [...flowIds] } }).select('name').lean()
        : Promise.resolve([] as any[]),
    ]);

    const subMap = new Map((subs as any[]).map(s => [s._id.toString(), s]));
    const campaignMap = new Map((campaigns as any[]).map(c => [c._id.toString(), c]));
    const oneOffMap = new Map((oneOffs as any[]).map(o => [o._id.toString(), o]));
    const flowNameMap = new Map((flows as any[]).map(f => [f._id.toString(), f.name]));

    // Derive a conversation subject the same way the inbox does.
    function deriveSubject(l: any): string {
      const sid = l.source_id.toString();
      if (l.source_type === 'campaign') {
        const c = campaignMap.get(sid);
        return c?.name || c?.subject || '(untitled campaign)';
      }
      if (l.source_type === 'one_off') {
        const o = oneOffMap.get(sid);
        return o?.subject || '(no subject)';
      }
      // flow_step
      const flowName = flowNameMap.get(sid) || 'Flow';
      return `${flowName} — ${l.flow_node_id || ''}`.replace(/ — $/, ' — (step)');
    }

    const SOURCE_LABELS: Record<string, string> = {
      campaign: 'Campaign', flow_step: 'Flow', one_off: 'One-off',
    };

    // Group cards by stage_id (labels already sorted updated_at desc). Card shape
    // matches the client PipelineCard contract.
    const cardsByStage = new Map<string, any[]>();
    const totalByStage = new Map<string, number>();
    for (const l of labels as any[]) {
      const stageKey = l.stage_id ? l.stage_id.toString() : '';
      if (!stageKey) continue;
      const sub: any = subMap.get(l.subscriber_id.toString());
      if (!sub) continue; // orphaned label (subscriber hard-deleted) — skip
      const subject = deriveSubject(l);

      // Optional search over subscriber name/email + subject (post-scan filter).
      if (search) {
        const hay = `${sub?.name || ''} ${sub?.email || ''} ${subject}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      totalByStage.set(stageKey, (totalByStage.get(stageKey) || 0) + 1);
      const bucket = cardsByStage.get(stageKey) || [];
      if (bucket.length < columnLimit) {
        bucket.push({
          label_id: l._id.toString(),
          subscriber_id: l.subscriber_id.toString(),
          subscriber_name: sub?.name || '',
          subscriber_email: sub?.email || '',
          source_type: l.source_type,
          source_id: l.source_id.toString(),
          flow_node_id: l.flow_node_id || null,
          source_label: SOURCE_LABELS[l.source_type] || l.source_type,
          conversation_subject: subject,
          stage_id: stageKey,
          last_activity_at: l.updated_at,
          // reply_count not denormalized onto ConversationLabel; per-card counting
          // = N queries vs PROD message store. v1 defaults to 0; inbox is the
          // source of truth for reply counts.
          reply_count: 0,
        });
      }
      cardsByStage.set(stageKey, bucket);
    }

    const columns = (stages as any[]).map(s => {
      const key = s._id.toString();
      return {
        stage: s,
        cards: cardsByStage.get(key) || [],
        total: totalByStage.get(key) || 0,
      };
    });

    res.json({
      columns,
      // Counting conversations that have NO label requires scanning the full
      // active recipient universe (300K+ subs × sources) — too expensive for
      // v1. Defaulted to 0; the inbox remains the source of truth for unlabeled
      // conversations.
      unstaged_count: 0,
      scan_capped: labels.length >= BOARD_SCAN_CAP,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/pipeline/stage — set (or clear) a conversation's stage.
 * Body: { subscriber_id, source_type, source_id, flow_node_id?, stage_id|null }
 * stage_id null removes the label.
 */
router.post('/stage', async (req: Request, res: Response, next: Function) => {
  try {
    const { subscriber_id, source_type, source_id, flow_node_id, stage_id } = req.body || {};

    if (!subscriber_id || !mongoose.Types.ObjectId.isValid(subscriber_id)) {
      return res.status(400).json({ error: 'valid subscriber_id required' });
    }
    if (!SOURCE_TYPES.includes(source_type)) {
      return res.status(400).json({ error: `source_type must be one of ${SOURCE_TYPES.join(', ')}` });
    }
    if (!source_id || !mongoose.Types.ObjectId.isValid(source_id)) {
      return res.status(400).json({ error: 'valid source_id required' });
    }
    // flow_node_id only applies to flow_step; normalize everything else to null
    // so the unique key is consistent with how the inbox queries it.
    const nodeKey =
      source_type === 'flow_step' && typeof flow_node_id === 'string' && flow_node_id ? flow_node_id : null;
    const key = {
      subscriber_id: new mongoose.Types.ObjectId(subscriber_id),
      source_type: source_type as SourceType,
      source_id: new mongoose.Types.ObjectId(source_id),
      flow_node_id: nodeKey,
    };

    // Clear the stage.
    if (stage_id === null || stage_id === '') {
      await ConversationLabel.deleteOne(key);
      return res.json({ ok: true, stage_id: null });
    }

    if (!mongoose.Types.ObjectId.isValid(stage_id)) {
      return res.status(400).json({ error: 'valid stage_id required' });
    }
    const stage = await PipelineStage.findById(stage_id).lean();
    if (!stage) return res.status(400).json({ error: 'stage_id does not exist' });

    const now = new Date();
    const doc = await ConversationLabel.findOneAndUpdate(
      key,
      {
        $set: { stage_id: stage._id, updated_at: now },
        // Keep the most recent 50 transitions so the array can't grow unbounded.
        $push: { history: { $each: [{ stage_id: stage._id, at: now }], $slice: -50 } },
      },
      { upsert: true, new: true },
    ).lean();

    res.json({ ok: true, stage_id: String(doc?.stage_id), updated_at: doc?.updated_at });
  } catch (e) {
    next(e);
  }
});

export { router as pipelineRoutes };
