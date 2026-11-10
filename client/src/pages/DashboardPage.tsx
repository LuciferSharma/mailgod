import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import {
  Users, Send, GitBranch, Mail, TrendingUp, TrendingDown,
  MousePointerClick, ArrowUpRight, ArrowDownRight, Minus, Eye,
  ChevronDown, ChevronUp, MessageSquare, ExternalLink, Calendar, Video,
  Clock, CheckCircle2, AlertTriangle, AlertCircle, ArrowUp, ArrowDown,
  SlidersHorizontal, RotateCcw, Layers, Maximize2, Minimize2
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import type { DashboardRecentEngagement, DashboardRecentReply, CalBooking, ScheduledSendsInfo, OneOffSend } from '../types';

function TrendBadge({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  if (change === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-subtle"><Minus className="w-3 h-3" /> 0%</span>;
  if (change > 0) return <span className="inline-flex items-center gap-0.5 text-xs text-green-500"><ArrowUpRight className="w-3 h-3" /> {change}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-red-500"><ArrowDownRight className="w-3 h-3" /> {Math.abs(change)}%</span>;
}

export type DashboardSectionId =
  | 'scheduled_sends'
  | 'booked_calls'
  | 'recent_replies'
  | 'recent_clicks'
  | 'recent_opens'
  | 'campaigns_flows_oneoffs'
  | 'subscribers_by_plan';

export type DashboardCardWidth = 'full' | 'half';

const DEFAULT_SECTION_ORDER: DashboardSectionId[] = [
  'scheduled_sends',
  'booked_calls',
  'recent_replies',
  'recent_clicks',
  'recent_opens',
  'campaigns_flows_oneoffs',
  'subscribers_by_plan',
];

const DEFAULT_SECTION_WIDTHS: Record<DashboardSectionId, DashboardCardWidth> = {
  scheduled_sends: 'full',
  booked_calls: 'half',
  recent_replies: 'half',
  recent_clicks: 'half',
  recent_opens: 'half',
  campaigns_flows_oneoffs: 'half',
  subscribers_by_plan: 'half',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: analyticsApi.dashboard });
  const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: analyticsApi.trends });

  const [reorderMode, setReorderMode] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionId[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_section_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const set = new Set(parsed);
          const full = [...parsed.filter((id) => DEFAULT_SECTION_ORDER.includes(id as any))];
          for (const id of DEFAULT_SECTION_ORDER) {
            if (!set.has(id)) full.push(id as any);
          }
          return full as DashboardSectionId[];
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_SECTION_ORDER;
  });

  const [sectionWidths, setSectionWidths] = useState<Record<DashboardSectionId, DashboardCardWidth>>(() => {
    try {
      const saved = localStorage.getItem('dashboard_section_widths');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_SECTION_WIDTHS, ...parsed };
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_SECTION_WIDTHS;
  });

  const handleToggleWidth = (id: DashboardSectionId) => {
    setSectionWidths((prev) => {
      const current = prev[id] || 'full';
      const nextWidth: DashboardCardWidth = current === 'full' ? 'half' : 'full';
      const updated = { ...prev, [id]: nextWidth };
      try {
        localStorage.setItem('dashboard_section_widths', JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
  };

  const handleMove = (id: DashboardSectionId, direction: 'up' | 'down') => {
    setSectionOrder((prev) => {
      const index = prev.indexOf(id);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      try {
        localStorage.setItem('dashboard_section_order', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleResetOrder = () => {
    setSectionOrder(DEFAULT_SECTION_ORDER);
    setSectionWidths(DEFAULT_SECTION_WIDTHS);
    try {
      localStorage.removeItem('dashboard_section_order');
      localStorage.removeItem('dashboard_section_widths');
    } catch {
      /* ignore */
    }
  };

  if (isLoading) return <div className="animate-pulse p-8 text-subtle">Loading dashboard...</div>;
  if (!data) return <div className="p-8 text-subtle">Failed to load dashboard</div>;

  const stats = [
    { label: 'Total Subscribers', value: data.total_subscribers.toLocaleString(), icon: Users, color: 'bg-blue-500', trend: trends?.subscribers?.change },
    { label: 'Active Subscribers', value: data.active_subscribers.toLocaleString(), icon: Users, color: 'bg-green-500' },
    { label: 'Campaigns', value: data.total_campaigns.toLocaleString(), icon: Send, color: 'bg-purple-500' },
    { label: 'Active Flows', value: data.active_flows.toLocaleString(), icon: GitBranch, color: 'bg-orange-500' },
    { label: 'Emails Today', value: data.emails_sent_today.toLocaleString(), icon: Mail, color: 'bg-indigo-500' },
    { label: 'Emails This Week', value: data.emails_sent_week.toLocaleString(), icon: Mail, color: 'bg-pink-500', trend: trends?.sent?.change },
    { label: 'Open Rate', value: `${data.open_rate.toFixed(1)}%`, icon: TrendingUp, color: 'bg-teal-500', trend: trends?.opened?.change },
    { label: 'Click Rate', value: `${data.click_rate.toFixed(1)}%`, icon: MousePointerClick, color: 'bg-amber-500', trend: trends?.clicked?.change },
  ];

  const renderSection = (id: DashboardSectionId, index: number) => {
    const isFirst = index === 0;
    const isLast = index === sectionOrder.length - 1;
    const width = sectionWidths[id] || 'full';
    const cardProps = {
      sectionId: id,
      width,
      reorderMode,
      onMoveUp: () => handleMove(id, 'up'),
      onMoveDown: () => handleMove(id, 'down'),
      onToggleWidth: () => handleToggleWidth(id),
      isFirst,
      isLast,
    };

    switch (id) {
      case 'scheduled_sends':
        return <ScheduledSendsCard key={id} info={(data as any).scheduled_sends} {...cardProps} />;
      case 'booked_calls':
        return (
          <CollapsibleCard
            key={id}
            title="Booked Calls (Cal.com)"
            icon={Calendar}
            iconColor="text-amber-500"
            badge={<span className="text-[10px] font-medium bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">Webhook</span>}
            {...cardProps}
          >
            <CalBookingsTable />
          </CollapsibleCard>
        );
      case 'recent_replies':
        return (
          <CollapsibleCard
            key={id}
            title="Recent Prospect Replies"
            icon={MessageSquare}
            iconColor="text-indigo-500"
            action={<Link to="/inbox" className="text-xs text-link hover:underline">Go to Inbox</Link>}
            {...cardProps}
          >
            <RecentRepliesTable replies={(data as any).recent_replies || []} />
          </CollapsibleCard>
        );
      case 'recent_clicks':
        return (
          <CollapsibleCard
            key={id}
            title="Most Recent Link Clicks"
            icon={MousePointerClick}
            iconColor="text-amber-500"
            action={<Link to="/activity" className="text-xs text-link hover:underline">All activity</Link>}
            {...cardProps}
          >
            <RecentEngagementTable
              rows={data.recent_clicks || []}
              emptyMessage="No clicks recorded yet"
              showUrl
              note="Click tracking is off on new emails — table shows historical clicks only."
            />
          </CollapsibleCard>
        );
      case 'recent_opens':
        return (
          <CollapsibleCard
            key={id}
            title="Most Recent Email Opens"
            icon={Eye}
            iconColor="text-violet-500"
            action={<Link to="/activity" className="text-xs text-link hover:underline">All activity</Link>}
            {...cardProps}
          >
            <RecentEngagementTable
              rows={data.recent_opens || []}
              emptyMessage="No opens recorded yet"
              note="Open tracking is on for new sends (SendGrid pixel)."
            />
          </CollapsibleCard>
        );
      case 'campaigns_flows_oneoffs':
        return (
          <CollapsibleCard
            key={id}
            title="Recent Activity & Sends (Campaigns, Flows & One-Offs)"
            icon={Layers}
            iconColor="text-purple-500"
            {...cardProps}
          >
            <CombinedActivityCard
              campaigns={data.recent_campaigns || []}
              flows={data.recent_flows || []}
              oneOffs={(data as any).recent_one_offs || []}
            />
          </CollapsibleCard>
        );
      case 'subscribers_by_plan':
        return (
          <CollapsibleCard
            key={id}
            title="Subscribers by Plan"
            icon={Users}
            iconColor="text-blue-500"
            {...cardProps}
          >
            {Object.keys(data.subscribers_by_plan).length > 0 ? (
              <div className="space-y-3 pt-2">
                {Object.entries(data.subscribers_by_plan).map(([plan, count]) => {
                  const total = data.total_subscribers || 1;
                  const pct = (((count as number) / total) * 100).toFixed(1);
                  return (
                    <div key={plan}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium text-body">{plan}</span>
                        <span className="text-subtle">
                          {(count as number).toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-elevated rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-dim text-sm">No subscriber data yet</p>
              </div>
            )}
          </CollapsibleCard>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Dashboard</h1>
          <p className="text-subtle mt-1">Overview of your email marketing</p>
        </div>
        <div className="flex items-center gap-2">
          {reorderMode && (
            <button
              onClick={handleResetOrder}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-subtle hover:text-heading hover:bg-elevated transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Default Order
            </button>
          )}
          <button
            onClick={() => setReorderMode(!reorderMode)}
            type="button"
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              reorderMode
                ? 'bg-primary-500 text-white shadow-sm'
                : 'border border-line text-body hover:bg-elevated'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {reorderMode ? 'Done Rearranging' : 'Rearrange Dashboard'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-card rounded-lg p-4 border border-line">
            <div className="flex items-center gap-3">
              <div className={`${s.color} p-2 rounded-lg`}><s.icon className="w-4 h-4 text-white" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-subtle">{s.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-heading">{s.value}</p>
                  <TrendBadge change={s.trend} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card rounded-lg p-6 border border-line">
          <h3 className="text-sm font-semibold text-body mb-4">Subscriber Growth (Last 30 Days)</h3>
          {data.growth.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--th-subtle)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--th-subtle)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--th-chart-tooltip-bg)', border: '1px solid var(--th-chart-tooltip-border)', borderRadius: '8px', color: 'var(--th-heading)' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[250px] text-center">
              <Users className="w-10 h-10 text-dim mb-2" />
              <p className="text-dim text-sm">No growth data yet</p>
              <Link to="/subscribers" className="text-xs text-link hover:underline mt-1">Import subscribers to get started</Link>
            </div>
          )}
        </div>
        <div className="bg-card rounded-lg p-6 border border-line">
          <h3 className="text-sm font-semibold text-body mb-4">Engagement Rate (Last 30 Days)</h3>
          {trends?.engagement?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trends.engagement}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--th-subtle)' }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--th-subtle)' }} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--th-chart-tooltip-bg)', border: '1px solid var(--th-chart-tooltip-border)', borderRadius: '8px', color: 'var(--th-heading)' }} />
                <Line type="monotone" dataKey="open_rate" name="Open Rate %" stroke="#14b8a6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[250px] text-center">
              <TrendingUp className="w-10 h-10 text-dim mb-2" />
              <p className="text-dim text-sm">No engagement data yet</p>
              <p className="text-xs text-dim mt-1">Send campaigns to see open rates over time</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {sectionOrder.map((id, index) => renderSection(id, index))}
      </div>
    </div>
  );
}

function formatWhen(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleString();
}

function CollapsibleCard({
  title,
  icon: Icon,
  iconColor = 'text-body',
  badge,
  defaultOpen = true,
  action,
  width = 'full',
  reorderMode,
  onMoveUp,
  onMoveDown,
  onToggleWidth,
  isFirst,
  isLast,
  children,
}: {
  title: React.ReactNode;
  icon?: typeof Users;
  iconColor?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  width?: DashboardCardWidth;
  reorderMode?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggleWidth?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`bg-card rounded-lg border overflow-hidden transition-all duration-150 ${
        width === 'full' ? 'lg:col-span-2' : 'lg:col-span-1'
      } ${reorderMode ? 'border-primary-500/60 ring-1 ring-primary-500/30' : 'border-line'}`}
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-elevated/40"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
          <h3 className="text-sm font-semibold text-body">{title}</h3>
          {badge}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {reorderMode && (
            <div className="flex items-center gap-1 bg-elevated/80 border border-line px-1.5 py-0.5 rounded-lg mr-2">
              <button
                onClick={onToggleWidth}
                type="button"
                className="p-1 rounded text-subtle hover:text-heading transition-colors inline-flex items-center gap-1 text-[11px] font-medium"
                title={width === 'full' ? 'Make Half Width' : 'Make Full Width'}
              >
                {width === 'full' ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Half Width</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Full Width</span>
                  </>
                )}
              </button>
              <div className="w-px h-3.5 bg-line my-auto mx-0.5" />
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                type="button"
                className="p-1 rounded text-subtle hover:text-heading disabled:opacity-30 transition-colors"
                title="Move Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                type="button"
                className="p-1 rounded text-subtle hover:text-heading disabled:opacity-30 transition-colors"
                title="Move Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {action}
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="p-1 rounded text-subtle hover:text-heading hover:bg-elevated transition-colors"
            title={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {isOpen && <div className="px-6 pb-6 pt-1 border-t border-line/40">{children}</div>}
    </div>
  );
}

function CombinedActivityCard({
  campaigns = [],
  flows = [],
  oneOffs = [],
}: {
  campaigns: any[];
  flows: any[];
  oneOffs: OneOffSend[];
}) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'flows' | 'oneoffs'>('campaigns');

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 border-b border-line pb-3 mb-4">
        <button
          onClick={() => setActiveTab('campaigns')}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'campaigns'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-subtle hover:text-heading hover:bg-elevated'
          }`}
        >
          Recent Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('flows')}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'flows'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-subtle hover:text-heading hover:bg-elevated'
          }`}
        >
          Active Flows ({flows.length})
        </button>
        <button
          onClick={() => setActiveTab('oneoffs')}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'oneoffs'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-subtle hover:text-heading hover:bg-elevated'
          }`}
        >
          One-Off Sends ({oneOffs.length})
        </button>
      </div>

      {activeTab === 'campaigns' &&
        (campaigns.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-subtle border-b border-line">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Sent</th>
                <th className="pb-2 font-medium text-right">Opened</th>
                <th className="pb-2 font-medium text-right">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => (
                <tr key={c._id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                  <td className="py-2.5 font-medium">
                    <Link to={`/campaigns/${c._id}`} className="text-link hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'sent'
                          ? 'bg-green-500/15 text-green-500'
                          : c.status === 'sending'
                          ? 'bg-blue-500/15 text-blue-500'
                          : 'bg-zinc-500/15 text-subtle'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-subtle text-right tabular-nums">{c.stats?.sent || 0}</td>
                  <td className="py-2.5 text-subtle text-right tabular-nums">{c.stats?.opened || 0}</td>
                  <td className="py-2.5 text-subtle text-right tabular-nums">{c.stats?.clicked || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Send className="w-8 h-8 text-dim mb-2 text-purple-500" />
            <p className="text-dim text-sm">No recent campaigns</p>
            <Link to="/campaigns" className="text-xs text-link hover:underline mt-1">
              Create a campaign
            </Link>
          </div>
        ))}

      {activeTab === 'flows' &&
        (flows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-subtle border-b border-line">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Enrolled</th>
                <th className="pb-2 font-medium text-right">Active</th>
                <th className="pb-2 font-medium text-right">Done</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f: any) => {
                const statusClass =
                  f.status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : f.status === 'paused'
                    ? 'bg-yellow-500/15 text-yellow-500'
                    : 'bg-zinc-500/15 text-subtle';
                return (
                  <tr key={f._id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                    <td className="py-2.5 font-medium">
                      <Link to={`/flows/${f._id}`} className="text-link hover:underline">
                        {f.name}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-subtle text-right tabular-nums">{f.stats?.enrolled || 0}</td>
                    <td className="py-2.5 text-subtle text-right tabular-nums">{f.stats?.active || 0}</td>
                    <td className="py-2.5 text-subtle text-right tabular-nums">{f.stats?.completed || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <GitBranch className="w-8 h-8 text-dim mb-2 text-orange-500" />
            <p className="text-dim text-sm">No flows created yet</p>
            <Link to="/flows" className="text-xs text-link hover:underline mt-1">
              Create a flow
            </Link>
          </div>
        ))}

      {activeTab === 'oneoffs' &&
        (oneOffs.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-subtle border-b border-line">
                <th className="pb-2 font-medium">Subject</th>
                <th className="pb-2 font-medium">Recipients</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Sent Time</th>
              </tr>
            </thead>
            <tbody>
              {oneOffs.map((o) => (
                <tr key={o._id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                  <td className="py-2.5 font-medium text-heading">{o.subject}</td>
                  <td className="py-2.5 text-subtle">
                    {o.recipient_count} recipient{o.recipient_count !== 1 ? 's' : ''}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        o.status === 'sent'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : o.status === 'sending'
                          ? 'bg-blue-500/15 text-blue-500'
                          : 'bg-red-500/15 text-red-500'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-subtle text-right whitespace-nowrap text-xs tabular-nums">
                    {o.sent_at || o.created_at ? formatWhen(o.sent_at || o.created_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Mail className="w-8 h-8 text-dim mb-2 text-indigo-500" />
            <p className="text-dim text-sm">No recent one-off sends</p>
          </div>
        ))}
    </div>
  );
}

function ScheduledSendsCard({ info, ...cardProps }: { info?: ScheduledSendsInfo; [key: string]: any }) {
  if (!info) return null;

  const { indicator, total_count, total_recipients, days_covered, latest_scheduled_at, sends = [] } = info;
  const pool = info.pool || { queued: 0, daily_capacity: 0, days: 0, sends: [] };

  let badgeColor = 'bg-red-500/15 text-red-500 border-red-500/30';
  let badgeText = 'Queue Empty (Action Required)';
  let BadgeIcon = AlertCircle;

  if (indicator === 'healthy') {
    badgeColor = 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    badgeText = `${days_covered} Days Scheduled (Queue Healthy)`;
    BadgeIcon = CheckCircle2;
  } else if (indicator === 'low') {
    badgeColor = 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    badgeText = `Low Coverage (${days_covered} Day${days_covered !== 1 ? 's' : ''} Left - Schedule More)`;
    BadgeIcon = AlertTriangle;
  }

  return (
    <CollapsibleCard
      title="Scheduled Sends Queue"
      icon={Clock}
      iconColor="text-blue-500"
      badge={
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
          <BadgeIcon className="w-3.5 h-3.5" />
          {badgeText}
        </span>
      }
      {...cardProps}
    >
      <div className="pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-elevated/50 p-3 rounded-lg border border-line/50 mb-4 text-xs">
          <div className="flex items-center gap-4 text-subtle">
            <div>
              <span className="text-dim">Pending Batches:</span>{' '}
              <strong className="text-heading font-medium">{total_count}</strong>
            </div>
            <div>
              <span className="text-dim">Total Recipients:</span>{' '}
              <strong className="text-heading font-medium">{total_recipients.toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-dim">Days Covered:</span>{' '}
              <strong className="text-heading font-medium">{days_covered} days</strong>
            </div>
          </div>
          {latest_scheduled_at && (
            <div className="text-subtle">
              <span className="text-dim">Furthest Scheduled:</span>{' '}
              <span className="font-medium text-body">
                {new Date(latest_scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {pool.sends.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-heading">Sender pool queue</span>
              <span className="text-subtle">
                {pool.queued.toLocaleString()} queued · {pool.daily_capacity}/day capacity · about {pool.days} day{pool.days !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {pool.sends.map((p) => {
                const total = p.queued + p.sent || 1;
                return (
                  <div key={p._id} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-heading truncate">
                        {p.thread_followup && <span className="mr-1.5 px-1 py-0.5 rounded text-[10px] bg-elevated text-dim border border-line">in thread</span>}
                        {p.subject}
                      </span>
                      <span className="text-xs text-subtle whitespace-nowrap">
                        {p.sent} sent · {p.queued} queued · via {p.senders.map(s => s.split('@')[0]).join(', ')}
                      </span>
                    </div>
                    <div className="h-1.5 bg-elevated rounded mt-1"><div className="h-1.5 bg-emerald-500 rounded" style={{ width: `${(p.sent / total) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sends.length === 0 && pool.sends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Clock className="w-8 h-8 text-dim mb-2 text-blue-500" />
            <p className="text-dim text-sm">No emails currently scheduled or queued</p>
            <p className="text-xs text-subtle mt-1">
              Use the MCP agent or schedule one-off emails to automatically send them over time.
            </p>
          </div>
        ) : sends.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-subtle border-b border-line">
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Recipients</th>
                  <th className="pb-2 font-medium">Scheduled Time</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s._id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                    <td className="py-2.5 pr-2 font-medium text-heading">
                      {s.subject}
                    </td>
                    <td className="py-2.5 pr-2 text-subtle">
                      {s.recipient_count} recipient{s.recipient_count !== 1 ? 's' : ''}
                    </td>
                    <td className="py-2.5 pr-2 text-subtle whitespace-nowrap text-xs tabular-nums">
                      {s.scheduled_at
                        ? new Date(s.scheduled_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-2.5 text-right pl-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500">
                        Scheduled
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

function CalBookingsTable() {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['cal-bookings'],
    queryFn: () => analyticsApi.calBookings(10),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="text-sm text-subtle py-4 text-center">Loading booked calls...</div>;
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <Calendar className="w-8 h-8 text-dim mb-2 text-amber-500" />
        <p className="text-dim text-sm">No booked calls recorded yet</p>
        <p className="text-xs text-subtle mt-1">
          Webhook URL: <code className="bg-elevated px-1.5 py-0.5 rounded text-heading font-mono text-[11px]">/api/webhooks/cal</code>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm pt-2">
        <thead>
          <tr className="text-left text-subtle border-b border-line">
            <th className="pb-2 font-medium">Attendee</th>
            <th className="pb-2 font-medium">Event Title</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Scheduled Time</th>
            <th className="pb-2 font-medium text-right">Link</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b: CalBooking) => {
            const sub = typeof b.subscriber_id === 'object' ? b.subscriber_id : null;
            const statusClass =
              b.status === 'ACCEPTED' ? 'bg-emerald-500/15 text-emerald-500' :
              b.status === 'RESCHEDULED' ? 'bg-amber-500/15 text-amber-500' :
              b.status === 'CANCELLED' ? 'bg-red-500/15 text-red-500' :
              'bg-zinc-500/15 text-subtle';

            return (
              <tr key={b._id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                <td className="py-2.5 pr-2">
                  <div className="font-medium text-heading">
                    {sub?._id ? (
                      <Link to={`/subscribers/${sub._id}`} className="text-link hover:underline">
                        {b.attendee_name || sub.name || b.attendee_email}
                      </Link>
                    ) : (
                      b.attendee_name || b.attendee_email || 'Attendee'
                    )}
                  </div>
                  {b.attendee_email && (
                    <div className="text-xs text-subtle truncate max-w-[180px]">{b.attendee_email}</div>
                  )}
                </td>
                <td className="py-2.5 pr-2 font-medium text-body">
                  {b.event_title}
                </td>
                <td className="py-2.5 pr-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                    {b.status}
                  </span>
                </td>
                <td className="py-2.5 pr-2 text-subtle whitespace-nowrap text-xs tabular-nums">
                  {new Date(b.start_time).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-2.5 text-right pl-2">
                  {b.meeting_url ? (
                    <a
                      href={b.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:underline"
                    >
                      Join <Video className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs text-subtle">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentRepliesTable({ replies }: { replies: DashboardRecentReply[] }) {
  const navigate = useNavigate();

  if (!replies || replies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <MessageSquare className="w-8 h-8 text-dim mb-2 text-indigo-500" />
        <p className="text-dim text-sm">No recent prospect replies yet</p>
      </div>
    );
  }

  const handleRowClick = (reply: DashboardRecentReply) => {
    navigate('/inbox', {
      state: {
        open: {
          type: reply.source_type,
          id: reply.source_id,
          flow_node_id: reply.flow_node_id || undefined,
          subscriber_id: reply.subscriber_id || undefined,
        },
      },
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm pt-2">
        <thead>
          <tr className="text-left text-subtle border-b border-line">
            <th className="pb-2 font-medium">Prospect</th>
            <th className="pb-2 font-medium">Reply Snippet</th>
            <th className="pb-2 font-medium">Source</th>
            <th className="pb-2 font-medium text-right">Received</th>
            <th className="pb-2 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {replies.map((reply) => (
            <tr
              key={reply._id}
              onClick={() => handleRowClick(reply)}
              className="border-b border-line/50 hover:bg-elevated/60 cursor-pointer transition-colors group"
            >
              <td className="py-2.5 pr-2">
                <div className="font-medium text-heading group-hover:text-primary-500 transition-colors">
                  {reply.subscriber_name || reply.subscriber_email || 'Prospect'}
                </div>
                {reply.subscriber_name && reply.subscriber_email && (
                  <div className="text-xs text-subtle font-normal truncate max-w-[180px]">
                    {reply.subscriber_email}
                  </div>
                )}
              </td>
              <td className="py-2.5 pr-2 max-w-xs truncate">
                <span className="font-medium text-body mr-1">{reply.subject}:</span>
                <span className="text-subtle">{reply.text_snippet}</span>
              </td>
              <td className="py-2.5 pr-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-elevated text-subtle capitalize border border-line/50">
                  {reply.source_type.replace('_', ' ')}
                </span>
              </td>
              <td className="py-2.5 text-subtle text-right whitespace-nowrap tabular-nums text-xs" title={new Date(reply.timestamp).toLocaleString()}>
                {formatWhen(reply.timestamp)}
              </td>
              <td className="py-2.5 text-right pl-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 opacity-80 group-hover:opacity-100 group-hover:underline">
                  Open Thread <ExternalLink className="w-3 h-3" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentEngagementTable({
  rows,
  emptyMessage,
  showUrl = false,
  note,
}: {
  rows: DashboardRecentEngagement[];
  emptyMessage: string;
  showUrl?: boolean;
  note?: string;
}) {
  return (
    <div className="pt-2">
      {note && <p className="text-[11px] text-dim mb-3">{note}</p>}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <Eye className="w-8 h-8 text-dim mb-2" />
          <p className="text-dim text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-subtle border-b border-line">
                <th className="pb-2 font-medium">Subscriber</th>
                <th className="pb-2 font-medium">Source</th>
                {showUrl && <th className="pb-2 font-medium">Link</th>}
                <th className="pb-2 font-medium text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-line/50">
                  <td className="py-2 pr-2">
                    {row.subscriber_id ? (
                      <Link to={`/subscribers/${row.subscriber_id}`} className="text-link hover:underline font-medium">
                        {row.subscriber_email || row.subscriber_name || 'Unknown'}
                      </Link>
                    ) : (
                      <span className="text-body">{row.subscriber_email || 'Unknown'}</span>
                    )}
                    {row.subscriber_name && row.subscriber_email && (
                      <div className="text-xs text-dim truncate max-w-[180px]">{row.subscriber_name}</div>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-subtle">
                    {row.source_type === 'campaign' && row.source_id ? (
                      <Link to={`/campaigns/${row.source_id}`} className="text-link hover:underline">
                        {row.source_label}
                      </Link>
                    ) : row.source_type === 'flow' && row.source_id ? (
                      <Link to={`/flows/${row.source_id}`} className="text-link hover:underline">
                        {row.source_label}
                      </Link>
                    ) : (
                      row.source_label
                    )}
                  </td>
                  {showUrl && (
                    <td className="py-2 pr-2 text-subtle max-w-[200px]">
                      {row.url ? (
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline truncate block" title={row.url}>
                          {row.url.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className="py-2 text-subtle text-right whitespace-nowrap tabular-nums" title={new Date(row.timestamp).toLocaleString()}>
                    {formatWhen(row.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
