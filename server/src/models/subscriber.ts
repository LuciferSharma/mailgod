import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriber extends Document {
  email: string;
  name: string;
  country: string;
  language: string;
  plan_tier: string;
  last_login: Date | null;
  usage_count: number;
  paid: boolean;
  cancelled: boolean;
  signup_source: string;
  tags: string[];
  custom_attributes: Record<string, any>;
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained';
  engagement: {
    emails_sent: number;
    emails_opened: number;
    emails_clicked: number;
    last_email_at: Date | null;
  };
  frequency: {
    emails_sent_today: number;
    last_email_date: Date | null;
  };
  engagement_score: number;
  engagement_silence_penalty: number;
  engagement_score_manual: number;
  engagement_last_event_at: Date | null;
  engagement_manual_log: { value: number; reason: string; by: string; at: Date }[];
  created_at: Date;
  updated_at: Date;
}

const subscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    country: { type: String, default: '' },
    language: { type: String, default: 'en' },
    plan_tier: { type: String, default: 'free' },
    last_login: { type: Date, default: null },
    usage_count: { type: Number, default: 0 },
    paid: { type: Boolean, default: false },
    cancelled: { type: Boolean, default: false },
    signup_source: { type: String, default: 'organic' },
    tags: [{ type: String }],
    custom_attributes: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['active', 'unsubscribed', 'bounced', 'complained'],
      default: 'active',
    },
    engagement: {
      emails_sent: { type: Number, default: 0 },
      emails_opened: { type: Number, default: 0 },
      emails_clicked: { type: Number, default: 0 },
      last_email_at: { type: Date, default: null },
    },
    frequency: {
      emails_sent_today: { type: Number, default: 0 },
      last_email_date: { type: Date, default: null },
    },
    engagement_score: { type: Number, default: 0 },
    engagement_silence_penalty: { type: Number, default: 0 },
    engagement_score_manual: { type: Number, default: 0 },
    engagement_last_event_at: { type: Date, default: null },
    engagement_manual_log: [{
      value: { type: Number },
      reason: { type: String, default: '' },
      by: { type: String, default: '' },
      at: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

subscriberSchema.index({ status: 1 });
subscriberSchema.index({ plan_tier: 1 });
subscriberSchema.index({ tags: 1 });
subscriberSchema.index({ paid: 1 });
subscriberSchema.index({ country: 1 });
subscriberSchema.index({ signup_source: 1 });
subscriberSchema.index({ 'engagement.last_email_at': 1 });
subscriberSchema.index({ last_login: 1 });
subscriberSchema.index({ created_at: 1 });
subscriberSchema.index({ name: 'text', email: 'text' }, { language_override: 'lang_override' });
subscriberSchema.index({ engagement_score: -1 });
subscriberSchema.index({ engagement_last_event_at: -1 });

export const Subscriber = mongoose.model<ISubscriber>('Subscriber', subscriberSchema);
