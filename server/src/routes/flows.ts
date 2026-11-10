import { Router, Request, Response } from 'express';
import { Flow } from '../models/flow';
import { FlowExecution } from '../models/flowExecution';
import { Subscriber } from '../models/subscriber';
import { buildSegmentQuery } from '../services/segmentService';
import { Segment } from '../models/segment';
import { CronJob } from '../models/cronJob';
import { dispatchFlowExecution } from '../services/flowDispatcher';
import { restartCronJobs } from '../services/cronScheduler';
import { ScheduledFlowStep } from '../models/scheduledFlowStep';
import { validate } from '../middleware/validate';
import { createFlowSchema } from '../schemas/flow';

function buildCronSchedule(config: Record<string, any>): string {
  const freq = config.frequency || 'daily';
  const [h, m] = (config.time || '09:00').split(':');
  switch (freq) {
    case 'hourly': return '0 * * * *';
    case 'daily': return `${m} ${h} * * *`;
    case 'weekly': return `${m} ${h} * * ${config.dayOfWeek || '1'}`;
    case 'monthly': return `${m} ${h} ${config.dayOfMonth || '1'} * *`;
    default: return `${m} ${h} * * *`;
  }
}

const router = Router();

/**
 * Compute live stats for one or more flows by aggregating FlowExecution.
 * The stats stored on the Flow doc only ever go UP (we $inc on enroll
 * but never decrement). Live stats reflect actual current state:
 * active (running), exited, completed, failed, plus enrolled (total).
 */
async function liveStatsFor(flowIds: any[]): Promise<Map<string, any>> {
  if (flowIds.length === 0) return new Map();
  const agg = await FlowExecution.aggregate([
    { $match: { flow_id: { $in: flowIds } } },
    { $group: { _id: { flow_id: '$flow_id', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const byFlow = new Map<string, any>();
  for (const row of agg) {
    const id = row._id.flow_id.toString();
    const status = row._id.status;
    if (!byFlow.has(id)) byFlow.set(id, { enrolled: 0, active: 0, exited: 0, completed: 0, failed: 0 });
    const stats = byFlow.get(id);
    stats.enrolled += row.count;
    if (status === 'running') stats.active += row.count;
    else if (status === 'exited') stats.exited += row.count;
    else if (status === 'completed') stats.completed += row.count;
    else if (status === 'failed') stats.failed += row.count;
  }
  return byFlow;
}

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const flows = await Flow.find().sort({ created_at: -1 });
    const live = await liveStatsFor(flows.map(f => f._id));
    const out = flows.map(f => {
      const obj = f.toObject();
      obj.stats = { ...obj.stats, ...(live.get(f._id.toString()) || {}) };
      return obj;
    });
    res.json(out);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Not found' });
    const live = await liveStatsFor([flow._id]);
    const obj = flow.toObject();
    obj.stats = { ...obj.stats, ...(live.get(flow._id.toString()) || {}) };
    res.json(obj);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createFlowSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.create(req.body);
    res.status(201).json(flow);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/duplicate', async (req: Request, res: Response, next: Function) => {
  try {
    const source = await Flow.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ error: 'Not found' });

    const requestedName = (req.body?.name || '').toString().trim();
    const newName = requestedName || `${source.name} (copy)`;

    const copy = await Flow.create({
      name: newName,
      description: source.description,
      // Always start duplicates as draft so the user has to consciously
      // activate — prevents accidental double-sends from the cron job
      // attached to the original flow.
      status: 'draft',
      trigger: {
        // Force manual trigger on duplicates; the auto-managed cron job
        // for the source flow stays bound to the source. User must
        // re-configure scheduled trigger explicitly.
        type: 'manual',
        config: {},
      },
      nodes: source.nodes,
      edges: source.edges,
      settings: source.settings,
      stats: { enrolled: 0, completed: 0, active: 0, exited: 0, failed: 0 },
    });

    res.status(201).json(copy);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!flow) return res.status(404).json({ error: 'Not found' });
    res.json(flow);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const deleted = await CronJob.deleteMany({ source_type: 'flow', source_id: req.params.id, auto_managed: true });
    if (deleted.deletedCount > 0) restartCronJobs();
    await Flow.findByIdAndDelete(req.params.id);
    await FlowExecution.deleteMany({ flow_id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/activate', async (req: Request, res: Response, next: Function) => {
  try {
    const reenroll = req.query.reenroll === 'true';
    const flow = await Flow.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'active' } },
      { new: true }
    );
    if (!flow) return res.status(404).json({ error: 'Not found' });

    // Release any scheduled steps that were held when the flow was paused.
    // Subscribers waiting in delays resume on the next processor tick.
    const released = await ScheduledFlowStep.updateMany(
      { flow_id: flow._id, status: 'held' },
      { $set: { status: 'pending' } }
    );
    if (released.modifiedCount > 0) {
      console.log(`[flow activate] released ${released.modifiedCount} held steps for flow ${flow._id}`);
    }

    const triggerType = flow.trigger?.type;
    const config = flow.trigger?.config || {};

    if (triggerType === 'scheduled') {
      const schedule = buildCronSchedule(config);
      const existing = await CronJob.findOne({ source_type: 'flow', source_id: flow._id, auto_managed: true });
      if (existing) {
        await CronJob.findByIdAndUpdate(existing._id, {
          $set: { status: 'active', schedule, config: { flowId: flow._id.toString() }, name: `Flow: ${flow.name}` },
        });
      } else {
        await CronJob.create({
          name: `Flow: ${flow.name}`,
          description: `Auto-managed schedule for flow "${flow.name}"`,
          type: 'flow_trigger',
          schedule,
          config: { flowId: flow._id.toString() },
          status: 'active',
          auto_managed: true,
          source_type: 'flow',
          source_id: flow._id,
        });
      }
      restartCronJobs();

      if (reenroll || !existing) {
        const segmentId = config.segmentId;
        let query: any = { status: 'active' };
        if (segmentId) {
          const segment = await Segment.findById(segmentId);
          if (segment) query = buildSegmentQuery(segment);
        }
        const subscribers = await Subscriber.find(query).select('_id').limit(10000);
        let enrolled = 0;
        for (const sub of subscribers) {
          const ex = await FlowExecution.findOne({ flow_id: flow._id, subscriber_id: sub._id, status: 'running' });
          if (!ex) {
            dispatchFlowExecution(flow._id.toString(), sub._id.toString()).catch(console.error);
            enrolled++;
          }
        }
        if (enrolled > 0) {
          await Flow.findByIdAndUpdate(flow._id, { $inc: { 'stats.enrolled': enrolled, 'stats.active': enrolled } });
        }
      }
    }

    res.json(flow);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'paused' } },
      { new: true }
    );
    if (!flow) return res.status(404).json({ error: 'Not found' });

    const autoCron = await CronJob.findOne({ source_type: 'flow', source_id: flow._id, auto_managed: true });
    if (autoCron && autoCron.status === 'active') {
      await CronJob.findByIdAndUpdate(autoCron._id, { $set: { status: 'paused' } });
      restartCronJobs();
    }

    // Hold any pending scheduled steps for this flow so subscribers waiting
    // in delays don't progress while paused. Released on activate.
    const held = await ScheduledFlowStep.updateMany(
      { flow_id: flow._id, status: 'pending' },
      { $set: { status: 'held' } }
    );

    res.json({ ...flow.toObject(), held_steps: held.modifiedCount });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/executions', async (req: Request, res: Response, next: Function) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const [executions, total] = await Promise.all([
      FlowExecution.find({ flow_id: req.params.id })
        .populate('subscriber_id', 'email name')
        .sort({ entered_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      FlowExecution.countDocuments({ flow_id: req.params.id }),
    ]);

    res.json({ data: executions, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Enroll an entire segment into an active flow. Works for any trigger type.
// Skips subscribers already running through this flow.
router.post('/:id/enroll-segment', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Not found' });
    if (flow.status !== 'active') return res.status(400).json({ error: 'Flow is not active. Activate it first.' });

    const { segment_id } = req.body || {};
    if (!segment_id) return res.status(400).json({ error: 'segment_id required' });

    const segment = await Segment.findById(segment_id);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    const query = buildSegmentQuery(segment);
    const subscribers = await Subscriber.find(query).select('_id').limit(10000);

    const triggerNode = flow.nodes.find(n => n.type === 'trigger');
    if (!triggerNode) return res.status(400).json({ error: 'Flow has no trigger node' });

    // Stagger enrollments through the durable scheduler so we don't fire
    // hundreds of sends in the same second. Each subscriber gets a
    // FlowExecution upfront (so it shows in the executions list) but the
    // first walk is deferred via ScheduledFlowStep — picked up by the
    // flow_step_processor cron.
    const spreadSec = Math.max(0, flow.settings?.enrollment_spread_seconds ?? 10);
    const now = Date.now();

    let enrolled = 0;
    let skipped = 0;
    for (let i = 0; i < subscribers.length; i++) {
      const sub = subscribers[i];
      const existing = await FlowExecution.findOne({ flow_id: flow._id, subscriber_id: sub._id, status: 'running' });
      if (existing) { skipped++; continue; }

      if (spreadSec === 0) {
        // Fire-and-forget — same as before, useful for small/instant enrollments
        dispatchFlowExecution(flow._id.toString(), sub._id.toString()).catch(console.error);
      } else {
        const execution = await FlowExecution.create({
          flow_id: flow._id,
          subscriber_id: sub._id,
          status: 'running',
          entered_at: new Date(),
        });
        await ScheduledFlowStep.create({
          flow_execution_id: execution._id,
          flow_id: flow._id,
          subscriber_id: sub._id,
          next_node_id: triggerNode.id,
          fire_at: new Date(now + i * spreadSec * 1000),
          status: 'pending',
        });
      }
      enrolled++;
    }
    if (enrolled > 0) {
      await Flow.findByIdAndUpdate(flow._id, { $inc: { 'stats.enrolled': enrolled, 'stats.active': enrolled } });
    }
    res.json({
      enrolled,
      skipped,
      segment_name: segment.name,
      segment_size: subscribers.length,
      spread_seconds: spreadSec,
      eta_minutes: spreadSec > 0 ? Math.ceil((enrolled * spreadSec) / 60) : 0,
    });
  } catch (error) {
    next(error);
  }
});

// Manually enroll a subscriber (or list of subscribers) into a flow
router.post('/:id/enroll', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Not found' });
    if (flow.status !== 'active') return res.status(400).json({ error: 'Flow is not active' });

    const { subscriber_ids } = req.body;
    if (!Array.isArray(subscriber_ids) || subscriber_ids.length === 0) {
      return res.status(400).json({ error: 'subscriber_ids array required' });
    }

    let enrolled = 0;
    for (const subId of subscriber_ids) {
      const existing = await FlowExecution.findOne({ flow_id: flow._id, subscriber_id: subId, status: 'running' });
      if (!existing) {
        dispatchFlowExecution(flow._id.toString(), subId).catch(console.error);
        enrolled++;
      }
    }

    await Flow.findByIdAndUpdate(flow._id, { $inc: { 'stats.enrolled': enrolled, 'stats.active': enrolled } });
    res.json({ enrolled, total: subscriber_ids.length });
  } catch (error) {
    next(error);
  }
});

export { router as flowRoutes };
