import mongoose, { Schema, Document } from 'mongoose';

export interface ICronJobRun extends Document {
  cron_job_id: mongoose.Types.ObjectId;
  type: 'segment_refresh' | 'flow_trigger' | 'campaign_send' | 'engagement_penalty' | 'flow_step_processor' | 'one_off_processor' | 'mailbox_pool_processor' | 'imap_poller';
  status: 'success' | 'warning' | 'error';
  summary: string;
  details: Record<string, any>;
  ran_at: Date;
  duration_ms: number;
}

const cronJobRunSchema = new Schema<ICronJobRun>(
  {
    cron_job_id: { type: Schema.Types.ObjectId, ref: 'CronJob', required: true },
    type: {
      type: String,
      required: true,
      // Keep in sync with CronJob's type enum — a run record must be persistable
      // for every job type or executeCronJob logs a validation error per run.
      enum: ['segment_refresh', 'flow_trigger', 'campaign_send', 'engagement_penalty', 'flow_step_processor', 'one_off_processor', 'mailbox_pool_processor', 'imap_poller'],
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'warning', 'error'],
    },
    summary: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ran_at: { type: Date, default: Date.now },
    duration_ms: { type: Number, default: 0 },
  },
  { timestamps: false }
);

cronJobRunSchema.index({ cron_job_id: 1, ran_at: -1 });
cronJobRunSchema.index({ ran_at: -1 });

export const CronJobRun = mongoose.model<ICronJobRun>('CronJobRun', cronJobRunSchema);
