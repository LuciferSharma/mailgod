import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Users, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { flowApi, segmentApi } from '../../api';
import type { Segment } from '../../types';

interface Props {
  flowId: string;
  flowName: string;
  onClose: () => void;
  onEnrolled: () => void;
}

export default function EnrollSegmentModal({ flowId, flowName, onClose, onEnrolled }: Props) {
  const [segmentId, setSegmentId] = useState('');

  const { data: segments, isLoading } = useQuery({ queryKey: ['segments'], queryFn: segmentApi.list });
  const selected = segments?.find((s: Segment) => s._id === segmentId);

  const enrollMut = useMutation({
    mutationFn: () => flowApi.enrollSegment(flowId, segmentId),
    onSuccess: (data) => {
      const parts = [`${data.enrolled} enrolled`];
      if (data.skipped > 0) parts.push(`${data.skipped} already in flow`);
      if (data.spread_seconds > 0 && data.eta_minutes > 0) {
        parts.push(`staggered ${data.spread_seconds}s apart (~${data.eta_minutes} min)`);
      }
      toast.success(`"${data.segment_name}" → ${parts.join(', ')}`);
      onEnrolled();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Enroll failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-lg w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-heading">Enroll segment</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-elevated text-dim hover:text-body">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-subtle">
            Pick a segment — every active subscriber in it will be enrolled into
            <span className="text-heading font-medium"> {flowName}</span> and start
            receiving its emails per the flow's delays.
          </p>

          <div>
            <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">Segment</label>
            {isLoading ? (
              <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-dim" /></div>
            ) : (
              <select
                value={segmentId}
                onChange={e => setSegmentId(e.target.value)}
                className="w-full bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading focus:ring-2 focus:ring-blue-500/30 outline-none"
              >
                <option value="">— Choose a segment —</option>
                {(segments || []).map((s: Segment) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.subscriber_count} subscribers)
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-md px-3 py-2 text-xs text-body">
              About to enroll <span className="font-semibold text-blue-400">{selected.subscriber_count}</span> subscribers
              from <span className="font-semibold">{selected.name}</span>. Subscribers already in this flow will be skipped.
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-dim">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Re-enrolling later (e.g., after segment grows) is safe — duplicates are auto-skipped.
              Anyone who replies to a flow email is automatically removed from the sequence.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-subtle hover:text-body rounded-md hover:bg-elevated">
            Cancel
          </button>
          <button
            onClick={() => enrollMut.mutate()}
            disabled={!segmentId || enrollMut.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-900/30"
          >
            {enrollMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            {enrollMut.isPending ? 'Enrolling...' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  );
}
