import mongoose, { Schema, Document } from 'mongoose';

export interface ICampaign extends Document {
  name: string;
  subject: string;
  template_id: mongoose.Types.ObjectId;
  segment_id: mongoose.Types.ObjectId;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'cancelled';
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  send_config: {
    batch_size: number;
    emails_per_hour: number;
  };
  stats: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  temporal_workflow_id: string | null;
  rendered_html: string;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_archived: boolean;
  inbox_last_message_at: Date | null;
  reply_count: number;
  last_batch_completed_at: Date | null;
  next_batch_at: Date | null;
  last_batch_size: number;
  dispatch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    subject: { type: String, default: '' },
    template_id: { type: Schema.Types.ObjectId, ref: 'Template' },
    segment_id: { type: Schema.Types.ObjectId, ref: 'Segment' },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'],
      default: 'draft',
    },
    scheduled_at: { type: Date, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    send_config: {
      batch_size: { type: Number, default: 500 },
      emails_per_hour: { type: Number, default: 5000 },
    },
    stats: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
    },
    temporal_workflow_id: { type: String, default: null },
    rendered_html: { type: String, default: '' },
    inbox_tags: { type: [String], default: [] },
    inbox_starred: { type: Boolean, default: false },
    inbox_archived: { type: Boolean, default: false },
    inbox_last_message_at: { type: Date, default: null },
    reply_count: { type: Number, default: 0 },
    last_batch_completed_at: { type: Date, default: null },
    next_batch_at: { type: Date, default: null },
    last_batch_size: { type: Number, default: 0 },
    dispatch_id: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

campaignSchema.index({ status: 1 });
campaignSchema.index({ scheduled_at: 1 });
campaignSchema.index({ segment_id: 1 });
campaignSchema.index({ template_id: 1 });
campaignSchema.index({ inbox_last_message_at: -1 });
campaignSchema.index({ inbox_starred: 1, inbox_last_message_at: -1 });

export const Campaign = mongoose.model<ICampaign>('Campaign', campaignSchema);
