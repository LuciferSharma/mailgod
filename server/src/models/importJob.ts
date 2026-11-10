import mongoose, { Schema, Document } from 'mongoose';

export interface IImportJob extends Document {
  status: 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  invalid_count: number;
  invalid_emails: string[];
  import_errors: string[];
  started_at: Date;
  completed_at: Date | null;
}

const importJobSchema = new Schema<IImportJob>(
  {
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    invalid_count: { type: Number, default: 0 },
    invalid_emails: [{ type: String }],
    import_errors: [{ type: String }],
    started_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
  },
  { timestamps: false }
);

importJobSchema.index({ status: 1 });

export const ImportJob = mongoose.model<IImportJob>('ImportJob', importJobSchema);
