import { config } from '../config';
import { executeFlowInProcess } from './flowExecutor';
import { getTemporalClient } from '../temporal/client';
import { Flow } from '../models/flow';
import { FlowExecution } from '../models/flowExecution';
import { Subscriber } from '../models/subscriber';
import { buildSegmentQuery } from './segmentService';
import { Segment } from '../models/segment';
import crypto from 'crypto';
import { sendEmail } from './emailService';
import { Campaign } from '../models/campaign';
import { Template } from '../models/template';
import { Message } from '../models/message';
import { rateLimiter } from '../utils/rateLimiter';

export async function dispatchFlowExecution(flowId: string, subscriberId: string): Promise<void> {
  if (config.useTemporal) {
    const flow = await Flow.findById(flowId);
    if (!flow) throw new Error('Flow not found');

    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber || subscriber.status !== 'active') return;

    const execution = await FlowExecution.create({
      flow_id: flowId,
      subscriber_id: subscriberId,
      status: 'running',
      entered_at: new Date(),
    });

    const client = await getTemporalClient();
    await client.workflow.start('executeFlow', {
      taskQueue: 'email-marketing',
      workflowId: `flow-${flowId}-${subscriberId}-${Date.now()}`,
      args: [{
        flowId,
        subscriberId,
        executionId: execution._id.toString(),
        nodes: flow.nodes,
        edges: flow.edges,
      }],
    });
  } else {
    await executeFlowInProcess(flowId, subscriberId);
  }
}

export async function dispatchCampaignSend(
  campaignId: string,
  query: any,
  sendConfig: { batch_size: number; emails_per_hour: number },
): Promise<void> {
  if (config.useTemporal) {
    const subscriberIds = await Subscriber.find(query).select('_id').lean();
    const ids = subscriberIds.map(s => s._id.toString());

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const client = await getTemporalClient();
    await client.workflow.start('sendCampaign', {
      taskQueue: 'email-marketing',
      workflowId: `campaign-${campaignId}-${Date.now()}`,
      args: [{
        campaignId,
        templateId: campaign.template_id.toString(),
        subscriberIds: ids,
        batchSize: sendConfig.batch_size || 500,
        emailsPerHour: sendConfig.emails_per_hour || 5000,
      }],
    });
  } else {
    await processCampaignSendInProcess(campaignId, query, sendConfig);
  }
}

async function processCampaignSendInProcess(
  campaignId: string,
  query: any,
  sendConfig: { batch_size: number; emails_per_hour: number },
) {
  const batchSize = sendConfig.batch_size || 500;
  const delayBetweenBatches = Math.ceil((batchSize / sendConfig.emails_per_hour) * 3600_000);
  let skip = 0;

  // Claim ownership of this dispatch. Any older loop running for this campaign
  // will see a different dispatch_id on its next iteration and exit.
  const myDispatchId = crypto.randomBytes(8).toString('hex');
  await Campaign.findByIdAndUpdate(campaignId, { $set: { dispatch_id: myDispatchId } });

  const initialCampaign = await Campaign.findById(campaignId);
  if (initialCampaign && !initialCampaign.rendered_html && initialCampaign.template_id) {
    const tmpl = await Template.findById(initialCampaign.template_id);
    if (tmpl) {
      await Campaign.findByIdAndUpdate(campaignId, {
        $set: { rendered_html: tmpl.html_content, inbox_last_message_at: new Date() },
      });
    }
  }

  while (true) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'sending') break;
    if (campaign.dispatch_id !== myDispatchId) {
      console.log(`[campaign-dispatch] ${campaignId}: superseded by newer dispatch (${campaign.dispatch_id} != ${myDispatchId}), exiting`);
      break;
    }

    const subscribers = await Subscriber.find(query)
      .skip(skip)
      .limit(batchSize)
      .select('_id');

    if (subscribers.length === 0) {
      await Campaign.findByIdAndUpdate(campaignId, {
        $set: { status: 'sent', completed_at: new Date() },
      });
      break;
    }

    for (const sub of subscribers) {
      // Re-check ownership before every send so a superseded loop bails out
      // immediately instead of completing its full batch.
      const liveCampaign = await Campaign.findById(campaignId).select('status dispatch_id').lean();
      if (!liveCampaign || liveCampaign.status !== 'sending' || liveCampaign.dispatch_id !== myDispatchId) {
        return; // exit dispatch entirely
      }

      if (!(await rateLimiter.canSend())) {
        await new Promise(resolve => setTimeout(resolve, 60_000));
        continue;
      }

      // Dedup: skip if we already sent this campaign to this subscriber
      const alreadySent = await Message.exists({
        source_type: 'campaign',
        source_id: campaignId,
        subscriber_id: sub._id,
        direction: 'outbound',
      });
      if (alreadySent) continue;

      const result = await sendEmail({
        subscriberId: sub._id.toString(),
        templateId: campaign.template_id.toString(),
        campaignId,
      });

      if (result.success) {
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.sent': 1 } });
      }
    }

    skip += batchSize;

    const completedAt = new Date();
    const nextAt = delayBetweenBatches > 0
      ? new Date(completedAt.getTime() + delayBetweenBatches)
      : completedAt;
    await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        last_batch_completed_at: completedAt,
        last_batch_size: subscribers.length,
        next_batch_at: nextAt,
      },
    });

    if (delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
}
