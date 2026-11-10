import mongoose, { Schema, Document } from 'mongoose';
import type { MessageSourceType } from './message';

export interface IInboxRead extends Document {
  user_id: mongoose.Types.ObjectId;
  conversation_type: MessageSourceType;
  conversation_id: mongoose.Types.ObjectId;
  flow_node_id: string | null;
  last_viewed_at: Date;
}

const inboxReadSchema = new Schema<IInboxRead>(
  {
    user_id: { type: Schema.Types.ObjectId, required: true },
    conversation_type: { type: String, enum: ['campaign', 'flow_step', 'one_off'], required: true },
    conversation_id: { type: Schema.Types.ObjectId, required: true },
    flow_node_id: { type: String, default: null },
    last_viewed_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

inboxReadSchema.index(
  { user_id: 1, conversation_type: 1, conversation_id: 1, flow_node_id: 1 },
  { unique: true }
);

export const InboxRead = mongoose.model<IInboxRead>('InboxRead', inboxReadSchema);
