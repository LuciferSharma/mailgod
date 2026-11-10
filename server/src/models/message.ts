import mongoose, { Schema, Document } from 'mongoose';

export type MessageDirection = 'outbound' | 'inbound';
export type MessageSourceType = 'campaign' | 'flow_step' | 'one_off';

export interface IMessage extends Document {
  direction: MessageDirection;
  source_type: MessageSourceType;
  source_id: mongoose.Types.ObjectId;
  flow_node_id: string | null;
  subscriber_id: mongoose.Types.ObjectId;
  mailbox_id: mongoose.Types.ObjectId | null;
  to_address: string;
  cc_addresses: string[];
  bcc_addresses: string[];
  from_address: string;
  subject_override: string | null;
  variables: Record<string, any>;
  reply_token: string;
  sendgrid_message_id: string | null;
  rfc_message_id: string | null;
  in_reply_to_message_id: mongoose.Types.ObjectId | null;
  inbound_in_reply_to: string | null;
  is_auto_reply: boolean;
  html_body: string | null;
  text_body: string | null;
  raw_body: string | null;
  sent_at: Date | null;
  received_at: Date | null;
  status_summary: string;
  created_at: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    direction: { type: String, enum: ['outbound', 'inbound'], required: true },
    source_type: { type: String, enum: ['campaign', 'flow_step', 'one_off'], required: true },
    source_id: { type: Schema.Types.ObjectId, required: true },
    flow_node_id: { type: String, default: null },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    mailbox_id: { type: Schema.Types.ObjectId, ref: 'Mailbox', default: null },
    to_address: { type: String, required: true },
    cc_addresses: { type: [String], default: [] },
    bcc_addresses: { type: [String], default: [] },
    from_address: { type: String, default: '' },
    subject_override: { type: String, default: null },
    variables: { type: Schema.Types.Mixed, default: {} },
    reply_token: { type: String, required: true, unique: true },
    sendgrid_message_id: { type: String, default: null },
    rfc_message_id: { type: String, default: null },
    in_reply_to_message_id: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    inbound_in_reply_to: { type: String, default: null },
    is_auto_reply: { type: Boolean, default: false },
    html_body: { type: String, default: null },
    text_body: { type: String, default: null },
    raw_body: { type: String, default: null },
    sent_at: { type: Date, default: null },
    received_at: { type: Date, default: null },
    status_summary: { type: String, default: 'sent' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

messageSchema.index({ source_type: 1, source_id: 1, subscriber_id: 1, sent_at: -1 });
messageSchema.index({ source_type: 1, source_id: 1, flow_node_id: 1, sent_at: -1 });
messageSchema.index({ subscriber_id: 1, sent_at: -1 });
messageSchema.index({ direction: 1, received_at: -1 });
messageSchema.index({ rfc_message_id: 1 });
messageSchema.index({ mailbox_id: 1, direction: 1, sent_at: -1 });
messageSchema.index({ mailbox_id: 1, to_address: 1, sent_at: -1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
