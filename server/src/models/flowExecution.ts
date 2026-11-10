import mongoose, { Schema, Document } from 'mongoose';

export interface IFlowExecutionHistory {
  node_id: string;
  action: string;
  timestamp: Date;
  result: any;
}

export interface IFlowExecution extends Document {
  flow_id: mongoose.Types.ObjectId;
  subscriber_id: mongoose.Types.ObjectId;
  temporal_workflow_id: string | null;
  status: 'running' | 'completed' | 'failed' | 'exited';
  current_node_id: string;
  entered_at: Date;
  completed_at: Date | null;
  history: IFlowExecutionHistory[];
}

const flowExecutionSchema = new Schema<IFlowExecution>(
  {
    flow_id: { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    temporal_workflow_id: { type: String, default: null },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'exited'],
      default: 'running',
    },
    current_node_id: { type: String, default: '' },
    entered_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
    history: [
      {
        node_id: { type: String },
        action: { type: String },
        timestamp: { type: Date, default: Date.now },
        result: { type: Schema.Types.Mixed },
        _id: false,
      },
    ],
  },
  { timestamps: false }
);

flowExecutionSchema.index({ flow_id: 1, status: 1 });
flowExecutionSchema.index({ flow_id: 1, subscriber_id: 1, status: 1 });
flowExecutionSchema.index({ subscriber_id: 1 });
flowExecutionSchema.index({ temporal_workflow_id: 1 });

export const FlowExecution = mongoose.model<IFlowExecution>('FlowExecution', flowExecutionSchema);
