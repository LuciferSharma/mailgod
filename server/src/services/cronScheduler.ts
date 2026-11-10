import cron from 'node-cron';
import { config } from '../config';
import { CronJob } from '../models/cronJob';
import { CronJobRun } from '../models/cronJobRun';
import { refreshSegmentCount, buildSegmentQuery } from './segmentService';
import { Segment } from '../models/segment';
import { Flow } from '../models/flow';
import { Campaign } from '../models/campaign';
import { Subscriber } from '../models/subscriber';
import { FlowExecution } from '../models/flowExecution';
import { EmailEvent } from '../models/emailEvent';
import { ScheduledFlowStep } from '../models/scheduledFlowStep';
import { dispatchFlowExecution, dispatchCampaignSend } from './flowDispatcher';
import { resumeFlowFromNode } from './flowExecutor';
import { processDueOneOffSends } from '../routes/oneOffSends';

const activeCrons = new Map<string, cron.ScheduledTask>();

export function initCronScheduler() {
  ensureSystemCronJobs()
    .then(rescueOrphanedFlowExecutions)
    .then(loadCronJobs)
    .catch(err => console.error('cron init:', err));
  cron.schedule('*/5 * * * *', loadCronJobs);
  console.log('Cron scheduler initialized');
}

/**
 * One-time rescue: before the durable scheduler existed, in-flight flow
 * delays used setTimeout — these die on restart and leave FlowExecutions
 * stuck in 'running' with no way to resume. This finds executions that
 * are 'running' but have no pending/claimed/held ScheduledFlowStep, and
 * schedules a wakeup at their current_node_id. Idempotent: a second run
 * finds zero orphans.
 */
async function rescueOrphanedFlowExecutions(): Promise<void> {
  try {
    const { FlowExecution: FE } = await import('../models/flowExecution');
    const running = await FE.find({ status: 'running', current_node_id: { $ne: null } })
      .select('_id flow_id subscriber_id current_node_id')
      .lean();

    if (running.length === 0) {
      console.log('[migration] no orphaned flow executions');
      return;
    }

    // Cache flow nodes so we don't re-query for every execution
    const flowCache = new Map<string, any>();
    const getFlow = async (id: string) => {
      const key = id.toString();
      if (!flowCache.has(key)) {
        const { Flow: F } = await import('../models/flow');
        flowCache.set(key, await F.findById(id).select('nodes').lean());
      }
      return flowCache.get(key);
    };

    let rescued = 0;
    let alreadyHasStep = 0;
    let skippedRisky = 0;
    for (const ex of running) {
      const hasStep = await ScheduledFlowStep.exists({
        flow_execution_id: ex._id,
        status: { $in: ['pending', 'claimed', 'held'] },
      });
      if (hasStep) { alreadyHasStep++; continue; }

      // Only rescue executions stuck at a `delay` node — those are the
      // setTimeout victims and safe to resume. Anything else (mid-send,
      // mid-condition, etc.) could re-send an email; leave alone.
      const flow = await getFlow(ex.flow_id.toString());
      const node = flow?.nodes?.find((n: any) => n.id === ex.current_node_id);
      if (node?.type !== 'delay') {
        skippedRisky++;
        continue;
      }

      await ScheduledFlowStep.create({
        flow_execution_id: ex._id,
        flow_id: ex.flow_id,
        subscriber_id: ex.subscriber_id,
        next_node_id: ex.current_node_id,
        fire_at: new Date(), // immediate — they're already overdue
        status: 'pending',
      });
      rescued++;
    }
    console.log(`[migration] flow execution rescue: ${rescued} rescued, ${alreadyHasStep} already had a step, ${skippedRisky} skipped (non-delay node, risky to resume)`);
  } catch (err) {
    console.error('[migration] rescueOrphanedFlowExecutions failed:', err);
    // Don't block boot
  }
}

/**
 * Auto-create system-managed cron jobs (engagement penalty, etc.) on first boot.
 * Idempotent: re-running is a no-op.
 */
async function ensureSystemCronJobs(): Promise<void> {
  // Sender pool crons: always exist in Mongo; the wrong instance is a no-op
  // because executeCronJob checks config.mailboxPoolEnabled per tick. This
  // avoids two instances fighting over the CronJob.status field.
  for (const job of [
    { type: 'mailbox_pool_processor', name: 'Mailbox pool processor', schedule: '* * * * *',
      description: 'Every minute: sends the next queued pool email from each eligible sender (window, warmup allowance, gap, auto-pause). No-op unless MAILBOX_POOL_ENABLED=true on the instance.' },
    { type: 'imap_poller', name: 'Mailbox IMAP poller', schedule: '*/2 * * * *',
      description: 'Every 2 minutes: reads owned mailboxes over IMAP, threads replies into the inbox, records bounces and opt-outs. No-op unless MAILBOX_POOL_ENABLED=true on the instance.' },
  ]) {
    const exists = await CronJob.findOne({ auto_managed: true, source_type: 'system', type: job.type });
    if (!exists) {
      await CronJob.create({ ...job, config: {}, status: 'active', auto_managed: true, source_type: 'system' });
      console.log(`[cron] auto-created ${job.name} job`);
    } else if (exists.status !== 'active') {
      // Migration from the earlier flip-flop: unpause once so both instances stop toggling.
      await CronJob.updateOne({ _id: exists._id }, { $set: { status: 'active' } });
      console.log(`[cron] re-activated ${job.name} job`);
    }
  }

  const exists = await CronJob.findOne({
    auto_managed: true,
    source_type: 'system',
    name: 'Engagement silence penalty',
  });
  if (!exists) {
    await CronJob.create({
      name: 'Engagement silence penalty',
      description: 'Daily: deduct -2 from engagement score per 30 days subscribers go without engaging.',
      type: 'engagement_penalty',
      schedule: '7 3 * * *',
      config: {},
      status: 'active',
      auto_managed: true,
      source_type: 'system',
    });
    console.log('[cron] auto-created Engagement silence penalty job');
  }

  const oneOffProcessorExists = await CronJob.findOne({
    auto_managed: true,
    source_type: 'system',
    type: 'one_off_processor',
  });
  if (!oneOffProcessorExists) {
    await CronJob.create({
      name: 'Scheduled one-off processor',
      description: 'Every minute: claims due scheduled one-off emails and dispatches them. Survives deploys/restarts.',
      type: 'one_off_processor',
      schedule: '* * * * *',
      config: {},
      status: 'active',
      auto_managed: true,
      source_type: 'system',
    });
    console.log('[cron] auto-created Scheduled one-off processor job');
  }

  const stepProcessorExists = await CronJob.findOne({
    auto_managed: true,
    source_type: 'system',
    type: 'flow_step_processor',
  });
  if (!stepProcessorExists) {
    await CronJob.create({
      name: 'Flow step processor',
      description: 'Every minute: claims due ScheduledFlowSteps (delay-node wakeups, staggered enrollments) and resumes flow executions. Survives deploys/restarts.',
      type: 'flow_step_processor',
      schedule: '* * * * *',
      config: {},
      status: 'active',
      auto_managed: true,
      source_type: 'system',
    });
    console.log('[cron] auto-created Flow step processor job');
  }
}

async function loadCronJobs() {
  const jobs = await CronJob.find({ status: 'active' });

  const activeIds = new Set(jobs.map(j => j._id.toString()));
  for (const [id, task] of activeCrons) {
    if (!activeIds.has(id)) {
      task.stop();
      activeCrons.delete(id);
    }
  }

  for (const job of jobs) {
    const id = job._id.toString();
    if (activeCrons.has(id)) continue;

    if (!cron.validate(job.schedule)) {
      console.warn(`Invalid cron schedule for job ${job.name}: ${job.schedule}`);
      continue;
    }

    const task = cron.schedule(job.schedule, async () => {
      console.log(`Running cron job: ${job.name}`);
      try {
        await executeCronJob(job);
        await CronJob.findByIdAndUpdate(id, { last_run_at: new Date() });
      } catch (err) {
        console.error(`Cron job ${job.name} failed:`, err);
      }
    });

    activeCrons.set(id, task);
    console.log(`Scheduled cron job: ${job.name} (${job.schedule})`);
  }
}

export interface CronJobResult {
  type: string;
  summary: string;
  details: Record<string, any>;
}

export async function runCronJobNow(job: InstanceType<typeof CronJob>): Promise<CronJobResult> {
  return executeCronJob(job);
}

function isWarningResult(result: CronJobResult): boolean {
  const summary = (result.summary || '').toLowerCase();
  const warningPhrases = [
    'not found', 'not active', 'not configured', 'no flowid',
    'no campaignid', 'unknown job type', 'is draft', 'is paused',
    'is cancelled', 'is sent', 'failed',
  ];
  return warningPhrases.some(p => summary.includes(p));
}

async function executeCronJob(job: InstanceType<typeof CronJob>): Promise<CronJobResult> {
  const startTime = Date.now();
  let result: CronJobResult;
  let status: 'success' | 'warning' | 'error' = 'success';

  try {
    result = await executeCronJobInner(job);
    if (isWarningResult(result)) status = 'warning';
  } catch (err: any) {
    status = 'error';
    result = {
      type: job.type,
      summary: `Error: ${err.message || 'Unknown error'}`,
      details: {},
    };
  }

  try {
    await CronJobRun.create({
      cron_job_id: job._id,
      type: job.type,
      status,
      summary: result.summary,
      details: result.details,
      ran_at: new Date(),
      duration_ms: Date.now() - startTime,
    });
  } catch (persistErr) {
    console.error('Failed to persist cron job run:', persistErr);
  }

  return result;
}

async function executeCronJobInner(job: InstanceType<typeof CronJob>): Promise<CronJobResult> {
  switch (job.type) {
    case 'segment_refresh': {
      const segments = await Segment.find();
      const counts: Record<string, number> = {};
      for (const segment of segments) {
        const count = await refreshSegmentCount(segment._id.toString());
        counts[segment.name] = count ?? 0;
      }
      return {
        type: 'segment_refresh',
        summary: `Refreshed ${segments.length} segment${segments.length !== 1 ? 's' : ''}`,
        details: { segments_refreshed: segments.length, counts },
      };
    }
    case 'flow_trigger': {
      const flowId = job.config?.flowId;
      if (!flowId) return { type: 'flow_trigger', summary: 'No flowId configured', details: {} };
      const flow = await Flow.findById(flowId);
      if (!flow) return { type: 'flow_trigger', summary: 'Flow not found', details: { flowId } };
      if (flow.status !== 'active') return { type: 'flow_trigger', summary: `Flow "${flow.name}" is ${flow.status}, not active`, details: { flowId, status: flow.status } };

      let query: any = { status: 'active' };
      if (flow.trigger?.config?.segmentId) {
        const segment = await Segment.findById(flow.trigger.config.segmentId);
        if (segment) query = buildSegmentQuery(segment);
      }

      const subscribers = await Subscriber.find(query).select('_id').limit(10000);
      let enrolled = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const sub of subscribers) {
        const existing = await FlowExecution.findOne({ flow_id: flow._id, subscriber_id: sub._id, status: 'running' });
        if (!existing) {
          try {
            await dispatchFlowExecution(flow._id.toString(), sub._id.toString());
            enrolled++;
          } catch (err: any) {
            failed++;
            if (errors.length < 5) errors.push(`${sub._id}: ${err.message}`);
          }
        } else {
          skipped++;
        }
      }
      if (enrolled > 0) {
        await Flow.findByIdAndUpdate(flow._id, { $inc: { 'stats.enrolled': enrolled, 'stats.active': enrolled } });
      }

      const emailOutcomes = await EmailEvent.aggregate([
        { $match: { flow_id: flow._id, timestamp: { $gte: new Date(Date.now() - 60000) } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
      ]);
      const outcomes: Record<string, number> = {};
      emailOutcomes.forEach((e: any) => { outcomes[e._id] = e.count; });
      const emailsSent = outcomes['sent'] || 0;
      const emailsBounced = outcomes['bounce'] || 0;

      const parts: string[] = [];
      if (enrolled > 0) parts.push(`Enrolled ${enrolled} into "${flow.name}"`);
      if (emailsSent > 0) parts.push(`${emailsSent} email${emailsSent !== 1 ? 's' : ''} sent`);
      if (emailsBounced > 0) parts.push(`${emailsBounced} bounced`);
      if (skipped > 0) parts.push(`${skipped} already running`);
      if (failed > 0) parts.push(`${failed} failed to enroll`);
      if (parts.length === 0) parts.push(`No subscribers matched for "${flow.name}"`);

      return {
        type: 'flow_trigger',
        summary: parts.join(', '),
        details: { flowId: flow._id.toString(), flowName: flow.name, matched: subscribers.length, enrolled, skipped, failed, emailsSent, emailsBounced, errors },
      };
    }
    case 'campaign_send': {
      const campaignId = job.config?.campaignId;
      if (!campaignId) return { type: 'campaign_send', summary: 'No campaignId configured', details: {} };

      // Atomic claim: only one cron firing can transition scheduled → sending.
      const campaign = await Campaign.findOneAndUpdate(
        { _id: campaignId, status: 'scheduled' },
        { $set: { status: 'sending', started_at: new Date() } },
        { new: true }
      );
      if (!campaign) {
        const existing = await Campaign.findById(campaignId);
        if (!existing) return { type: 'campaign_send', summary: 'Campaign not found', details: { campaignId } };
        return { type: 'campaign_send', summary: `Campaign "${existing.name}" is ${existing.status}, not scheduled`, details: { campaignId, status: existing.status } };
      }

      const segment = await Segment.findById(campaign.segment_id);
      if (!segment) return { type: 'campaign_send', summary: 'Segment not found', details: { campaignId } };

      const query = buildSegmentQuery(segment);
      const total = await Subscriber.countDocuments(query);

      await Campaign.findByIdAndUpdate(campaign._id, {
        $set: { 'stats.total': total },
      });

      dispatchCampaignSend(campaign._id.toString(), query, campaign.send_config).catch(err => {
        console.error('Cron campaign send error:', err);
        Campaign.findByIdAndUpdate(campaign._id, { $set: { status: 'paused' } }).catch(() => {});
      });
      return {
        type: 'campaign_send',
        summary: `Started sending "${campaign.name}" to ${total} subscriber${total !== 1 ? 's' : ''}`,
        details: { campaignId: campaign._id.toString(), campaignName: campaign.name, total, segmentName: segment.name },
      };
    }
    case 'one_off_processor': {
      const { dispatched, failed } = await processDueOneOffSends();
      return {
        type: 'one_off_processor',
        summary:
          dispatched === 0 && failed === 0
            ? 'No due scheduled sends'
            : `${dispatched} scheduled send${dispatched !== 1 ? 's' : ''} dispatched${failed > 0 ? `, ${failed} failed` : ''}`,
        details: { dispatched, failed },
      };
    }
    case 'mailbox_pool_processor': {
      if (!config.mailboxPoolEnabled) return { type: 'mailbox_pool_processor', summary: 'Not the pool instance', details: { skipped: true } };
      const { processPoolQueue } = await import('./poolDispatcher');
      const r = await processPoolQueue();
      return {
        type: 'mailbox_pool_processor',
        summary: r.sent + r.failed + r.skipped === 0 ? 'No eligible pool sends' : `${r.sent} sent${r.skipped ? `, ${r.skipped} skipped` : ''}${r.failed ? `, ${r.failed} failed` : ''}`,
        details: r,
      };
    }
    case 'imap_poller': {
      if (!config.mailboxPoolEnabled) return { type: 'imap_poller', summary: 'Not the pool instance', details: { skipped: true } };
      const { pollAllMailboxes } = await import('./imapPoller');
      const r = await pollAllMailboxes();
      return {
        type: 'imap_poller',
        summary: r.fetched === 0 ? `No new mail (${r.mailboxes} mailboxes)` : `${r.fetched} new: ${r.replies} replies, ${r.bounces} bounces${r.errors ? `, ${r.errors} errors` : ''}`,
        details: r,
      };
    }
    case 'flow_step_processor': {
      const maxPerRun = 200;
      const now = new Date();
      const claimed: any[] = [];

      // Atomic claim loop: each findOneAndUpdate transitions exactly one
      // pending+due step → claimed. Stops when no more due steps OR cap hit.
      for (let i = 0; i < maxPerRun; i++) {
        const step = await ScheduledFlowStep.findOneAndUpdate(
          { status: 'pending', fire_at: { $lte: now } },
          { $set: { status: 'claimed', claimed_at: new Date() }, $inc: { attempts: 1 } },
          { new: true, sort: { fire_at: 1 } }
        );
        if (!step) break;
        claimed.push(step);
      }

      let resumed = 0;
      let failed = 0;
      for (const step of claimed) {
        try {
          await resumeFlowFromNode(
            step.flow_id.toString(),
            step.flow_execution_id.toString(),
            step.subscriber_id.toString(),
            step.next_node_id
          );
          await ScheduledFlowStep.findByIdAndUpdate(step._id, { $set: { status: 'completed' } });
          resumed++;
        } catch (err: any) {
          failed++;
          await ScheduledFlowStep.findByIdAndUpdate(step._id, {
            $set: { status: 'failed', last_error: err?.message || String(err) },
          });
          console.error(`[flow_step_processor] step ${step._id} failed:`, err);
        }
      }

      // Recover stuck claims (worker died mid-step). Anything claimed > 10 min ago
      // gets bounced back to pending so the next run can retry.
      const recovered = await ScheduledFlowStep.updateMany(
        { status: 'claimed', claimed_at: { $lt: new Date(Date.now() - 10 * 60_000) } },
        { $set: { status: 'pending', claimed_at: null } }
      );

      const parts: string[] = [];
      if (resumed > 0) parts.push(`${resumed} step${resumed !== 1 ? 's' : ''} resumed`);
      if (failed > 0) parts.push(`${failed} failed`);
      if (recovered.modifiedCount > 0) parts.push(`${recovered.modifiedCount} stuck recovered`);
      if (parts.length === 0) parts.push('No due steps');

      return {
        type: 'flow_step_processor',
        summary: parts.join(', '),
        details: { resumed, failed, recovered: recovered.modifiedCount, claimed: claimed.length },
      };
    }
    case 'engagement_penalty': {
      const now = Date.now();
      const day = 86_400_000;
      const subs = await Subscriber.find({ status: 'active' })
        .select('_id engagement_last_event_at created_at engagement_silence_penalty')
        .lean();
      let updated = 0;
      const ops: any[] = [];
      for (const s of subs) {
        const last = (s as any).engagement_last_event_at || (s as any).created_at;
        const days = last ? Math.floor((now - new Date(last).getTime()) / day) : 0;
        const penalty = Math.floor(days / 30) * -2;
        if (penalty !== ((s as any).engagement_silence_penalty || 0)) {
          ops.push({
            updateOne: {
              filter: { _id: s._id },
              update: { $set: { engagement_silence_penalty: penalty } },
            },
          });
          updated++;
        }
      }
      if (ops.length > 0) await Subscriber.bulkWrite(ops, { ordered: false });
      return {
        type: 'engagement_penalty',
        summary: `Updated silence penalty for ${updated} of ${subs.length} active subscribers`,
        details: { processed: subs.length, updated },
      };
    }
    default:
      return { type: job.type, summary: `Unknown job type: ${job.type}`, details: {} };
  }
}

export function stopCronJob(id: string) {
  const task = activeCrons.get(id);
  if (task) {
    task.stop();
    activeCrons.delete(id);
  }
}

export function restartCronJobs() {
  for (const [, task] of activeCrons) {
    task.stop();
  }
  activeCrons.clear();
  loadCronJobs();
}
