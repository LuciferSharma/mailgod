import { useState, useRef, useEffect } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inboxApi } from '../../api';
import type { InboxConversation } from '../../types';

const PRESETS = [
  { label: 'In 1 hour', delta: 60 * 60 * 1000 },
  { label: 'In 4 hours', delta: 4 * 60 * 60 * 1000 },
  { label: 'Tomorrow morning', delta: tomorrowAt(9) },
  { label: 'Next week', delta: 7 * 24 * 60 * 60 * 1000 },
];

function tomorrowAt(hour: number): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(hour, 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
}

export default function ReminderButton({ conv }: { conv: InboxConversation }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customAt, setCustomAt] = useState('');
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (remind_at: Date) =>
      inboxApi.createReminder({
        conversation_type: conv.type,
        conversation_id: conv.id,
        flow_node_id: conv.flow_node_id || null,
        remind_at: remind_at.toISOString(),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Reminder set');
      setOpen(false);
      setNote('');
      setCustomAt('');
      qc.invalidateQueries({ queryKey: ['inbox-reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
    },
    onError: () => toast.error('Failed to set reminder'),
  });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded hover:bg-elevated text-dim hover:text-amber-500"
        title="Set reminder"
      >
        <Bell className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-72 bg-card rounded-md shadow-lg border border-line p-3">
          <div className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">Remind me</div>
          <div className="space-y-1 mb-3">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => createMut.mutate(new Date(Date.now() + p.delta))}
                className="w-full text-left px-3 py-1.5 rounded text-sm text-subtle hover:bg-elevated"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t border-line pt-3 space-y-2">
            <div className="text-xs text-dim">Custom date/time</div>
            <input
              type="datetime-local"
              value={customAt}
              onChange={e => setCustomAt(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border border-line bg-field"
            />
            <textarea
              placeholder="Note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-sm rounded border border-line bg-field resize-y"
            />
            <button
              onClick={() => {
                if (!customAt) return;
                const at = new Date(customAt);
                if (isNaN(at.getTime()) || at.getTime() < Date.now()) {
                  toast.error('Pick a future date/time');
                  return;
                }
                createMut.mutate(at);
              }}
              disabled={!customAt || createMut.isPending}
              className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Set custom reminder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
