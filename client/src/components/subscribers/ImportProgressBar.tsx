import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi } from '../../api';

interface ImportProgressBarProps {
  jobId: string;
  onComplete: () => void;
}

export default function ImportProgressBar({ jobId, onComplete }: ImportProgressBarProps) {
  const queryClient = useQueryClient();
  const [showInvalid, setShowInvalid] = useState(false);

  const { data: job } = useQuery({
    queryKey: ['import-status', jobId],
    queryFn: () => subscriberApi.getImportStatus(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed') {
      const invalid = (job as any).invalid_count || 0;
      const parts = [`${job.imported} imported`, `${job.skipped} duplicate`];
      if (invalid > 0) parts.push(`${invalid} invalid email`);
      toast.success(`Import complete: ${parts.join(', ')}`);
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      // Don't auto-dismiss if there are invalid emails — let user inspect
      if (invalid === 0) onComplete();
    } else if (job.status === 'failed') {
      toast.error(`Import failed: ${job.errors?.[0] || 'Unknown error'}`);
      onComplete();
    }
  }, [job?.status]);

  if (!job) return null;

  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="bg-card border border-line rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-heading">
          {job.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          {job.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
          {job.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500" />}
          {job.status === 'processing' ? 'Importing...' : job.status === 'completed' ? 'Import Complete' : 'Import Failed'}
        </div>
        <span className="text-xs text-subtle tabular-nums">
          {job.processed.toLocaleString()} / {job.total.toLocaleString()}
        </span>
      </div>

      <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            job.status === 'failed' ? 'bg-red-500' : job.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-4 mt-2 text-xs text-subtle">
        <span>{job.imported.toLocaleString()} imported</span>
        <span>{job.skipped.toLocaleString()} duplicate</span>
        {((job as any).invalid_count ?? 0) > 0 && (
          <span className="text-amber-500">{(job as any).invalid_count} invalid email</span>
        )}
        {job.errors.length > 0 && <span className="text-red-500">{job.errors.length} error(s)</span>}
      </div>

      {((job as any).invalid_count ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <button
            onClick={() => setShowInvalid(!showInvalid)}
            className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400"
          >
            {showInvalid ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showInvalid ? 'Hide' : 'Show'} skipped invalid emails
          </button>
          {showInvalid && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-line bg-elevated p-2">
              <ul className="space-y-0.5 text-xs font-mono text-subtle">
                {((job as any).invalid_emails || []).map((e: string, i: number) => (
                  <li key={i} className="truncate">{e || <span className="text-dim">(empty)</span>}</li>
                ))}
              </ul>
              {(job as any).invalid_count > ((job as any).invalid_emails || []).length && (
                <p className="text-[10px] text-dim mt-2">
                  Showing {(job as any).invalid_emails.length} of {(job as any).invalid_count} — add the "email" column to your CSV with valid email addresses to fix.
                </p>
              )}
            </div>
          )}
          {job.status === 'completed' && (
            <button onClick={onComplete} className="mt-2 ml-3 text-xs text-dim hover:text-body">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
