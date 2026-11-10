import mongoose, { Schema, Document } from 'mongoose';

/**
 * A sales-pipeline stage (workspace-level, ordered). Conversations are placed
 * into exactly one stage via ConversationLabel. Seeded with sensible defaults
 * on first read; rename/recolor/reorder UI can come later.
 */
export interface IPipelineStage extends Document {
  name: string;
  color: string; // hex, e.g. "#3b82f6"
  order: number;
  terminal: boolean; // Won / Lost — end of the pipeline
  system: boolean; // seeded default (vs user-created)
  created_at: Date;
  updated_at: Date;
}

const pipelineStageSchema = new Schema<IPipelineStage>(
  {
    name: { type: String, required: true, unique: true },
    color: { type: String, default: '#64748b' },
    order: { type: Number, default: 0 },
    terminal: { type: Boolean, default: false },
    system: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

pipelineStageSchema.index({ order: 1 });

export const PipelineStage = mongoose.model<IPipelineStage>('PipelineStage', pipelineStageSchema);

const DEFAULT_STAGES: { name: string; color: string; order: number; terminal: boolean }[] = [
  { name: 'New', color: '#64748b', order: 1, terminal: false },
  { name: 'Contacted', color: '#3b82f6', order: 2, terminal: false },
  { name: 'Replied', color: '#10b981', order: 3, terminal: false },
  { name: 'Interested', color: '#8b5cf6', order: 4, terminal: false },
  { name: 'Demo Booked', color: '#f59e0b', order: 5, terminal: false },
  { name: 'Won', color: '#22c55e', order: 6, terminal: true },
  { name: 'Lost', color: '#ef4444', order: 7, terminal: true },
];

/**
 * Idempotently seed the default stages. Uses upsert-by-name + bulkWrite so two
 * concurrent callers converge instead of inserting duplicates (the unique index
 * on `name` is the backstop).
 */
let indexesEnsured = false;

export async function ensureStagesSeeded(): Promise<void> {
  // Ensure the unique index on `name` exists before we rely on it for upsert
  // de-dup. Mongoose builds indexes in the background without awaiting, so on a
  // brand-new collection the first seed could otherwise race. Done once/process.
  if (!indexesEnsured) {
    await PipelineStage.createIndexes().catch(() => { /* best-effort */ });
    indexesEnsured = true;
  }
  // Run the idempotent upsert until ALL defaults exist, so a partial prior seed
  // self-heals. countDocuments is exact (estimatedDocumentCount is approximate).
  const count = await PipelineStage.countDocuments({});
  if (count >= DEFAULT_STAGES.length) return;
  try {
    await PipelineStage.bulkWrite(
      DEFAULT_STAGES.map(s => ({
        updateOne: {
          filter: { name: s.name },
          update: { $setOnInsert: { ...s, system: true } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (e: any) {
    // Ignore only duplicate-key races (concurrent seed); surface anything else.
    const dup =
      e?.code === 11000 ||
      (Array.isArray(e?.writeErrors) && e.writeErrors.every((w: any) => (w?.code ?? w?.err?.code) === 11000));
    if (!dup) throw e;
  }
}
