import mongoose, { Schema, Document } from 'mongoose';

export interface ISegmentCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'before' | 'after' | 'between';
  value: any;
}

export interface ISegmentRules {
  operator: 'AND' | 'OR';
  conditions: ISegmentCondition[];
}

export interface ISegment extends Document {
  name: string;
  description: string;
  rules: ISegmentRules;
  subscriber_count: number;
  is_dynamic: boolean;
  last_computed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const segmentConditionSchema = new Schema<ISegmentCondition>(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      required: true,
      enum: ['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'exists', 'not_exists', 'before', 'after', 'between'],
    },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const segmentSchema = new Schema<ISegment>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    rules: {
      operator: { type: String, enum: ['AND', 'OR'], default: 'AND' },
      conditions: [segmentConditionSchema],
    },
    subscriber_count: { type: Number, default: 0 },
    is_dynamic: { type: Boolean, default: true },
    last_computed_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

segmentSchema.index({ created_at: -1 });

export const Segment = mongoose.model<ISegment>('Segment', segmentSchema);
