import mongoose, { Schema, Document } from 'mongoose';

/**
 * Durable replacement for setTimeout in flow execution.
 *
 * When a flow hits a delay node, instead of holding an in-process timer
 * (which dies on deploy/restart), we persist a ScheduledFlowStep with the
 * next node to walk and the time to walk it. A cron processor claims due
 * steps atomically and resumes the execution. Survives restarts.
 */
export interface IScheduledFlowStep extends Document {
  flow_execution_id: mongoose.Types.ObjectId;
  flow_id: mongoose.Types.ObjectId;
  subscriber_id: mongoose.Types.ObjectId;
  next_node_id: string;
  fire_at: Date;
  status: 'pending' | 'claimed' | 'completed' | 'failed' | 'held';
  claimed_at: Date | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

const scheduledFlowStepSchema = new Schema<IScheduledFlowStep>(
  {
    flow_execution_id: { type: Schema.Types.ObjectId, ref: 'FlowExecution', required: true },
    flow_id: { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    next_node_id: { type: String, required: true },
    fire_at: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'claimed', 'completed', 'failed', 'held'],
      default: 'pending',
    },
    claimed_at: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    last_error: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

scheduledFlowStepSchema.index({ status: 1, fire_at: 1 });
scheduledFlowStepSchema.index({ flow_execution_id: 1 });
scheduledFlowStepSchema.index({ claimed_at: 1 });

export const ScheduledFlowStep = mongoose.model<IScheduledFlowStep>(
  'ScheduledFlowStep',
  scheduledFlowStepSchema
);
