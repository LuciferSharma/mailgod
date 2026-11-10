import { ImportJob, IImportJob } from '../models/importJob';

export type ImportJobData = {
  id: string;
  status: string;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  invalid_count: number;
  invalid_emails: string[];
  errors: string[];
  startedAt: Date;
  completedAt: Date | null;
};

function toJobData(doc: IImportJob): ImportJobData {
  return {
    id: doc._id.toString(),
    status: doc.status,
    total: doc.total,
    processed: doc.processed,
    imported: doc.imported,
    skipped: doc.skipped,
    invalid_count: doc.invalid_count || 0,
    invalid_emails: doc.invalid_emails || [],
    errors: doc.import_errors,
    startedAt: doc.started_at,
    completedAt: doc.completed_at,
  };
}

export async function createJob(total: number): Promise<ImportJobData> {
  const doc = await ImportJob.create({ total });
  return toJobData(doc);
}

export async function getJob(id: string): Promise<ImportJobData | null> {
  const doc = await ImportJob.findById(id);
  return doc ? toJobData(doc) : null;
}

export async function updateJob(id: string, updates: Partial<Pick<IImportJob, 'status' | 'processed' | 'imported' | 'skipped' | 'invalid_count' | 'invalid_emails' | 'import_errors'>>): Promise<void> {
  const setFields: any = { ...updates };
  if (updates.status === 'completed' || updates.status === 'failed') {
    setFields.completed_at = new Date();
  }
  await ImportJob.findByIdAndUpdate(id, { $set: setFields });
}
