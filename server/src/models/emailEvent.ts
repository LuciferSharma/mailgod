import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailEvent extends Document {
  subscriber_id: mongoose.Types.ObjectId;
  campaign_id: mongoose.Types.ObjectId | null;
  flow_id: mongoose.Types.ObjectId | null;
  flow_execution_id: mongoose.Types.ObjectId | null;
  mailbox_id?: mongoose.Types.ObjectId | null;
  sendgrid_message_id: string;
  sg_event_id?: string | null;
  event: 'sent' | 'delivered' | 'open' | 'click' | 'bounce' | 'spamreport' | 'unsubscribe';
  metadata: {
    url?: string;
    user_agent?: string;
    ip?: string;
    reason?: string;
  };
  timestamp: Date;
}

const emailEventSchema = new Schema<IEmailEvent>(
  {
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    campaign_id: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    flow_id: { type: Schema.Types.ObjectId, ref: 'Flow', default: null },
    flow_execution_id: { type: Schema.Types.ObjectId, ref: 'FlowExecution', default: null },
    mailbox_id: { type: Schema.Types.ObjectId, ref: 'Mailbox', default: null },
    sendgrid_message_id: { type: String, default: '' },
    // SendGrid's globally-unique per-event id — used to dedupe webhook retries.
    // No default: the field must be ABSENT (not null) on non-webhook events so
    // the partial unique index below ignores them.
    sg_event_id: { type: String },
    event: {
      type: String,
      required: true,
      enum: ['sent', 'delivered', 'open', 'click', 'bounce', 'spamreport', 'unsubscribe'],
    },
    metadata: {
      url: { type: String },
      user_agent: { type: String },
      ip: { type: String },
      reason: { type: String },
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

emailEventSchema.index({ subscriber_id: 1, timestamp: -1 });
emailEventSchema.index({ campaign_id: 1, event: 1 });
emailEventSchema.index({ flow_id: 1, event: 1 });
emailEventSchema.index({ sendgrid_message_id: 1 });
// Partial unique index: enforce uniqueness ONLY on real (string) sg_event_id
// values. Send-path events have no sg_event_id, so they're excluded entirely —
// a plain `sparse` index is not enough because a stored `null` still indexes.
emailEventSchema.index(
  { sg_event_id: 1 },
  { unique: true, partialFilterExpression: { sg_event_id: { $type: 'string' } } },
);
emailEventSchema.index({ event: 1, timestamp: -1 });
emailEventSchema.index({ timestamp: -1 });

export const EmailEvent = mongoose.model<IEmailEvent>('EmailEvent', emailEventSchema);
