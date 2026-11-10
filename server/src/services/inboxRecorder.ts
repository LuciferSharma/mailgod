import crypto from 'crypto';
import mongoose from 'mongoose';
import { Message, MessageSourceType } from '../models/message';
import { Campaign } from '../models/campaign';
import { OneOffSend } from '../models/oneOffSend';
import { FlowStepConversation } from '../models/flowStepConversation';
import { Flow } from '../models/flow';
import { config } from '../config';
import { seedStageOnSend } from './pipelineAuto';

export function generateReplyToken(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 10);
}

export function buildReplyToAddress(token: string): string {
  return `reply+${token}@${config.replyDomain}`;
}

export interface RecordOutboundParams {
  source_type: MessageSourceType;
  source_id: string;
  flow_node_id?: string | null;
  subscriber_id: string;
  to_address: string;
  from_address: string;
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject: string;
  variables: Record<string, any>;
  sendgrid_message_id: string | null;
  mailbox_id?: any;
  in_reply_to_message_id?: string | null;
  status_summary?: string;
  reply_token?: string;
  rfc_message_id?: string | null;
  html_body?: string | null;
  text_body?: string | null;
}

export async function recordOutboundMessage(
  params: RecordOutboundParams
): Promise<{ message_id: string; reply_token: string }> {
  const reply_token = params.reply_token || generateReplyToken();
  const now = new Date();

  const message = await Message.create({
    direction: 'outbound',
    source_type: params.source_type,
    source_id: params.source_id,
    flow_node_id: params.flow_node_id || null,
    subscriber_id: params.subscriber_id,
    to_address: params.to_address,
    cc_addresses: params.cc_addresses || [],
    bcc_addresses: params.bcc_addresses || [],
    from_address: params.from_address,
    subject_override: params.subject,
    variables: params.variables,
    reply_token,
    sendgrid_message_id: params.sendgrid_message_id,
    mailbox_id: params.mailbox_id || null,
    rfc_message_id: params.rfc_message_id || null,
    in_reply_to_message_id: params.in_reply_to_message_id || null,
    html_body: params.html_body || null,
    text_body: params.text_body || null,
    sent_at: now,
    status_summary: params.status_summary || 'sent',
  });

  await bumpSourceOnSend(params.source_type, params.source_id, params.flow_node_id || null, now);

  // Auto-pipeline: place a brand-new conversation at "New" (no-op if it already
  // has a stage — a later send must not reset an advanced deal). Best-effort.
  await seedStageOnSend({
    subscriber_id: params.subscriber_id,
    source_type: params.source_type,
    source_id: params.source_id,
    flow_node_id: params.flow_node_id || null,
  });

  return { message_id: (message._id as mongoose.Types.ObjectId).toString(), reply_token };
}

async function bumpSourceOnSend(
  source_type: MessageSourceType,
  source_id: string,
  flow_node_id: string | null,
  at: Date
) {
  if (source_type === 'campaign') {
    await Campaign.findByIdAndUpdate(source_id, {
      $set: { inbox_last_message_at: at },
    });
    return;
  }
  if (source_type === 'one_off') {
    await OneOffSend.findByIdAndUpdate(source_id, {
      $set: { inbox_last_message_at: at },
      $inc: { 'send_summary.sent': 1 },
    });
    return;
  }
  if (source_type === 'flow_step') {
    if (!flow_node_id) return;
    const flow = await Flow.findById(source_id).select('nodes name').lean();
    let nodeLabel = '';
    if (flow && Array.isArray((flow as any).nodes)) {
      const node = (flow as any).nodes.find((n: any) => n.id === flow_node_id);
      nodeLabel = node?.data?.label || node?.data?.subject || flow_node_id;
    }
    await FlowStepConversation.findOneAndUpdate(
      { flow_id: source_id, node_id: flow_node_id },
      {
        $set: { inbox_last_message_at: at, node_label: nodeLabel },
        $setOnInsert: { first_sent_at: at },
        $inc: { recipient_count: 1 },
      },
      { upsert: true, new: true }
    );
  }
}

export async function bumpSourceOnInboundReply(
  source_type: MessageSourceType,
  source_id: string,
  flow_node_id: string | null,
  at: Date
) {
  if (source_type === 'campaign') {
    await Campaign.findByIdAndUpdate(source_id, {
      $set: { inbox_last_message_at: at },
      $inc: { reply_count: 1 },
    });
    return;
  }
  if (source_type === 'one_off') {
    await OneOffSend.findByIdAndUpdate(source_id, {
      $set: { inbox_last_message_at: at },
      $inc: { reply_count: 1 },
    });
    return;
  }
  if (source_type === 'flow_step' && flow_node_id) {
    await FlowStepConversation.findOneAndUpdate(
      { flow_id: source_id, node_id: flow_node_id },
      {
        $set: { inbox_last_message_at: at },
        $inc: { reply_count: 1 },
      }
    );
  }
}

export async function incrementCampaignRecipientCount(
  source_id: string,
  at: Date
): Promise<void> {
  await Campaign.findByIdAndUpdate(source_id, {
    $set: { inbox_last_message_at: at },
  });
}

export async function setCampaignRenderedHtml(
  source_id: string,
  rendered_html: string
): Promise<void> {
  await Campaign.findByIdAndUpdate(source_id, { $set: { rendered_html } });
}
