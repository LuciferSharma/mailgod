import mongoose, { Schema, Document } from 'mongoose';

export type SendQueueStatus = 'queued' | 'sending' | 'sent' | 'skipped' | 'failed';

/**
 * One recipient of a pool-mode one-off send. The pool processor claims items
 * one at a time per mailbox, so pacing/caps live on the mailbox, not the send.
 */
export interface ISendQueueItem extends Document {
  one_off_send_id: mongoose.Types.ObjectId;
  subscriber_id: mongoose.Types.ObjectId;
  allowed_mailbox_ids: mongoose.Types.ObjectId[];
  mailbox_id: mongoose.Types.ObjectId | null;
  status: SendQueueStatus;
  attempts: number;
  error: string | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const schema = new Schema<ISendQueueItem>(
  {
    one_off_send_id: { type: Schema.Types.ObjectId, ref: 'OneOffSend', required: true },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    allowed_mailbox_ids: { type: [Schema.Types.ObjectId], default: [] },
    mailbox_id: { type: Schema.Types.ObjectId, ref: 'Mailbox', default: null },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    sent_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

schema.index({ status: 1, created_at: 1 });
schema.index({ one_off_send_id: 1, status: 1 });
schema.index({ mailbox_id: 1, sent_at: -1 });

export const SendQueueItem = mongoose.model<ISendQueueItem>('SendQueueItem', schema);
