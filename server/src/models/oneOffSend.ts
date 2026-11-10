import mongoose, { Schema, Document } from 'mongoose';

export type OneOffSendStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface IOneOffSend extends Document {
  subject: string;
  html_body: string;
  template_id: mongoose.Types.ObjectId | null;
  from_address: string;
  cc_addresses: string[];
  bcc_addresses: string[];
  recipient_ids: mongoose.Types.ObjectId[];
  sender_mode: 'default' | 'pool' | 'mailbox';
  mailbox_ids: mongoose.Types.ObjectId[];
  // Thread follow-up: send as a reply to each recipient's last outbound message, from the same mailbox.
  thread_followup: boolean;
  parent_one_off_id: mongoose.Types.ObjectId | null;
  status: OneOffSendStatus;
  scheduled_at: Date | null;
  recipient_count: number;
  reply_count: number;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_archived: boolean;
  inbox_last_message_at: Date;
  send_summary: {
    sent: number;
    skipped_frequency_cap: number;
    failed: number;
  };
  created_by: mongoose.Types.ObjectId | null;
  created_at: Date;
  sent_at: Date | null;
  updated_at: Date;
}

const oneOffSendSchema = new Schema<IOneOffSend>(
  {
    subject: { type: String, required: true },
    html_body: { type: String, default: '' },
    template_id: { type: Schema.Types.ObjectId, ref: 'Template', default: null },
    from_address: { type: String, default: '' },
    cc_addresses: { type: [String], default: [] },
    bcc_addresses: { type: [String], default: [] },
    recipient_ids: [{ type: Schema.Types.ObjectId, ref: 'Subscriber' }],
    sender_mode: { type: String, enum: ['default', 'pool', 'mailbox'], default: 'default' },
    mailbox_ids: { type: [Schema.Types.ObjectId], default: [] },
    thread_followup: { type: Boolean, default: false },
    parent_one_off_id: { type: Schema.Types.ObjectId, ref: 'OneOffSend', default: null },
    status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'], default: 'draft' },
    scheduled_at: { type: Date, default: null },
    recipient_count: { type: Number, default: 0 },
    reply_count: { type: Number, default: 0 },
    inbox_tags: { type: [String], default: [] },
    inbox_starred: { type: Boolean, default: false },
    inbox_archived: { type: Boolean, default: false },
    inbox_last_message_at: { type: Date, default: Date.now },
    send_summary: {
      sent: { type: Number, default: 0 },
      skipped_frequency_cap: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    created_by: { type: Schema.Types.ObjectId, default: null },
    sent_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

oneOffSendSchema.index({ inbox_last_message_at: -1 });
oneOffSendSchema.index({ status: 1, created_at: -1 });
oneOffSendSchema.index({ status: 1, scheduled_at: 1 }); // cron claim scan for due scheduled sends
oneOffSendSchema.index({ inbox_starred: 1, inbox_last_message_at: -1 });

export const OneOffSend = mongoose.model<IOneOffSend>('OneOffSend', oneOffSendSchema);
