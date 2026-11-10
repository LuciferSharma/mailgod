import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Send, Pause, XCircle, Mail, Eye, MousePointerClick,
  AlertTriangle, UserMinus, CheckCircle, BarChart3, ChevronLeft, ChevronRight,
  Reply, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignApi, analyticsApi } from '../api';
import CampaignFunnel from '../components/campaigns/CampaignFunnel';
import CampaignTimeline from '../components/campaigns/CampaignTimeline';

const statusColors: Record<string, string> = {
  draft: 'bg-zinc-500/15 text-subtle',
  scheduled: 'bg-yellow-500/15 text-yellow-500',
  sending: 'bg-blue-500/15 text-blue-500',
  paused: 'bg-yellow-500/15 text-yellow-500',
  sent: 'bg-green-500/15 text-green-500',
  cancelled: 'bg-red-500/15 text-red-500',
};

const eventBadgeColors: Record<string, string> = {
  sent: 'bg-blue-500/15 text-blue-500',
  delivered: 'bg-green-500/15 text-green-500',
  open: 'bg-purple-500/15 text-purple-500',
  click: 'bg-indigo-500/15 text-indigo-500',
  bounce: 'bg-red-500/15 text-red-500',
  spamreport: 'bg-red-500/15 text-red-500',
  unsubscribe: 'bg-zinc-500/15 text-zinc-400',
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [recipientsPage, setRecipientsPage] = useState(1);

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === 'sending' ? 3000 : false,
  });

  const { data: analytics } = useQuery({
    queryKey: ['campaign-analytics', id],
    queryFn: () => analyticsApi.campaign(id!),
    enabled: !!id && !!campaign && campaign.status !== 'draft',
    refetchInterval: (query) => {
      const camp = query.state.data?.campaign;
      return camp?.status === 'sending' ? 3000 : false;
    },
  });

  const { data: recipients } = useQuery({
    queryKey: ['campaign-recipients', id, recipientsPage],
    queryFn: () => analyticsApi.campaignRecipients(id!, { page: recipientsPage, limit: 50 }),
    enabled: !!id && !!campaign && campaign.status !== 'draft',
    refetchInterval: campaign?.status === 'sending' ? 5000 : false,
  });

  const { data: nextBatch } = useQuery({
    queryKey: ['campaign-next-batch', id],
    queryFn: () => campaignApi.nextBatch(id!),
    enabled: !!id && !!campaign && (campaign.status === 'sending' || campaign.status === 'paused'),
    refetchInterval: campaign?.status === 'sending' ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: () => campaignApi.send(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign sending started');
    },
    onError: () => toast.error('Failed to send campaign'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => campaignApi.pause(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign paused');
    },
    onError: () => toast.error('Failed to pause campaign'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => campaignApi.resume(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign resumed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to resume campaign'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => campaignApi.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign cancelled');
    },
    onError: () => toast.error('Failed to cancel campaign'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load campaign.</p>
        <Link to="/campaigns" className="text-link hover:underline mt-2 inline-block">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  const rawStats: any = campaign.stats || {};
  const stats = {
    total: rawStats.total ?? 0,
    sent: rawStats.sent ?? 0,
    delivered: rawStats.delivered ?? 0,
    opened: rawStats.opened ?? 0,
    clicked: rawStats.clicked ?? 0,
    bounced: rawStats.bounced ?? 0,
    unsubscribed: rawStats.unsubscribed ?? 0,
  };
  const openRate = stats.delivered > 0 ? ((stats.opened / stats.delivered) * 100).toFixed(1) : '0.0';
  const clickRate = stats.delivered > 0 ? ((stats.clicked / stats.delivered) * 100).toFixed(1) : '0.0';
  const sendProgress = stats.total > 0 ? Math.min(100, (stats.sent / stats.total) * 100) : 0;

  const replyCount = (campaign as any).reply_count || 0;
  const statCards = [
    { label: 'Total', value: stats.total, icon: Mail, color: 'text-zinc-500', bg: 'bg-zinc-500/15' },
    { label: 'Sent', value: stats.sent, icon: Send, color: 'text-blue-500', bg: 'bg-blue-500/15' },
    { label: 'Delivered', value: stats.delivered, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/15' },
    { label: 'Opened', value: stats.opened, icon: Eye, color: 'text-purple-500', bg: 'bg-purple-500/15' },
    { label: 'Clicked', value: stats.clicked, icon: MousePointerClick, color: 'text-indigo-500', bg: 'bg-indigo-500/15' },
    { label: 'Replies', value: replyCount, icon: Reply, color: 'text-emerald-500', bg: 'bg-emerald-500/15' },
    { label: 'Bounced', value: stats.bounced, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/15' },
    { label: 'Unsubscribed', value: stats.unsubscribed, icon: UserMinus, color: 'text-orange-500', bg: 'bg-orange-500/15' },
  ];

  const totalRecipientPages = recipients ? Math.ceil(recipients.total / recipients.limit) : 0;

  return (
    <div>
      <Link to="/campaigns" className="inline-flex items-center text-sm text-subtle hover:text-heading mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campaigns
      </Link>

      <div className="bg-card rounded-lg border border-line p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-heading">{campaign.name}</h1>
            <p className="text-sm text-subtle mt-1">Subject: {campaign.subject}</p>
            <div className="flex items-center gap-4 mt-3 text-sm text-subtle">
              <span>Segment: {renderRef(campaign.segment_id)}</span>
              <span>Template: {renderRef(campaign.template_id)}</span>
            </div>
            {campaign.scheduled_at && (
              <p className="text-sm text-subtle mt-1">
                Scheduled: {new Date(campaign.scheduled_at).toLocaleString()}
              </p>
            )}
            {campaign.started_at && (
              <p className="text-sm text-subtle mt-1">
                Started: {new Date(campaign.started_at).toLocaleString()}
              </p>
            )}
            {campaign.completed_at && (
              <p className="text-sm text-subtle mt-1">
                Completed: {new Date(campaign.completed_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[campaign.status] || 'bg-zinc-500/15 text-subtle'}`}>
              {campaign.status}
            </span>
          </div>
        </div>

        {campaign.status === 'sending' && stats.total > 0 && (
          <div className="mt-5 pt-4 border-t border-line">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-body">Sending Progress</span>
              <span className="text-sm text-heading font-semibold">
                {stats.sent.toLocaleString()} / {stats.total.toLocaleString()} ({sendProgress.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2.5 bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-700"
                style={{ width: `${sendProgress}%` }}
              />
            </div>
            <p className="text-xs text-dim mt-1.5">Auto-refreshing every 3 seconds</p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-line">
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" /> Send Now
            </button>
          )}
          {campaign.status === 'sending' && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
            >
              <Pause className="w-4 h-4 mr-2" /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" /> Resume
            </button>
          )}
          {(campaign.status === 'sending' || campaign.status === 'scheduled' || campaign.status === 'paused') && (
            <button
              onClick={() => {
                if (confirm('Cancel this campaign?')) cancelMutation.mutate();
              }}
              disabled={cancelMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 mr-2" /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-lg border border-line p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/15 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-subtle">Open Rate</p>
              <p className="text-3xl font-bold text-heading">{openRate}%</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-line p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/15 rounded-lg">
              <MousePointerClick className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm text-subtle">Click Rate</p>
              <p className="text-3xl font-bold text-heading">{clickRate}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-card rounded-lg border border-line p-4 text-center">
              <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-2`}>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className="text-xl font-bold text-heading">{card.value.toLocaleString()}</p>
              <p className="text-xs text-subtle mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {(campaign.status === 'sending' || campaign.status === 'paused') && nextBatch && (
        <NextBatchPanel data={nextBatch} status={campaign.status} />
      )}

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <CampaignFunnel eventCounts={analytics.event_counts} />
          <CampaignTimeline timeline={analytics.timeline} />
        </div>
      )}

      {recipients && recipients.total > 0 && (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <div className="px-6 py-4 border-b border-line flex items-center justify-between">
            <h3 className="text-lg font-semibold text-heading">
              Recipients ({recipients.total.toLocaleString()})
            </h3>
            {campaign.status === 'sending' && (
              <span className="text-xs text-dim">Auto-refreshing</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-elevated">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Subscriber</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recipients.data.map((rec: any, idx: number) => {
                  const sub = rec.subscriber || {};
                  return (
                  <tr key={sub._id || `row-${idx}`} className="hover:bg-elevated/50">
                    <td className="px-6 py-3">
                      <div className="text-sm text-heading">{sub.email || <em className="text-dim">unknown subscriber</em>}</div>
                      {sub.name && (
                        <div className="text-xs text-subtle">{sub.name}</div>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventBadgeColors[rec.latest_event] || 'bg-zinc-500/15 text-subtle'}`}>
                        {rec.latest_event}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-subtle">
                      {rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalRecipientPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-line">
              <span className="text-sm text-subtle">
                Page {recipientsPage} of {totalRecipientPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setRecipientsPage(p => Math.max(1, p - 1))}
                  disabled={recipientsPage === 1}
                  className="p-1.5 rounded text-subtle hover:text-heading disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRecipientsPage(p => Math.min(totalRecipientPages, p + 1))}
                  disabled={recipientsPage >= totalRecipientPages}
                  className="p-1.5 rounded text-subtle hover:text-heading disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderRef(ref: any): string {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  return ref.name || ref._id || '—';
}

function NextBatchPanel({ data, status }: { data: any; status: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextAt = data.next_batch_at ? new Date(data.next_batch_at).getTime() : null;
  const remainingMs = nextAt ? nextAt - now : null;
  const dueNow = remainingMs !== null && remainingMs <= 0;
  const remainingLabel = remainingMs === null
    ? 'Calculating...'
    : dueNow
      ? 'Sending now'
      : formatDuration(remainingMs);

  if (data.remaining === 0) {
    return (
      <div className="bg-card rounded-lg border border-line p-5 mb-6">
        <div className="flex items-center gap-2 text-sm text-emerald-500">
          <CheckCircle className="w-4 h-4" />
          All recipients reached. No more batches to send.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-line p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-heading">Next batch</h3>
        </div>
        {status === 'paused' && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold uppercase tracking-wider">
            Paused — resume to continue
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase text-dim tracking-wider mb-0.5">Sends in</p>
          <p className={`text-base font-semibold tabular-nums ${dueNow ? 'text-emerald-500' : 'text-heading'}`}>
            {status === 'paused' ? '—' : remainingLabel}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-dim tracking-wider mb-0.5">Batch size</p>
          <p className="text-base font-semibold text-heading tabular-nums">{data.batch_size}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-dim tracking-wider mb-0.5">Remaining total</p>
          <p className="text-base font-semibold text-heading tabular-nums">{data.remaining.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-dim tracking-wider mb-0.5">Last batch sent</p>
          <p className="text-sm font-medium text-body">
            {data.last_batch_completed_at
              ? new Date(data.last_batch_completed_at).toLocaleTimeString()
              : 'Not yet'}
            {data.last_batch_size > 0 && (
              <span className="text-dim text-xs ml-1">({data.last_batch_size})</span>
            )}
          </p>
        </div>
      </div>

      {data.recipients?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase text-dim tracking-wider mb-2">
            Next {data.recipients.length} of {Math.min(data.batch_size, data.remaining)} recipient{data.batch_size !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
            {data.recipients.map((r: any) => (
              <div key={r._id} className="text-xs px-2 py-1.5 rounded bg-elevated flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-body truncate">{r.email}</div>
                  {r.name && <div className="text-dim truncate text-[10px]">{r.name}</div>}
                </div>
                {r.plan_tier && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-dim shrink-0">{r.plan_tier}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}
