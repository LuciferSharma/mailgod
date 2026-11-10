import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  Users, Mail, Eye, MousePointerClick, AlertTriangle, TrendingUp,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { analyticsApi } from '../api';
import WeeklyReports from '../components/analytics/WeeklyReports';

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  unsubscribed: '#ef4444',
  bounced: '#f59e0b',
  complained: '#f97316',
};

const tooltipStyle = {
  backgroundColor: 'var(--th-chart-tooltip-bg)',
  border: '1px solid var(--th-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--th-heading)',
};

function TrendBadge({ change }: { change: number }) {
  if (change === 0) return <span className="inline-flex items-center text-xs text-zinc-500"><Minus className="w-3 h-3 mr-0.5" />0%</span>;
  if (change > 0) return <span className="inline-flex items-center text-xs text-green-500"><ArrowUpRight className="w-3 h-3 mr-0.5" />+{change}%</span>;
  return <span className="inline-flex items-center text-xs text-red-500"><ArrowDownRight className="w-3 h-3 mr-0.5" />{change}%</span>;
}

function OverviewTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: analyticsApi.dashboard,
  });

  const { data: trends } = useQuery({
    queryKey: ['analytics-trends'],
    queryFn: analyticsApi.trends,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-subtle">No analytics data available.</p>
      </div>
    );
  }

  const overviewCards = [
    { label: 'Total Subscribers', value: stats.total_subscribers.toLocaleString(), icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/15', trend: trends?.subscribers?.change },
    { label: 'Active Subscribers', value: stats.active_subscribers.toLocaleString(), icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/15' },
    { label: 'Emails Sent Today', value: stats.emails_sent_today.toLocaleString(), icon: Mail, color: 'text-purple-500', bg: 'bg-purple-500/15' },
    { label: 'Emails Sent This Week', value: stats.emails_sent_week.toLocaleString(), icon: Mail, color: 'text-indigo-500', bg: 'bg-indigo-500/15', trend: trends?.sent?.change },
  ];

  const engagementCards = [
    { label: 'Open Rate', value: `${stats.open_rate.toFixed(1)}%`, icon: Eye, color: 'text-purple-500', bg: 'bg-purple-500/15', trend: trends?.opened?.change },
    { label: 'Click Rate', value: `${stats.click_rate.toFixed(1)}%`, icon: MousePointerClick, color: 'text-indigo-500', bg: 'bg-indigo-500/15', trend: trends?.clicked?.change },
    { label: 'Active Flows', value: stats.active_flows.toString(), icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/15' },
    { label: 'Total Campaigns', value: stats.total_campaigns.toString(), icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/15' },
  ];

  const subscribersByStatus = Object.entries(stats.subscribers_by_status).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count as number,
    fill: STATUS_COLORS[status] || '#6b7280',
  }));

  const engagement = trends?.engagement || [];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-card rounded-lg border border-line p-6">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-subtle">{card.label}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-heading">{card.value}</p>
                    {card.trend !== undefined && <TrendBadge change={card.trend} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {engagementCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-card rounded-lg border border-line p-6">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-subtle">{card.label}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-heading">{card.value}</p>
                    {card.trend !== undefined && <TrendBadge change={card.trend} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-lg border border-line p-6 mb-6">
        <h3 className="text-lg font-semibold text-heading mb-4">Daily Email Activity (Last 30 Days)</h3>
        {engagement.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={engagement}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: 'var(--th-subtle)' }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
              <Tooltip
                labelFormatter={(val) => new Date(val).toLocaleDateString()}
                contentStyle={tooltipStyle}
              />
              <Legend />
              <Line type="monotone" dataKey="sent" name="Sent" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="opened" name="Opened" stroke="#a855f7" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clicked" name="Clicked" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-dim text-center py-12">No email activity in the last 30 days.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-4">Subscriber Growth</h3>
          {stats.growth && stats.growth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'var(--th-subtle)' }}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
                <Tooltip
                  labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-dim text-center py-12">No growth data available.</p>
          )}
        </div>

        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-4">Subscribers by Status</h3>
          {subscribersByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subscribersByStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {subscribersByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-dim text-center py-12">No subscriber data available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'overview' | 'weekly'>('overview');
  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'weekly' as const, label: 'Weekly reports' },
  ];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-heading">Analytics</h1>
        <p className="text-subtle mt-1">Email performance analytics</p>
      </div>
      <div className="flex gap-1 border-b border-line mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t.key ? 'border-blue-500 text-heading' : 'border-transparent text-subtle hover:text-heading'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <OverviewTab /> : <WeeklyReports />}
    </div>
  );
}
