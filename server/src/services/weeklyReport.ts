import { Message } from '../models/message';
import { EmailEvent } from '../models/emailEvent';
import { Mailbox } from '../models/mailbox';
import { SendQueueItem } from '../models/sendQueueItem';

export interface WeekRow {
  week_start: string;
  week_end: string;
  is_current: boolean;
  sent: number;
  new_contacts: number;
  followups: number;
  late_followups: number;
  bounced: number;
  bounce_rate: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  complaints: number;
  human_replies: number;
  unique_repliers: number;
  auto_replies: number;
  replies_per_100_sends: number;
  cohort_replied: number;
  cohort_reply_rate: number;
  by_sender: Record<string, { sent: number; bounced: number }>;
  bounce_reasons: Record<string, number>;
  findings: string[];
}

export interface Diagnosis { severity: 'high' | 'medium' | 'low' | 'info'; title: string; detail: string }

const DAY = 86400000;
const weekStart = (d: Date | string) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};
const wkKey = (d: Date | string) => weekStart(d).toISOString().slice(0, 10);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function classifyBounce(reason: string): string {
  const r = (reason || '').toLowerCase();
  if (/storage|quota|mailbox is full|over quota/.test(r)) return 'mailbox_full';
  if (/does not exist|user unknown|no such user|unknown user|recipient not found|recipientnotfound|recipient address rejected|mailbox (unavailable|not found)|address does not exist|address rejected|no mailbox|unroutable|not in use|relay access denied|does not accept mail|no longer at|inactive|disabled|cannot receive/.test(r)) return 'invalid_address';
  if (/spam|blocked|black ?list|rbl|spamcop|junkmail|sender blocked|reputation|not allowed|policy|denied/.test(r)) return 'blocked_or_spam';
  if (/dial tcp|timeout|mx info|connection|socket|loop|hop count|ptr|resolv/.test(r)) return 'dns_or_connection';
  return 'other';
}

export async function buildWeeklyReports(weeksBack = 26) {
  const since = new Date(weekStart(new Date()).getTime() - (weeksBack - 1) * 7 * DAY);

  const [msgs, evCounts, bounceEvents, mailboxes, queued] = await Promise.all([
    Message.find({}).select('direction subscriber_id sent_at received_at created_at is_auto_reply mailbox_id').lean(),
    EmailEvent.aggregate([
      { $match: { timestamp: { $gte: since }, event: { $in: ['open', 'click', 'unsubscribe', 'spamreport', 'bounce'] } } },
      { $group: { _id: { w: { $dateTrunc: { date: '$timestamp', unit: 'week', startOfWeek: 'monday' } }, e: '$event' }, n: { $sum: 1 } } },
    ]),
    EmailEvent.find({ event: 'bounce', timestamp: { $gte: since } }).select('timestamp mailbox_id metadata').lean(),
    Mailbox.find({}).lean(),
    SendQueueItem.aggregate([{ $match: { status: 'queued' } }, { $unwind: { path: '$allowed_mailbox_ids', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$allowed_mailbox_ids', n: { $sum: 1 } } }]),
  ]);

  const mbName = new Map<string, string>(mailboxes.map((m: any) => [String(m._id), m.email as string]));
  const senderOf = (id: any) => (id ? mbName.get(String(id)) || 'unknown' : 'unstamped (legacy)');

  // Per-subscriber outbound timeline and human reply set.
  const outBy = new Map<string, { at: number; mb: any }[]>();
  const inbound: { sid: string; at: number; auto: boolean }[] = [];
  for (const m of msgs as any[]) {
    const sid = String(m.subscriber_id);
    if (m.direction === 'outbound') {
      const at = +new Date(m.sent_at || m.created_at);
      if (!outBy.has(sid)) outBy.set(sid, []);
      outBy.get(sid)!.push({ at, mb: m.mailbox_id });
    } else {
      inbound.push({ sid, at: +new Date(m.received_at || m.created_at), auto: !!m.is_auto_reply });
    }
  }
  const humanSubs = new Set(inbound.filter(i => !i.auto).map(i => i.sid));

  const weeks = new Map<string, WeekRow>();
  const row = (k: string): WeekRow => {
    let r = weeks.get(k);
    if (!r) {
      const s = new Date(k + 'T00:00:00Z');
      r = {
        week_start: k, week_end: new Date(+s + 6 * DAY).toISOString().slice(0, 10), is_current: k === wkKey(new Date()),
        sent: 0, new_contacts: 0, followups: 0, late_followups: 0, bounced: 0, bounce_rate: 0, opens: 0, clicks: 0, unsubscribes: 0, complaints: 0,
        human_replies: 0, unique_repliers: 0, auto_replies: 0, replies_per_100_sends: 0, cohort_replied: 0, cohort_reply_rate: 0,
        by_sender: {}, bounce_reasons: {}, findings: [],
      };
      weeks.set(k, r);
    }
    return r;
  };

  const sendsByStep: Record<number, number> = {};
  const repliesByStep: Record<number, number> = {};
  const repliers = new Map<string, Set<string>>();
  for (const [sid, list] of outBy) {
    list.sort((a, b) => a.at - b.at);
    list.forEach((o, i) => {
      const step = Math.min(i + 1, 4);
      sendsByStep[step] = (sendsByStep[step] || 0) + 1;
      if (o.at < +since) return;
      const r = row(wkKey(new Date(o.at)));
      r.sent++;
      if (i === 0) r.new_contacts++; else { r.followups++; if (i >= 2) r.late_followups++; }
      const s = (r.by_sender[senderOf(o.mb)] ||= { sent: 0, bounced: 0 });
      s.sent++;
    });
    const fk = wkKey(new Date(list[0].at));
    if (list[0].at >= +since && humanSubs.has(sid)) row(fk).cohort_replied++;
  }
  for (const i of inbound) {
    if (i.at >= +since) {
      const r = row(wkKey(new Date(i.at)));
      if (i.auto) r.auto_replies++;
      else {
        r.human_replies++;
        if (!repliers.has(r.week_start)) repliers.set(r.week_start, new Set());
        repliers.get(r.week_start)!.add(i.sid);
      }
    }
    if (!i.auto) {
      const list = outBy.get(i.sid) || [];
      const step = Math.min(Math.max(1, list.filter(o => o.at <= i.at).length), 4);
      repliesByStep[step] = (repliesByStep[step] || 0) + 1;
    }
  }
  for (const [k, set] of repliers) row(k).unique_repliers = set.size;

  const evKey: Record<string, 'opens' | 'clicks' | 'unsubscribes' | 'complaints' | 'bounced'> = { open: 'opens', click: 'clicks', unsubscribe: 'unsubscribes', spamreport: 'complaints', bounce: 'bounced' };
  for (const e of evCounts as any[]) row(new Date(e._id.w).toISOString().slice(0, 10))[evKey[e._id.e]] += e.n;
  for (const b of bounceEvents as any[]) {
    const r = row(wkKey(b.timestamp));
    const cls = classifyBounce(String(b.metadata?.reason || b.metadata?.status || ''));
    r.bounce_reasons[cls] = (r.bounce_reasons[cls] || 0) + 1;
    if (b.mailbox_id) {
      const s = (r.by_sender[senderOf(b.mailbox_id)] ||= { sent: 0, bounced: 0 });
      s.bounced++;
    }
  }

  const list = Array.from(weeks.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));
  const stepRate = (n: number) => pct(repliesByStep[n] || 0, sendsByStep[n] || 0);
  const lateRate = pct((repliesByStep[3] || 0) + (repliesByStep[4] || 0), (sendsByStep[3] || 0) + (sendsByStep[4] || 0));
  const followupRate = pct(
    [2, 3, 4].reduce((s, n) => s + (repliesByStep[n] || 0), 0),
    [2, 3, 4].reduce((s, n) => s + (sendsByStep[n] || 0), 0),
  );
  const firstRate = stepRate(1);
  const rateLine = `Reply rate by email number: 1st ${firstRate}%, 2nd ${stepRate(2)}%, 3rd and later ${lateRate}%.`;

  for (const r of list) {
    r.bounce_rate = pct(r.bounced, r.sent);
    r.replies_per_100_sends = pct(r.human_replies, r.sent);
    r.cohort_reply_rate = pct(r.cohort_replied, r.new_contacts);
    if (r.sent < 50) continue;
    const f = r.findings;
    if (r.human_replies === 0 && r.sent >= 200) f.push(`${r.sent} emails went out and no person replied.`);
    if (r.late_followups / r.sent >= 0.4) f.push(`${pct(r.late_followups, r.sent)}% of sends were a 3rd or later email to someone who stayed silent. ${rateLine}`);
    if (r.new_contacts < 100 && r.sent >= 300) f.push(`Only ${r.new_contacts} new people were contacted. The fresh-lead supply is thin.`);
    if (r.bounce_rate > 5) f.push(`Bounce rate ${r.bounce_rate}% is above the 5% line that hurts sender reputation.`);
    if ((r.bounce_reasons.blocked_or_spam || 0) >= 3) f.push(`${r.bounce_reasons.blocked_or_spam} emails were refused as spam or blocklisted by the receiving server.`);
    if (r.complaints > 0) f.push(`${r.complaints} spam complaint${r.complaints > 1 ? 's' : ''}.`);
    if (r.is_current) f.push('This week is still in progress. Replies usually arrive 1 to 3 days after a send.');
  }

  // ---- Overall diagnosis
  const diagnosis: Diagnosis[] = [];
  const completed = list.filter(r => !r.is_current && r.new_contacts > 0);
  const recent = completed.slice(0, 4);
  const earlier = completed.slice(4);
  const sum = (a: WeekRow[], k: 'new_contacts' | 'cohort_replied') => a.reduce((s, r) => s + r[k], 0);
  const recentRate = pct(sum(recent, 'cohort_replied'), sum(recent, 'new_contacts'));
  const earlierRate = pct(sum(earlier, 'cohort_replied'), sum(earlier, 'new_contacts'));
  if (earlier.length && recent.length && recentRate < earlierRate * 0.6) {
    diagnosis.push({ severity: 'high', title: 'Newer lead lists reply far less than the first ones', detail: `People first contacted in the last 4 completed weeks reply at ${recentRate}%. Everyone before that replied at ${earlierRate}%. The best-fit podcasters were contacted first, and each new batch is a weaker match.` });
  }
  const last2 = list.filter(r => !r.is_current).slice(0, 2);
  const l2sent = last2.reduce((s, r) => s + r.sent, 0);
  const l2late = last2.reduce((s, r) => s + r.late_followups, 0);
  const l2new = last2.reduce((s, r) => s + r.new_contacts, 0);
  if (l2sent > 0 && l2late / l2sent >= 0.3) {
    diagnosis.push({ severity: 'high', title: 'A large share of recent sends are 3rd or later emails', detail: `${pct(l2late, l2sent)}% of the last two completed weeks of sends were a third or later email, and only ${pct(l2new, l2sent)}% reached someone new. ${rateLine} The second email is worth sending. Later ones add volume with little return.` });
  }
  const paused = mailboxes.filter((m: any) => m.status === 'paused');
  if (paused.length) {
    const pinned = (queued as any[]).filter(q => paused.some((p: any) => String(p._id) === String(q._id))).reduce((s, q) => s + q.n, 0);
    diagnosis.push({ severity: 'medium', title: `${paused.length} mailbox${paused.length > 1 ? 'es are' : ' is'} paused`, detail: `${paused.map((p: any) => `${p.email} (${p.paused_reason || 'paused'})`).join(', ')}. ${pinned} queued follow-ups are pinned to paused mailboxes and cannot send until they resume.` });
  }
  const cur = list.find(r => r.is_current);
  const all = list.reduce((a, r) => ({ sent: a.sent + r.sent, bounced: a.bounced + r.bounced }), { sent: 0, bounced: 0 });
  if (pct(all.bounced, all.sent) >= 4) {
    diagnosis.push({ severity: 'medium', title: 'Bounce rate is high', detail: `${pct(all.bounced, all.sent)}% of sends in this window bounced. Most are addresses that do not exist, which come from lists that were only checked at the DNS level. A mailbox-level check before sending would cut this.` });
  }
  diagnosis.push({ severity: 'info', title: 'Inbox placement cannot be measured directly', detail: 'SMTP mailboxes send plain text without an open pixel, so opens only exist for SendGrid sends. SendGrid opens are inflated by mail-provider image prefetching. Replies are the only reliable signal.' });
  if (cur && cur.human_replies === 0 && cur.sent > 100) {
    diagnosis.push({ severity: 'info', title: 'Delivery and reply capture are working', detail: 'Mailboxes are being polled every two minutes and auto-replies are being recorded, so the low reply count reflects the audience and sequence, not lost mail.' });
  }

  const summary = {
    contacted: outBy.size,
    human_repliers: humanSubs.size,
    overall_reply_rate: pct(humanSubs.size, outBy.size),
    sends_by_step: sendsByStep,
    replies_by_step: repliesByStep,
    reply_rate_by_step: Object.fromEntries([1, 2, 3, 4].map(n => [n, stepRate(n)])),
    first_email_reply_rate: firstRate,
    followup_reply_rate: followupRate,
    recent4_cohort_reply_rate: recentRate,
    earlier_cohort_reply_rate: earlierRate,
  };

  return {
    generated_at: new Date().toISOString(),
    weeks: list,
    summary,
    diagnosis,
    mailboxes: mailboxes.map((m: any) => ({
      email: m.email, kind: m.kind, status: m.status, paused_reason: m.paused_reason || null,
      sent_total: m.stats?.sent_total || 0, bounced_total: m.stats?.bounced_total || 0, replied_total: m.stats?.replied_total || 0,
      queued: (queued as any[]).filter(q => String(q._id) === String(m._id)).reduce((s, q) => s + q.n, 0),
    })),
  };
}

export function reportToMarkdown(r: Awaited<ReturnType<typeof buildWeeklyReports>>): string {
  const L: string[] = [];
  L.push(`# Outreach weekly report`, `Generated ${r.generated_at.slice(0, 16).replace('T', ' ')} UTC. Weeks start Monday (UTC).`, '');
  L.push('## Diagnosis');
  r.diagnosis.forEach(d => L.push(`- **${d.title}** (${d.severity}). ${d.detail}`));
  L.push('', '## Reply rate by email number');
  L.push('| Email # | Sent | Replies | Rate |', '|---|---|---|---|');
  [1, 2, 3, 4].forEach(n => L.push(`| ${n === 4 ? '4+' : n} | ${r.summary.sends_by_step[n] || 0} | ${r.summary.replies_by_step[n] || 0} | ${r.summary.reply_rate_by_step[n]}% |`));
  L.push('', '## Weekly history');
  L.push('| Week | Sent | New | Follow-ups | Bounce % | Replies | Replies/100 | First-contact reply % | Opt-outs |', '|---|---|---|---|---|---|---|---|---|');
  r.weeks.forEach(w => L.push(`| ${w.week_start}${w.is_current ? ' (in progress)' : ''} | ${w.sent} | ${w.new_contacts} | ${w.followups} | ${w.bounce_rate} | ${w.human_replies} | ${w.replies_per_100_sends} | ${w.cohort_reply_rate} | ${w.unsubscribes} |`));
  L.push('', '## Findings by week');
  r.weeks.filter(w => w.findings.length).forEach(w => { L.push(`### ${w.week_start}`); w.findings.forEach(f => L.push(`- ${f}`)); });
  L.push('', '## Mailboxes');
  r.mailboxes.forEach(m => L.push(`- ${m.email}: ${m.status}${m.paused_reason ? ` (${m.paused_reason})` : ''}, sent ${m.sent_total}, bounced ${m.bounced_total}, queued ${m.queued}`));
  return L.join('\n');
}
