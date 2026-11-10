import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Loader2, X, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi } from '../../api';
import type { Subscriber } from '../../types';
import { displayScore, bandFor, BAND_META, relativeTimeShort } from '../../lib/engagement';

export default function EngagementCard({ subscriber }: { subscriber: Subscriber }) {
  const qc = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [value, setValue] = useState(String(subscriber.engagement_score_manual ?? 0));
  const [reason, setReason] = useState('');
  const [showLog, setShowLog] = useState(false);

  const score = displayScore(subscriber);
  const meta = BAND_META[bandFor(score)];

  const adjustMut = useMutation({
    mutationFn: () => subscriberApi.setEngagementManual(subscriber._id, Number(value), reason),
    onSuccess: () => {
      toast.success('Manual adjustment saved');
      qc.invalidateQueries({ queryKey: ['subscriber', subscriber._id] });
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      setAdjustOpen(false);
      setReason('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-dim" />
        <h3 className="text-sm font-medium text-body">Engagement</h3>
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-heading tabular-nums">{score}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <p className="text-xs text-subtle mb-4">
        Last engaged {relativeTimeShort(subscriber.engagement_last_event_at)}
      </p>

      <div className="space-y-1 text-xs mb-4">
        <Row label="Events" value={subscriber.engagement_score ?? 0} />
        <Row label="Silence penalty" value={subscriber.engagement_silence_penalty ?? 0} negative />
        <Row label="Manual adjust" value={subscriber.engagement_score_manual ?? 0} />
      </div>

      {!adjustOpen ? (
        <button
          onClick={() => setAdjustOpen(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 border border-line rounded-md text-subtle hover:bg-elevated"
        >
          <Pencil className="w-3 h-3" /> Adjust manually
        </button>
      ) : (
        <div className="border-t border-line pt-3 space-y-2">
          <div className="text-xs text-dim">Set the manual override (positive boosts, negative penalizes)</div>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0"
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional, audit trail)"
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAdjustOpen(false); setValue(String(subscriber.engagement_score_manual ?? 0)); setReason(''); }}
              className="text-xs px-3 py-1 border border-line rounded-md hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              onClick={() => adjustMut.mutate()}
              disabled={adjustMut.isPending}
              className="inline-flex items-center text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {adjustMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {(subscriber.engagement_manual_log || []).length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-[11px] text-subtle hover:text-body"
          >
            {showLog ? 'Hide' : 'Show'} adjustment history
          </button>
          {showLog && (
            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
              {(subscriber.engagement_manual_log || []).map((entry, i) => (
                <div key={i} className="text-[11px] text-subtle">
                  <span className="font-mono tabular-nums text-body">{entry.value > 0 ? '+' : ''}{entry.value}</span>
                  {entry.reason && <span className="text-dim"> · {entry.reason}</span>}
                  <span className="text-dim"> · {new Date(entry.at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  const sign = value > 0 ? '+' : '';
  return (
    <div className="flex items-center justify-between">
      <span className="text-subtle">{label}</span>
      <span className={`font-mono tabular-nums ${value === 0 ? 'text-dim' : value > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
        {sign}{value}
      </span>
    </div>
  );
}
