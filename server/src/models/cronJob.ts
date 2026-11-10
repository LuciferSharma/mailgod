import mongoose, { Schema, Document } from 'mongoose';

export interface ICronJob extends Document {
  name: string;
  description: string;
  type: 'segment_refresh' | 'flow_trigger' | 'campaign_send' | 'engagement_penalty' | 'flow_step_processor' | 'one_off_processor' | 'mailbox_pool_processor' | 'imap_poller';
  schedule: string;
  config: Record<string, any>;
  status: 'active' | 'paused';
  auto_managed: boolean;
  source_type: 'flow' | 'campaign' | 'manual' | 'system';
  source_id: mongoose.Types.ObjectId | null;
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_at: Date;
}

const cronJobSchema = new Schema<ICronJob>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      required: true,
      enum: ['segment_refresh', 'flow_trigger', 'campaign_send', 'engagement_penalty', 'flow_step_processor', 'one_off_processor', 'mailbox_pool_processor', 'imap_poller'],
    },
    schedule: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active',
    },
    auto_managed: { type: Boolean, default: false },
    source_type: {
      type: String,
      enum: ['flow', 'campaign', 'manual', 'system'],
      default: 'manual',
    },
    source_id: { type: Schema.Types.ObjectId, default: null },
    last_run_at: { type: Date, default: null },
    next_run_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

cronJobSchema.index({ status: 1 });
cronJobSchema.index({ source_type: 1, source_id: 1 });

export const CronJob = mongoose.model<ICronJob>('CronJob', cronJobSchema);
