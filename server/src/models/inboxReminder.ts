import mongoose, { Schema, Document } from 'mongoose';
import type { MessageSourceType } from './message';

export type ReminderTargetKind = 'conversation' | 'subscriber';

export interface IInboxReminder extends Document {
  user_id: mongoose.Types.ObjectId;
  target_kind: ReminderTargetKind;
  // For target_kind === 'conversation':
  conversation_type: MessageSourceType | null;
  conversation_id: mongoose.Types.ObjectId | null;
  flow_node_id: string | null;
  // For target_kind === 'subscriber':
  subscriber_id: mongoose.Types.ObjectId | null;
  remind_at: Date;
  note: string | null;
  dismissed: boolean;
  dismissed_at: Date | null;
  surfaced: boolean;
  created_at: Date;
}

const inboxReminderSchema = new Schema<IInboxReminder>(
  {
    user_id: { type: Schema.Types.ObjectId, required: true },
    target_kind: { type: String, enum: ['conversation', 'subscriber'], default: 'conversation' },
    conversation_type: { type: String, enum: ['campaign', 'flow_step', 'one_off'], default: null },
    conversation_id: { type: Schema.Types.ObjectId, default: null },
    flow_node_id: { type: String, default: null },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', default: null },
    remind_at: { type: Date, required: true },
    note: { type: String, default: null },
    dismissed: { type: Boolean, default: false },
    dismissed_at: { type: Date, default: null },
    surfaced: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

inboxReminderSchema.index({ user_id: 1, dismissed: 1, remind_at: 1 });
inboxReminderSchema.index({ remind_at: 1, dismissed: 1, surfaced: 1 });
inboxReminderSchema.index({ subscriber_id: 1, dismissed: 1 }, { sparse: true });

export const InboxReminder = mongoose.model<IInboxReminder>('InboxReminder', inboxReminderSchema);
