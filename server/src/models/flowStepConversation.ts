import mongoose, { Schema, Document } from 'mongoose';

export interface IFlowStepConversation extends Document {
  flow_id: mongoose.Types.ObjectId;
  node_id: string;
  node_label: string;
  recipient_count: number;
  reply_count: number;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_archived: boolean;
  inbox_last_message_at: Date;
  first_sent_at: Date;
}

const flowStepConversationSchema = new Schema<IFlowStepConversation>(
  {
    flow_id: { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
    node_id: { type: String, required: true },
    node_label: { type: String, default: '' },
    recipient_count: { type: Number, default: 0 },
    reply_count: { type: Number, default: 0 },
    inbox_tags: { type: [String], default: [] },
    inbox_starred: { type: Boolean, default: false },
    inbox_archived: { type: Boolean, default: false },
    inbox_last_message_at: { type: Date, default: Date.now },
    first_sent_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

flowStepConversationSchema.index({ flow_id: 1, node_id: 1 }, { unique: true });
flowStepConversationSchema.index({ inbox_last_message_at: -1 });
flowStepConversationSchema.index({ inbox_starred: 1, inbox_last_message_at: -1 });

export const FlowStepConversation = mongoose.model<IFlowStepConversation>(
  'FlowStepConversation',
  flowStepConversationSchema
);
