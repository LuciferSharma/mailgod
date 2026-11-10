import mongoose, { Schema, Document } from 'mongoose';

export type MailboxKind = 'sendgrid' | 'smtp';
export type MailboxStatus = 'active' | 'paused';

/**
 * A sender identity in the pool. `sendgrid` = the platform's existing SendGrid
 * marketing sender (single row, auto-seeded). `smtp` = an owned mailbox
 * (Google Workspace / Zoho / any SMTP host ...) sent through nodemailer and read through IMAP.
 */
export interface IMailbox extends Document {
  kind: MailboxKind;
  email: string;
  display_name: string;
  domain: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  password_enc: string;
  status: MailboxStatus;
  paused_reason: string | null;
  include_in_pool: boolean;
  drop_footer: boolean;
  daily_cap: number;
  ramp: number[];
  warmup_started_at: Date | null;
  send_window: { tz: string; start_hour: number; end_hour: number; days: number[] };
  gap_min_sec: number;
  gap_max_sec: number;
  next_allowed_at: Date | null;
  auto_pause: { bounces_per_day: number; complaints_per_day: number };
  imap_last_uid: number;
  imap_uidvalidity: number | null;
  imap_last_polled_at: Date | null;
  last_sent_at: Date | null;
  last_error: string | null;
  stats: { sent_total: number; bounced_total: number; replied_total: number; opted_out_total: number };
  created_at: Date;
  updated_at: Date;
}

export const DEFAULT_RAMP = [5, 5, 8, 8, 12, 12, 16, 16, 20, 20, 25, 25, 30];

const mailboxSchema = new Schema<IMailbox>(
  {
    kind: { type: String, enum: ['sendgrid', 'smtp'], required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    display_name: { type: String, default: '' },
    domain: { type: String, default: '' },
    smtp_host: { type: String, default: '' },
    smtp_port: { type: Number, default: 465 },
    smtp_secure: { type: Boolean, default: true },
    imap_host: { type: String, default: '' },
    imap_port: { type: Number, default: 993 },
    password_enc: { type: String, default: '' },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    paused_reason: { type: String, default: null },
    include_in_pool: { type: Boolean, default: true },
    drop_footer: { type: Boolean, default: true },
    daily_cap: { type: Number, default: 30 },
    ramp: { type: [Number], default: DEFAULT_RAMP },
    warmup_started_at: { type: Date, default: null },
    send_window: {
      tz: { type: String, default: 'America/New_York' },
      start_hour: { type: Number, default: 9 },
      end_hour: { type: Number, default: 18 },
      days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    },
    gap_min_sec: { type: Number, default: 150 },
    gap_max_sec: { type: Number, default: 420 },
    next_allowed_at: { type: Date, default: null },
    auto_pause: {
      bounces_per_day: { type: Number, default: 3 },
      complaints_per_day: { type: Number, default: 1 },
    },
    imap_last_uid: { type: Number, default: 0 },
    imap_uidvalidity: { type: Number, default: null },
    imap_last_polled_at: { type: Date, default: null },
    last_sent_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    stats: {
      sent_total: { type: Number, default: 0 },
      bounced_total: { type: Number, default: 0 },
      replied_total: { type: Number, default: 0 },
      opted_out_total: { type: Number, default: 0 },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

export const Mailbox = mongoose.model<IMailbox>('Mailbox', mailboxSchema);
