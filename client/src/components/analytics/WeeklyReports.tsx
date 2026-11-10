import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Download, ChevronDown, ChevronRight, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { analyticsApi } from '../../api';
import type { WeekRow } from '../../types';

const tooltipStyle = {
  backgroundColor: 'var(--th-chart-tooltip-bg)',
  border: '1px solid var(--th-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--th-heading)',
};

const SEVERITY: Record<string, { cls: string; Icon: typeof Info }> = {
  high: { cls: 'border-red-500/40 bg-red-500/10', Icon: AlertCircle },
  medium: { cls: 'border-yellow-500/40 bg-yellow-500/10', Icon: AlertTriangle },
  low: { cls: 'border-blue-500/40 bg-blue-500/10', Icon: Info },
  info: { cls: 'border-line bg-elevated', Icon: Info },
};

const REASON_LABEL: Record<string, string> = {
  invalid_address: 'Address does not exist',
  mailbox_full: 'Mailbox full',
  blocked_or_spam: 'Blocked or flagged as spam',
  dns_or_connection: 'DNS or connection error',
  other: 'Other',
};

const fmtDate = (s: string) => {
  const d = new Date(s + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

function WeekDetail({ w }: { w: WeekRow }) {
  const senders = Object.entries(w.by_sender).sort((a, b) => b[1].sent - a[1].sent);
  const reasons = Object.entries(w.bounce_reasons).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-elevated rounded-lg text-sm">
      <div>
        <p className="font-semibold text-heading mb-2">What stood out</p>
        {w.findings.length ? (
          <ul className="space-y-1.5 list-disc pl-4 text-subtle">{w.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
        ) : <p className="text-dim">Nothing unusual this week.</p>}
      </div>
      <div>
        <p className="font-semibold text-heading mb-2">Sent by mailbox</p>
        {senders.length ? senders.map(([name, s]) => (
          <div key={name} className="flex justify-between text-subtle">
            <span className="truncate mr-2">{name}</span>
            <span className="whitespace-nowrap">{s.sent} sent{s.bounced ? `, ${s.bounced} bounced` : ''}</span>
          </div>
        )) : <p className="text-dim">No sends.</p>}
      </div>
      <div>
        <p className="font-semibold text-heading mb-2">Why emails bounced</p>
        {reasons.length ? reasons.map(([k, n]) => (
          <div key={k} className="flex justify-between text-subtle">
            <span>{REASON_LABEL[k] || k}</span><span>{n}</span>
          </div>
        )) : <p className="text-dim">No bounces.</p>}
        <p className="mt-3 text-dim">Opens {w.opens}, auto-replies {w.auto_replies}, opt-outs {w.unsubscribes}.</p>
      </div>
    </div>
  );
}

export default function WeeklyReports() {
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['weekly-reports'], queryFn: () => analyticsApi.weeklyReports(26) });

  const download = async () => {
    const md = await analyticsApi.weeklyReportMarkdown(26);
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach-weekly-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }
  if (error || !data) return <p className="text-subtle text-center py-12">Could not load the weekly report.</p>;

  const chart = [...data.weeks].reverse().map(w => ({
    label: fmtDate(w.week_start),
    sent: w.sent,
    replies: w.human_replies,
    reply_rate: w.cohort_reply_rate,
  }));
  const steps = ['1', '2', '3', '4'];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-subtle text-sm">
          One row per week, newest first. Weeks run Monday to Sunday (UTC). Replies are people who wrote back, not automatic responses.
        </p>
        <button onClick={download} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-line bg-card text-heading hover:bg-elevated whitespace-nowrap">
          <Download className="w-4 h-4" /> Download report
        </button>
      </div>

      <div className="bg-card rounded-lg border border-line p-6">
        <h3 className="text-lg font-semibold text-heading mb-4">Why replies are low</h3>
        <div className="space-y-3">
          {data.diagnosis.map((d, i) => {
            const { cls, Icon } = SEVERITY[d.severity] || SEVERITY.info;
            return (
              <div key={i} className={`flex gap-3 rounded-lg border p-4 ${cls}`}>
                <Icon className="w-5 h-5 mt-0.5 shrink-0 text-heading" />
                <div>
                  <p className="font-medium text-heading">{d.title}</p>
                  <p className="text-sm text-subtle mt-1">{d.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-1">Reply rate by email number</h3>
          <p className="text-xs text-dim mb-4">Replies credited to the email that came right before them.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-subtle border-b border-line"><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium text-right">Sent</th><th className="pb-2 font-medium text-right">Replies</th><th className="pb-2 font-medium text-right">Rate</th></tr></thead>
            <tbody>
              {steps.map(n => (
                <tr key={n} className="border-b border-line/50">
                  <td className="py-2 text-heading">{n === '1' ? '1st (first contact)' : n === '4' ? '4th and later' : `${n}${n === '2' ? 'nd' : n === '3' ? 'rd' : 'th'}`}</td>
                  <td className="py-2 text-right text-subtle">{(data.summary.sends_by_step[n] || 0).toLocaleString()}</td>
                  <td className="py-2 text-right text-subtle">{data.summary.replies_by_step[n] || 0}</td>
                  <td className="py-2 text-right font-medium text-heading">{data.summary.reply_rate_by_step[n]}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-1">Mailboxes right now</h3>
          <p className="text-xs text-dim mb-4">{data.summary.human_repliers} people have replied out of {data.summary.contacted.toLocaleString()} contacted ({data.summary.overall_reply_rate}%).</p>
          <div className="space-y-2 text-sm">
            {data.mailboxes.map(m => (
              <div key={m.email} className="flex items-center justify-between gap-3">
                <span className="truncate text-heading">{m.email}</span>
                <span className="text-xs text-subtle whitespace-nowrap">
                  <span className={`mr-2 px-1.5 py-0.5 rounded ${m.status === 'active' ? 'bg-green-500/15 text-green-500' : 'bg-yellow-500/15 text-yellow-500'}`}>{m.status}</span>
                  {m.sent_total.toLocaleString()} sent, {m.queued} queued
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-line p-6">
        <h3 className="text-lg font-semibold text-heading mb-4">Sends, replies and first-contact reply rate by week</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--th-chart-grid)" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
            <YAxis yAxisId="l" tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
            <YAxis yAxisId="r" orientation="right" unit="%" tick={{ fontSize: 12, fill: 'var(--th-subtle)' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar yAxisId="l" dataKey="sent" name="Sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="l" dataKey="replies" name="Replies" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="reply_rate" name="First-contact reply rate (%)" stroke="#f59e0b" strokeWidth={2} dot />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-lg border border-line p-6">
        <h3 className="text-lg font-semibold text-heading mb-4">Weekly history</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-subtle border-b border-line">
                <th className="pb-2 font-medium">Week</th>
                <th className="pb-2 font-medium text-right">Sent</th>
                <th className="pb-2 font-medium text-right">New</th>
                <th className="pb-2 font-medium text-right">Follow-ups</th>
                <th className="pb-2 font-medium text-right">Bounce</th>
                <th className="pb-2 font-medium text-right">Replies</th>
                <th className="pb-2 font-medium text-right">Per 100 sent</th>
                <th className="pb-2 font-medium text-right">First-contact rate</th>
                <th className="pb-2 font-medium text-right">Opt-outs</th>
              </tr>
            </thead>
            <tbody>
              {data.weeks.map(w => {
                const isOpen = open === w.week_start;
                return (
                  <Fragment key={w.week_start}>
                    <tr className="border-b border-line/50 cursor-pointer hover:bg-elevated" onClick={() => setOpen(isOpen ? null : w.week_start)}>
                      <td className="py-2 text-heading whitespace-nowrap">
                        {isOpen ? <ChevronDown className="inline w-4 h-4 mr-1" /> : <ChevronRight className="inline w-4 h-4 mr-1" />}
                        {fmtDate(w.week_start)} to {fmtDate(w.week_end)}
                        {w.is_current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500">in progress</span>}
                      </td>
                      <td className="py-2 text-right text-subtle">{w.sent.toLocaleString()}</td>
                      <td className="py-2 text-right text-subtle">{w.new_contacts}</td>
                      <td className="py-2 text-right text-subtle">{w.followups}</td>
                      <td className={`py-2 text-right ${w.bounce_rate > 5 ? 'text-red-500 font-medium' : 'text-subtle'}`}>{w.bounce_rate}%</td>
                      <td className="py-2 text-right text-heading font-medium">{w.human_replies}</td>
                      <td className="py-2 text-right text-subtle">{w.replies_per_100_sends}</td>
                      <td className="py-2 text-right text-subtle">{w.cohort_reply_rate}%</td>
                      <td className="py-2 text-right text-subtle">{w.unsubscribes}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={9} className="py-3"><WeekDetail w={w} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dim mt-3">
          First-contact rate is the share of people first emailed that week who have replied at any point since. Recent weeks will rise a little as late replies arrive.
        </p>
      </div>
    </div>
  );
}
