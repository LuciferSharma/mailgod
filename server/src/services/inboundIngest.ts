import mongoose from 'mongoose';
import { Message, IMessage } from '../models/message';
import { Subscriber } from '../models/subscriber';
import { EmailEvent } from '../models/emailEvent';
import { Campaign } from '../models/campaign';
import { Mailbox } from '../models/mailbox';
import { generateReplyToken, bumpSourceOnInboundReply } from './inboxRecorder';
import { advanceStage } from './pipelineAuto';
import { applyEngagementEvent } from './engagementScorer';
import { stripQuotedReply, isAutoReply } from '../utils/replyParser';

export interface IngestInboundParams {
  outbound: IMessage;
  toAddress: string;
  fromAddress: string;
  ccAddresses?: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  rawBody?: string;
  headers: Record<string, string>;
  logTag?: string;
}

const OPTOUT_RE = /^\s*(no|nope|no thanks|no thank you|not interested|unsubscribe|stop|remove me|please remove|take me off)\b/i;

/**
 * Shared inbound-reply pipeline used by both the SendGrid Inbound Parse webhook
 * and the IMAP poller: creates the inbound Message on the outbound's thread,
 * bumps conversation counters, scores engagement, tags 'responded', advances
 * the pipeline stage and exits running flows. Returns the inbound Message.
 */
export async function ingestInboundReply(p: IngestInboundParams): Promise<{ inbound: IMessage; autoReply: boolean; optOut: boolean }> {
  const tag = p.logTag || 'inbound';
  const outbound = p.outbound;
  const strippedText = stripQuotedReply(p.textBody || '');
  const now = new Date();
  const autoReply = isAutoReply(p.subject, p.headers);
  const inboundRfcId = (p.headers['message-id'] || '').trim() || null;
  const inboundInReplyTo = (p.headers['in-reply-to'] || '').trim() || null;

  const inbound = await Message.create({
    direction: 'inbound',
    source_type: outbound.source_type,
    source_id: outbound.source_id,
    flow_node_id: outbound.flow_node_id,
    subscriber_id: outbound.subscriber_id,
    mailbox_id: (outbound as any).mailbox_id || null,
    to_address: p.toAddress,
    from_address: p.fromAddress,
    cc_addresses: p.ccAddresses || [],
    subject_override: p.subject,
    variables: {},
    reply_token: generateReplyToken(),
    sendgrid_message_id: null,
    rfc_message_id: inboundRfcId,
    in_reply_to_message_id: outbound._id,
    inbound_in_reply_to: inboundInReplyTo,
    is_auto_reply: autoReply,
    html_body: p.htmlBody || null,
    text_body: strippedText || null,
    raw_body: p.rawBody || p.textBody || null,
    received_at: now,
    status_summary: 'received',
  });

  await bumpSourceOnInboundReply(outbound.source_type, outbound.source_id.toString(), outbound.flow_node_id || null, now);

  let optOut = false;
  if (!autoReply) {
    const subscriberId = outbound.subscriber_id.toString();
    await applyEngagementEvent(subscriberId, 'reply');
    await Subscriber.findByIdAndUpdate(outbound.subscriber_id, { $addToSet: { tags: 'responded' } })
      .catch(err => console.error(`[${tag}] auto-tag failed:`, err));
    await advanceStage({
      subscriber_id: subscriberId,
      source_type: outbound.source_type,
      source_id: outbound.source_id.toString(),
      flow_node_id: outbound.flow_node_id || null,
    }, 'Replied');
    await exitRunningFlows(outbound.subscriber_id, tag);

    // Opt-out by reply ("no", "unsubscribe", "stop" ...). Honoured immediately.
    if (OPTOUT_RE.test(strippedText)) {
      optOut = true;
      await Subscriber.findByIdAndUpdate(outbound.subscriber_id, {
        $set: { status: 'unsubscribed' }, $addToSet: { tags: 'opted-out' },
      }).catch(() => {});
      await EmailEvent.create({
        subscriber_id: outbound.subscriber_id, mailbox_id: (outbound as any).mailbox_id || null,
        sendgrid_message_id: outbound.sendgrid_message_id || '', event: 'unsubscribe',
        metadata: { reason: 'reply opt-out' }, timestamp: now,
      }).catch(() => {});
      await applyEngagementEvent(subscriberId, 'unsubscribe');
      if ((outbound as any).mailbox_id) {
        await Mailbox.updateOne({ _id: (outbound as any).mailbox_id }, { $inc: { 'stats.opted_out_total': 1 } });
      }
    } else if ((outbound as any).mailbox_id) {
      await Mailbox.updateOne({ _id: (outbound as any).mailbox_id }, { $inc: { 'stats.replied_total': 1 } });
    }
  }

  console.log(`[${tag}] reply linked: ${outbound.source_type}:${outbound.source_id} from=${p.fromAddress}${optOut ? ' (OPT-OUT)' : ''}${autoReply ? ' (auto-reply)' : ''}`);
  return { inbound, autoReply, optOut };
}

async function exitRunningFlows(subscriberId: mongoose.Types.ObjectId, tag: string) {
  try {
    const { FlowExecution } = await import('../models/flowExecution');
    const { Flow } = await import('../models/flow');
    const { ScheduledFlowStep } = await import('../models/scheduledFlowStep');
    const running = await FlowExecution.find({ subscriber_id: subscriberId, status: 'running' }).select('_id flow_id').lean();
    for (const ex of running) {
      const flow = await Flow.findById(ex.flow_id).select('settings name').lean();
      if (!flow || (flow as any).settings?.exit_on_reply === false) continue;
      await FlowExecution.findByIdAndUpdate(ex._id, {
        status: 'exited', completed_at: new Date(),
        $push: { history: { node_id: null, action: 'exit_on_reply_realtime', timestamp: new Date(), result: { reason: 'inbound_reply_received' } } },
      });
      const cancelled = await ScheduledFlowStep.updateMany(
        { flow_execution_id: ex._id, status: { $in: ['pending', 'held'] } },
        { $set: { status: 'completed', last_error: 'exit_on_reply_realtime' } }
      );
      console.log(`[${tag}] real-time exit: flow=${(flow as any).name} exec=${ex._id} cancelled_steps=${cancelled.modifiedCount}`);
    }
  } catch (err) {
    console.error(`[${tag}] real-time exit failed:`, err);
  }
}

/**
 * Record a hard bounce detected outside SendGrid (IMAP delivery-status report):
 * EmailEvent + subscriber status + engagement + campaign stats + mailbox stats.
 */
export async function recordBounce(args: {
  subscriberId: mongoose.Types.ObjectId | string;
  mailboxId?: mongoose.Types.ObjectId | string | null;
  outbound?: IMessage | null;
  reason: string;
}): Promise<void> {
  const now = new Date();
  const campaignId = args.outbound && args.outbound.source_type === 'campaign' ? args.outbound.source_id : null;
  await EmailEvent.create({
    subscriber_id: args.subscriberId,
    campaign_id: campaignId,
    mailbox_id: args.mailboxId || null,
    sendgrid_message_id: args.outbound?.sendgrid_message_id || args.outbound?.rfc_message_id || '',
    event: 'bounce',
    metadata: { reason: args.reason.slice(0, 500) },
    timestamp: now,
  });
  await Subscriber.findByIdAndUpdate(args.subscriberId, { $set: { status: 'bounced' } });
  await applyEngagementEvent(args.subscriberId.toString(), 'bounce');
  if (campaignId) await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.bounced': 1 } }).catch(() => {});
  if (args.outbound) await Message.updateOne({ _id: args.outbound._id }, { $set: { status_summary: 'bounced' } });
  if (args.mailboxId) await Mailbox.updateOne({ _id: args.mailboxId }, { $inc: { 'stats.bounced_total': 1 } });
}
