import { sendEmail as sendEmailService } from '../../services/emailService';
import { Subscriber } from '../../models/subscriber';
import { FlowExecution } from '../../models/flowExecution';
import { Campaign } from '../../models/campaign';

export async function sendFlowEmail(params: {
  subscriberId: string;
  templateId: string;
  flowId: string;
  flowNodeId: string;
  flowExecutionId: string;
  variables?: Record<string, any>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Look up the FIRST outbound message for this flow+subscriber so the new
  // send threads under it in the recipient's mail client:
  //   - rfc_message_id → In-Reply-To header
  //   - subject        → re-used with "Re:" prefix so subject-based
  //                      threading (Outlook) also works
  const { Message } = await import('../../models/message');
  const firstMessage: any = await Message.findOne({
    source_type: 'flow_step',
    source_id: params.flowId,
    subscriber_id: params.subscriberId,
    direction: 'outbound',
  }).sort({ created_at: 1 }).select('rfc_message_id subject_override').lean();

  const parentRfcId = firstMessage?.rfc_message_id || null;
  let subjectOverride: string | undefined;
  if (firstMessage?.subject_override) {
    const base = firstMessage.subject_override;
    subjectOverride = base.toLowerCase().startsWith('re:') ? base : `Re: ${base}`;
  }

  return sendEmailService({
    subscriberId: params.subscriberId,
    templateId: params.templateId,
    flowId: params.flowId,
    flowNodeId: params.flowNodeId,
    flowExecutionId: params.flowExecutionId,
    variables: params.variables,
    inReplyToRfcId: parentRfcId,
    subjectOverride,
  });
}

export async function sendCampaignEmail(params: {
  subscriberId: string;
  templateId: string;
  campaignId: string;
  variables?: Record<string, any>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendEmailService({
    subscriberId: params.subscriberId,
    templateId: params.templateId,
    campaignId: params.campaignId,
    variables: params.variables,
  });
}

/**
 * Returns true if the subscriber has sent any inbound (non-auto) reply tied
 * to this flow. Used to short-circuit the workflow before further sends.
 */
export async function subscriberRepliedToFlow(params: {
  subscriberId: string;
  flowId: string;
}): Promise<boolean> {
  const { Message } = await import('../../models/message');
  const exists = await Message.exists({
    source_type: 'flow_step',
    source_id: params.flowId,
    subscriber_id: params.subscriberId,
    direction: 'inbound',
    is_auto_reply: { $ne: true },
  });
  return !!exists;
}

export async function flowExitOnReplyEnabled(flowId: string): Promise<boolean> {
  const { Flow } = await import('../../models/flow');
  const f: any = await Flow.findById(flowId).select('settings.exit_on_reply').lean();
  return f?.settings?.exit_on_reply !== false;
}

export async function updateCampaignStats(params: {
  campaignId: string;
  sent?: number;
  failed?: number;
}): Promise<void> {
  const inc: Record<string, number> = {};
  if (params.sent) inc['stats.sent'] = params.sent;
  if (params.failed) inc['stats.bounced'] = params.failed;
  if (Object.keys(inc).length === 0) return;
  await Campaign.findByIdAndUpdate(params.campaignId, { $inc: inc });
}

export async function evaluateCondition(params: {
  subscriberId: string;
  condition: { field: string; operator: string; value: any };
}): Promise<boolean> {
  const subscriber = await Subscriber.findById(params.subscriberId).lean();
  if (!subscriber) return false;

  const { field, operator, value } = params.condition;
  const fieldValue = getNestedValue(subscriber, field);

  switch (operator) {
    case 'equals': return fieldValue == value;
    case 'not_equals': return fieldValue != value;
    case 'contains': return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'gt': return Number(fieldValue) > Number(value);
    case 'gte': return Number(fieldValue) >= Number(value);
    case 'lt': return Number(fieldValue) < Number(value);
    case 'lte': return Number(fieldValue) <= Number(value);
    case 'in': return Array.isArray(value) ? value.includes(fieldValue) : false;
    case 'exists': return fieldValue !== null && fieldValue !== undefined;
    case 'not_exists': return fieldValue === null || fieldValue === undefined;
    default: return false;
  }
}

export async function updateSubscriberProfile(params: {
  subscriberId: string;
  updates: Record<string, any>;
}): Promise<void> {
  await Subscriber.findByIdAndUpdate(params.subscriberId, { $set: params.updates });
}

export async function addSubscriberTag(params: {
  subscriberId: string;
  tag: string;
}): Promise<void> {
  await Subscriber.findByIdAndUpdate(params.subscriberId, {
    $addToSet: { tags: params.tag },
  });
}

export async function removeSubscriberTag(params: {
  subscriberId: string;
  tag: string;
}): Promise<void> {
  await Subscriber.findByIdAndUpdate(params.subscriberId, {
    $pull: { tags: params.tag },
  });
}

export async function updateFlowExecution(params: {
  executionId: string;
  nodeId: string;
  action: string;
  status?: string;
  result?: any;
}): Promise<void> {
  const update: any = {
    current_node_id: params.nodeId,
    $push: {
      history: {
        node_id: params.nodeId,
        action: params.action,
        timestamp: new Date(),
        result: params.result,
      },
    },
  };
  if (params.status) {
    update.status = params.status;
    if (params.status === 'completed' || params.status === 'exited') {
      update.completed_at = new Date();
    }
  }
  await FlowExecution.findByIdAndUpdate(params.executionId, update);
}

export async function sendWebhookRequest(params: {
  url: string;
  payload: Record<string, any>;
}): Promise<{ status: number }> {
  const response = await fetch(params.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.payload),
  });
  return { status: response.status };
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
