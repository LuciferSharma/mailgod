import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, Loader2, Clock, ArrowRight, User, MessageSquare, Filter as FilterIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reminderApi } from '../api';
import type { ReminderWithTarget } from '../types';

type KindFilter = 'all' | 'conversation' | 'subscriber';

interface Group {
  key: string;
  label: string;
  items: ReminderWithTarget[];
}

function groupReminders(reminders: ReminderWithTarget[]): Group[] {
  const now = Date.now();
  const day = 86_400_000;
  const todayEnd = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const weekEnd = todayEnd + 7 * day;

  const groups: Record<string, ReminderWithTarget[]> = {
    due: [], today: [], week: [], later: [],
  };

  for (const r of reminders) {
    const t = new Date(r.remind_at).getTime();
    if (t <= now) groups.due.push(r);
    else if (t <= todayEnd) groups.today.push(r);
    else if (t <= weekEnd) groups.week.push(r);
    else groups.later.push(r);
  }

  return [
    { key: 'due', label: 'Due now', items: groups.due },
    { key: 'today', label: 'Later today', items: groups.today },
    { key: 'week', label: 'This week', items: groups.week },
    { key: 'later', label: 'Later', items: groups.later },
  ].filter(g => g.items.length > 0);
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

export default function RemindersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [kind, setKind] = useState<KindFilter>('all');

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders', kind],
    queryFn: () => reminderApi.list({ kind: kind === 'all' ? undefined : kind }),
    refetchInterval: 30_000,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => reminderApi.dismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-reminders'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
      toast.success('Dismissed');
    },
  });

  const groups = useMemo(() => groupReminders(reminders || []), [reminders]);
  const dueCount = groups.find(g => g.key === 'due')?.items.length || 0;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-amber-500/15 rounded-lg">
            <Bell className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-heading">Reminders</h1>
          {dueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
              {dueCount} due
            </span>
          )}
        </div>
        <p className="text-sm text-subtle">
          Follow-ups across the inbox and subscriber profiles. Set on any conversation or subscriber; lands here.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-5">
        <FilterIcon className="w-3.5 h-3.5 text-dim" />
        <KindChip current={kind} value="all" label="All" onClick={setKind} />
        <KindChip current={kind} value="conversation" label="Inbox" icon={MessageSquare} onClick={setKind} />
        <KindChip current={kind} value="subscriber" label="Subscribers" icon={User} onClick={setKind} />
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-dim" /></div>
      ) : !reminders?.length ? (
        <div className="bg-card border border-line rounded-lg p-12 text-center">
          <BellOff className="w-10 h-10 mx-auto text-dim mb-3" />
          <h3 className="text-sm font-semibold text-heading mb-1">No active reminders</h3>
          <p className="text-xs text-subtle">
            Open any subscriber or inbox conversation and click the bell icon to set one.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.key}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim mb-2 px-1">
                {group.label} <span className="text-dim/60">({group.items.length})</span>
              </h2>
              <div className="bg-card border border-line rounded-lg divide-y divide-line overflow-hidden">
                {group.items.map(r => {
                  const when = relativeWhen(r.remind_at);
                  const Icon = r.target_kind === 'subscriber' ? User : MessageSquare;
                  const iconColor = r.target_kind === 'subscriber' ? 'text-blue-500' : 'text-violet-500';
                  return (
                    <div
                      key={r._id}
                      className={`px-4 py-3 group ${when.due ? 'bg-amber-500/5' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <Bell className={`w-3.5 h-3.5 mt-1 shrink-0 ${when.due ? 'text-amber-500 fill-amber-500' : 'text-dim'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-xs font-semibold ${when.due ? 'text-amber-500' : 'text-subtle'}`}>
                              <Clock className="w-3 h-3 inline-block -mt-0.5 mr-1" />
                              {when.label}
                              <span className="text-dim font-normal ml-1.5">· {new Date(r.remind_at).toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-heading mb-1">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                            <span className="font-medium truncate">{r.target_label}</span>
                            <span className="text-[10px] uppercase tracking-wider text-dim ml-1">{r.target_kind === 'subscriber' ? 'Subscriber' : 'Inbox'}</span>
                          </div>
                          {r.note && (
                            <div className="text-sm text-body whitespace-pre-wrap px-2 py-1.5 bg-elevated/50 rounded-md mb-2">
                              {r.note}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            {r.target_link ? (
                              <button
                                onClick={() => navigate(r.target_link!)}
                                className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                              >
                                Open {r.target_kind === 'subscriber' ? 'subscriber' : 'conversation'} <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : <span />}
                            <button
                              onClick={() => { if (confirm('Dismiss this reminder?')) dismissMut.mutate(r._id); }}
                              disabled={dismissMut.isPending}
                              className="text-xs text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function KindChip({ current, value, label, icon: Icon, onClick }: {
  current: KindFilter; value: KindFilter; label: string; icon?: typeof User;
  onClick: (v: KindFilter) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30'
          : 'text-subtle hover:bg-elevated hover:text-body'
      }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
