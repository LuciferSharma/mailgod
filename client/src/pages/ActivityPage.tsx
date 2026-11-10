import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import { Activity, Mail, MousePointerClick, AlertTriangle, XCircle, Eye, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const eventMeta: Record<string, { label: string; icon: any; color: string }> = {
  sent: { label: 'Sent', icon: Mail, color: 'text-blue-400 bg-blue-500/10' },
  delivered: { label: 'Delivered', icon: Mail, color: 'text-emerald-400 bg-emerald-500/10' },
  open: { label: 'Opened', icon: Eye, color: 'text-violet-400 bg-violet-500/10' },
  click: { label: 'Clicked', icon: MousePointerClick, color: 'text-amber-400 bg-amber-500/10' },
  bounce: { label: 'Bounced', icon: AlertTriangle, color: 'text-red-400 bg-red-500/10' },
  spamreport: { label: 'Spam', icon: XCircle, color: 'text-red-400 bg-red-500/10' },
  unsubscribe: { label: 'Unsubscribed', icon: XCircle, color: 'text-zinc-400 bg-zinc-500/10' },
};

const selectClass = 'bg-field border border-field-line rounded-lg px-3 py-2 text-sm text-heading focus:ring-2 focus:ring-blue-500/30 outline-none';

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['activity', page, eventFilter, sourceFilter],
    queryFn: () => analyticsApi.activity({
      page,
      limit: 50,
      ...(eventFilter && { event: eventFilter }),
      ...(sourceFilter && { source: sourceFilter }),
    }),
    refetchInterval: 5000,
  });

  const events = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            Activity Log
          </h1>
          <p className="text-sm text-subtle mt-1">{total.toLocaleString()} events total &middot; Live updates every 5s</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dim" />
          <select value={eventFilter} onChange={e => { setEventFilter(e.target.value); setPage(1); }} className={selectClass}>
            <option value="">All Events</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="open">Opened</option>
            <option value="click">Clicked</option>
            <option value="bounce">Bounced</option>
            <option value="spamreport">Spam Report</option>
            <option value="unsubscribe">Unsubscribed</option>
          </select>
          <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }} className={selectClass}>
            <option value="">All Sources</option>
            <option value="campaign">Campaigns</option>
            <option value="flow">Flows</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-subtle">Loading activity...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-20">
          <Activity className="w-10 h-10 text-dim mx-auto mb-3" />
          <p className="text-subtle">No activity yet</p>
          <p className="text-xs text-dim mt-1">Events will appear here as emails are sent</p>
        </div>
      ) : (
        <div className="space-y-1">
          {events.map((evt: any) => {
            const meta = eventMeta[evt.event] || { label: evt.event, icon: Mail, color: 'text-zinc-400 bg-zinc-500/10' };
            const Icon = meta.icon;
            const subscriber = evt.subscriber_id;
            const campaign = evt.campaign_id;
            const flow = evt.flow_id;

            return (
              <div key={evt._id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-line hover:bg-elevated transition-colors">
                <div className={`p-1.5 rounded-lg ${meta.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-heading truncate">
                      {subscriber?.email || subscriber?.name || 'Unknown'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-dim">
                    {campaign && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {typeof campaign === 'object' ? campaign.name : 'Campaign'}
                      </span>
                    )}
                    {flow && (
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" /> {typeof flow === 'object' ? flow.name : 'Flow'}
                      </span>
                    )}
                    {evt.metadata?.url && (
                      <span className="truncate max-w-[200px]" title={evt.metadata.url}>{evt.metadata.url}</span>
                    )}
                    {evt.metadata?.reason && (
                      <span className="text-red-400">{evt.metadata.reason}</span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-dim whitespace-nowrap">
                  {timeAgo(evt.timestamp)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
          <span className="text-xs text-dim">
            Page {page} of {totalPages} ({total.toLocaleString()} events)
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg bg-card border border-line text-subtle hover:bg-elevated disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg bg-card border border-line text-subtle hover:bg-elevated disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
