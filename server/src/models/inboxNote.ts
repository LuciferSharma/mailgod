import mongoose, { Schema, Document } from 'mongoose';
import type { MessageSourceType } from './message';

export interface IInboxNote extends Document {
  conversation_type: MessageSourceType;
  conversation_id: mongoose.Types.ObjectId;
  flow_node_id: string | null;
  body: string;
  created_by: mongoose.Types.ObjectId;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
}

const inboxNoteSchema = new Schema<IInboxNote>(
  {
    conversation_type: { type: String, enum: ['campaign', 'flow_step', 'one_off'], required: true },
    conversation_id: { type: Schema.Types.ObjectId, required: true },
    flow_node_id: { type: String, default: null },
    body: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, required: true },
    created_by_name: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

inboxNoteSchema.index({
  conversation_type: 1,
  conversation_id: 1,
  flow_node_id: 1,
  created_at: -1,
});

export const InboxNote = mongoose.model<IInboxNote>('InboxNote', inboxNoteSchema);
