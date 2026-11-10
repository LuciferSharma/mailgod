import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Loader2, Clock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { inboxApi } from '../../api';
import type { InboxReminder, InboxConversation } from '../../types';

interface Props {
  onOpenConversation: (c: InboxConversation) => void;
}

function relativeWhen(iso: string): { label: string; due: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const due = ms <= 0;
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60000);
  if (min < 1) return { label: due ? 'just now' : 'in <1m', due };
  if (min < 60) return { label: due ? `${min}m ago` : `in ${min}m`, due };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { label: due ? `${hr}h ago` : `in ${hr}h`, due };
  const d = Math.floor(hr / 24);
  if (d < 7) return { label: due ? `${d}d ago` : `in ${d}d`, due };
  return { label: new Date(iso).toLocaleDateString(), due };
}

export default function RemindersList({ onOpenConversation }: Props) {
  const qc = useQueryClient();

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['inbox-reminders'],
    queryFn: () => inboxApi.reminders(false),
    refetchInterval: 30000,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => inboxApi.dismissReminder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      toast.success('Reminder dismissed');
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-dim" />
      </div>
    );
  }

  if (!reminders?.length) {
    return (
      <div className="p-8 text-center">
        <BellOff className="w-10 h-10 mx-auto text-dim mb-2" />
        <p className="text-sm text-subtle">No active reminders.</p>
        <p className="text-xs text-dim mt-1">
          Open a conversation and click the bell icon to set a reminder.
        </p>
      </div>
    );
  }

  // This list lives inside the inbox view — only show conversation reminders.
  // Subscriber-targeted reminders show on the /reminders page instead.
  const sorted = [...reminders]
    .filter(r => (r.target_kind || 'conversation') === 'conversation' && r.conversation_type && r.conversation_id)
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());

  const handleOpen = (r: InboxReminder) => {
    if (!r.conversation_type || !r.conversation_id) return;
    // Synthesize a minimal conversation object to drive the detail pane.
    // Real subject will be fetched by the detail query.
    const conv: InboxConversation = {
      type: r.conversation_type,
      id: r.conversation_id,
      flow_node_id: r.flow_node_id,
      subject: '(loading...)',
      preview: '',
      recipient_count: 0,
      reply_count: 0,
      inbox_tags: [],
      inbox_starred: false,
      inbox_last_message_at: null,
      unread: false,
      source_label: r.conversation_type === 'campaign' ? 'Campaign'
        : r.conversation_type === 'one_off' ? 'One-off'
        : 'Flow step',
    };
    onOpenConversation(conv);
  };

  return (
    <div className="overflow-y-auto h-full">
      {sorted.map(r => {
        const when = relativeWhen(r.remind_at);
        return (
          <div
            key={r._id}
            className={`px-3 py-3 border-b border-line ${when.due ? 'bg-amber-500/5' : ''}`}
          >
            <div className="flex items-start gap-2">
              <Bell className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${when.due ? 'text-amber-500 fill-amber-500' : 'text-dim'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-medium ${when.due ? 'text-amber-500' : 'text-subtle'}`}>
                    <Clock className="w-3 h-3 inline-block -mt-0.5 mr-1" />
                    {when.label}
                  </span>
                  <span className="text-[10px] text-dim">
                    {new Date(r.remind_at).toLocaleString()}
                  </span>
                </div>
                {r.note && (
                  <div className="text-sm text-body whitespace-pre-wrap mb-2 px-2 py-1.5 bg-elevated rounded-md">
                    {r.note}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpen(r)}
                    className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    Open conversation <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Dismiss this reminder?')) dismissMut.mutate(r._id); }}
                    disabled={dismissMut.isPending}
                    className="text-xs text-dim hover:text-red-500"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
