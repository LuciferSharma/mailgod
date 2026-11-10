import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock, Loader2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { reminderApi } from '../../api';
import type { ReminderWithTarget } from '../../types';

const PRESETS = [
  { label: 'In 1 hour', delta: 60 * 60 * 1000 },
  { label: 'Tomorrow 9am', delta: tomorrowAt(9) },
  { label: 'In 3 days', delta: 3 * 24 * 60 * 60 * 1000 },
  { label: 'Next week', delta: 7 * 24 * 60 * 60 * 1000 },
];
function tomorrowAt(hour: number): number {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(hour, 0, 0, 0);
  return t.getTime() - Date.now();
}

interface Props { subscriberId: string }

export default function SubscriberRemindersCard({ subscriberId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [customAt, setCustomAt] = useState('');
  const [note, setNote] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  // Pull only this subscriber's active reminders
  const { data: all } = useQuery({
    queryKey: ['reminders', 'subscriber'],
    queryFn: () => reminderApi.list({ kind: 'subscriber' }),
    refetchInterval: 60_000,
  });
  const reminders = (all || []).filter(r => r.subscriber_id === subscriberId);

  const create = useMutation({
    mutationFn: (remind_at: Date) => reminderApi.create({
      target_kind: 'subscriber',
      subscriber_id: subscriberId,
      remind_at: remind_at.toISOString(),
      note: note.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Reminder set');
      setAdding(false);
      setNote('');
      setCustomAt('');
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
    },
    onError: () => toast.error('Failed to set reminder'),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => reminderApi.dismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
    },
  });

  // Close the add panel on outside click
  useEffect(() => {
    if (!adding) return;
    function handler(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        // Don't close on outside click — too easy to lose typing.
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-medium text-body">Reminders</h3>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-blue-500 hover:text-blue-400 inline-flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Set reminder
          </button>
        )}
      </div>

      {reminders.length === 0 && !adding && (
        <p className="text-sm text-dim">No active reminders for this subscriber.</p>
      )}

      {reminders.length > 0 && (
        <div className="space-y-2 mb-3">
          {reminders.map(r => {
            const ms = new Date(r.remind_at).getTime() - Date.now();
            const due = ms <= 0;
            return (
              <div
                key={r._id}
                className={`group rounded-md border p-2.5 ${due ? 'border-amber-500/40 bg-amber-500/5' : 'border-line bg-elevated/40'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={`text-[11px] font-semibold flex items-center gap-1 ${due ? 'text-amber-500' : 'text-subtle'}`}>
                      <Clock className="w-3 h-3" />
                      {new Date(r.remind_at).toLocaleString()}
                      {due && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] uppercase tracking-wider">Due</span>}
                    </div>
                    {r.note && <div className="text-sm text-body mt-1 whitespace-pre-wrap">{r.note}</div>}
                  </div>
                  <button
                    onClick={() => dismiss.mutate(r._id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-elevated text-dim hover:text-red-500"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div ref={formRef} className="border-t border-line pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => create.mutate(new Date(Date.now() + p.delta))}
                disabled={create.isPending}
                className="text-xs px-2 py-1.5 rounded border border-line text-subtle hover:bg-elevated hover:text-body disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={customAt}
            onChange={e => setCustomAt(e.target.value)}
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What to follow up on? (optional)"
            rows={2}
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAdding(false); setNote(''); setCustomAt(''); }}
              className="text-xs px-3 py-1 border border-line rounded-md hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!customAt) return;
                const at = new Date(customAt);
                if (isNaN(at.getTime()) || at.getTime() < Date.now()) {
                  toast.error('Pick a future date/time');
                  return;
                }
                create.mutate(at);
              }}
              disabled={!customAt || create.isPending}
              className="inline-flex items-center text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set custom'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
