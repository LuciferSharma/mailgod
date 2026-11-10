import mongoose, { Schema, Document } from 'mongoose';

/**
 * The sales-pipeline stage of a single conversation, at the granularity of
 * (subscriber × conversation source). The same person can therefore be at "Won"
 * on one campaign and "Lost" on another — which is how a rep actually thinks.
 *
 * This is deliberately separate from:
 *   - subscriber.tags        → describes the PERSON (durable)
 *   - *.inbox_tags           → free-text conversation tags (kept as-is)
 *   - message.status_summary → email DELIVERY status
 */
export interface IConversationLabel extends Document {
  subscriber_id: mongoose.Types.ObjectId;
  source_type: 'campaign' | 'flow_step' | 'one_off';
  source_id: mongoose.Types.ObjectId;
  flow_node_id: string | null;
  stage_id: mongoose.Types.ObjectId;
  history: { stage_id: mongoose.Types.ObjectId; at: Date }[];
  updated_at: Date;
  created_at: Date;
}

const conversationLabelSchema = new Schema<IConversationLabel>(
  {
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', required: true },
    source_type: { type: String, enum: ['campaign', 'flow_step', 'one_off'], required: true },
    source_id: { type: Schema.Types.ObjectId, required: true },
    flow_node_id: { type: String, default: null },
    stage_id: { type: Schema.Types.ObjectId, ref: 'PipelineStage', required: true },
    history: [
      {
        _id: false,
        stage_id: { type: Schema.Types.ObjectId, ref: 'PipelineStage' },
        at: { type: Date },
      },
    ],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// One stage per (subscriber × conversation source). flow_node_id is part of the
// key so each flow step is tracked independently; it's null for campaign/one_off.
conversationLabelSchema.index(
  { subscriber_id: 1, source_type: 1, source_id: 1, flow_node_id: 1 },
  { unique: true },
);
// For "everyone at stage X" lookups.
conversationLabelSchema.index({ source_type: 1, source_id: 1, stage_id: 1 });
// For the board: scan-by-stage, most-recently-updated first (capped .limit()).
conversationLabelSchema.index({ stage_id: 1, updated_at: -1 });
// Board scan sorts by updated_at across all (or one) source — these cover the
// filter + sort so .limit() is a true early-termination, not a post-sort buffer.
conversationLabelSchema.index({ updated_at: -1 });
conversationLabelSchema.index({ source_type: 1, updated_at: -1 });

export const ConversationLabel = mongoose.model<IConversationLabel>('ConversationLabel', conversationLabelSchema);
