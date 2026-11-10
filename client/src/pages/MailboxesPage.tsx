import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pause, Play, RefreshCw, Trash2, Pencil, PlugZap, AlertTriangle, Mail, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { mailboxApi } from '../api';
import type { Mailbox } from '../types';

const inputClass = 'px-3 py-2 text-sm rounded-md border border-line bg-field text-body focus:outline-none focus:ring-2 focus:ring-blue-500';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type FormState = {
  email: string; display_name: string; password: string; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number;
  daily_cap: number; ramp: string; start_hour: number; end_hour: number; tz: string; days: number[]; gap_min_sec: number; gap_max_sec: number;
  include_in_pool: boolean; drop_footer: boolean; bounces_per_day: number; complaints_per_day: number;
};

const emptyForm = (): FormState => ({
  email: '', display_name: '', password: '', smtp_host: '', smtp_port: 465, imap_host: '', imap_port: 993,
  daily_cap: 30, ramp: '5,5,8,8,12,12,16,16,20,20,25,25,30', start_hour: 9, end_hour: 18, tz: 'America/New_York', days: [0, 1, 2, 3, 4, 5, 6],
  gap_min_sec: 150, gap_max_sec: 420, include_in_pool: true, drop_footer: true, bounces_per_day: 3, complaints_per_day: 1,
});

function formFromMailbox(m: Mailbox): FormState {
  return {
    email: m.email, display_name: m.display_name, password: '', smtp_host: m.smtp_host, smtp_port: m.smtp_port, imap_host: m.imap_host, imap_port: m.imap_port,
    daily_cap: m.daily_cap, ramp: (m.ramp || []).join(','), start_hour: m.send_window?.start_hour ?? 9, end_hour: m.send_window?.end_hour ?? 18,
    tz: m.send_window?.tz || 'America/New_York', days: m.send_window?.days?.length ? m.send_window.days : [0, 1, 2, 3, 4, 5, 6],
    gap_min_sec: m.gap_min_sec, gap_max_sec: m.gap_max_sec, include_in_pool: m.include_in_pool, drop_footer: m.drop_footer,
    bounces_per_day: m.auto_pause?.bounces_per_day ?? 3, complaints_per_day: m.auto_pause?.complaints_per_day ?? 1,
  };
}

function payloadFromForm(f: FormState) {
  return {
    email: f.email, display_name: f.display_name, password: f.password || undefined, smtp_host: f.smtp_host, smtp_port: Number(f.smtp_port),
    imap_host: f.imap_host, imap_port: Number(f.imap_port), daily_cap: Number(f.daily_cap),
    ramp: f.ramp.split(',').map(s => Number(s.trim())).filter(n => n > 0),
    send_window: { tz: f.tz, start_hour: Number(f.start_hour), end_hour: Number(f.end_hour), days: f.days },
    gap_min_sec: Number(f.gap_min_sec), gap_max_sec: Number(f.gap_max_sec), include_in_pool: f.include_in_pool, drop_footer: f.drop_footer,
    auto_pause: { bounces_per_day: Number(f.bounces_per_day), complaints_per_day: Number(f.complaints_per_day) },
  };
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function MailboxesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Mailbox | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selected, setSelected] = useState<string | null>(null);

  const { data: boxes, isLoading } = useQuery({ queryKey: ['mailboxes'], queryFn: mailboxApi.list, refetchInterval: 30_000 });
  const { data: pool } = useQuery({ queryKey: ['mailbox-pool'], queryFn: mailboxApi.poolSummary, refetchInterval: 30_000 });
  const { data: activity } = useQuery({
    queryKey: ['mailbox-messages', selected], queryFn: () => mailboxApi.messages(selected as string), enabled: !!selected, refetchInterval: 30_000,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['mailboxes'] }); qc.invalidateQueries({ queryKey: ['mailbox-pool'] }); };
  const saveMut = useMutation({
    mutationFn: () => (editing ? mailboxApi.update(editing._id, payloadFromForm(form)) : mailboxApi.create(payloadFromForm(form))),
    onSuccess: (m: any) => {
      invalidate(); setShowForm(false); setEditing(null); setForm(emptyForm());
      if (m?.test) toast[m.test.ok ? 'success' : 'error'](`SMTP: ${m.test.smtp} · IMAP: ${m.test.imap}`);
      else toast.success('Mailbox saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save mailbox'),
  });
  const act = (fn: () => Promise<any>, ok: string) => useMutation({
    mutationFn: fn, onSuccess: (r: any) => { invalidate(); toast.success(typeof r?.smtp === 'string' ? `SMTP: ${r.smtp} · IMAP: ${r.imap}` : ok); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<any>, ok: string) => {
    setBusyId(id);
    try { const r: any = await fn(); invalidate(); qc.invalidateQueries({ queryKey: ['mailbox-messages'] }); toast.success(typeof r?.smtp === 'string' ? `SMTP: ${r.smtp} · IMAP: ${r.imap}` : typeof r?.fetched === 'number' ? `${r.fetched} new: ${r.replies} replies, ${r.bounces} bounces` : ok); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setBusyId(null); }
  };
  const tickMut = act(() => mailboxApi.poolTick({ ignore_window: true }), 'Pool tick ran');

  const startEdit = (m: Mailbox) => { setEditing(m); setForm(formFromMailbox(m)); setShowForm(true); };
  const totalAllowance = (boxes || []).filter(b => b.status === 'active').reduce((s, b) => s + b.allowance_today, 0);
  const totalSent = (boxes || []).reduce((s, b) => s + b.sent_today, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Mailboxes</h1>
          <p className="text-subtle mt-1">Sender pool: SendGrid plus your own mailboxes, with warmup, daily caps, pacing and auto-pause.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => tickMut.mutate()} disabled={tickMut.isPending} title="Send the next queued email from each eligible sender now, ignoring the send window"
            className="inline-flex items-center px-3 py-2 text-sm border border-line rounded-md hover:bg-elevated disabled:opacity-50">
            {tickMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />} Send next now
          </button>
          <button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(s => !s); }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Add mailbox
          </button>
        </div>
      </div>

      {(boxes || []).filter(b => b.status === 'paused' && b.paused_reason?.startsWith('Auto-paused')).map(b => (
        <div key={b._id} className="mb-4 flex items-center gap-3 rounded-lg border border-danger-500/40 bg-danger-500/10 px-4 py-3 text-sm text-heading">
          <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0" />
          <span><strong>{b.email}</strong> was {b.paused_reason?.toLowerCase()}. It will not send until you resume it.</span>
          <button onClick={() => run(b._id, () => mailboxApi.resume(b._id), 'Resumed')} className="ml-auto px-3 py-1 text-xs border border-line rounded-md hover:bg-elevated">Resume</button>
        </div>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          ['Senders active', `${(boxes || []).filter(b => b.status === 'active').length}/${(boxes || []).length}`],
          ['Sent today', `${totalSent} / ${totalAllowance}`],
          ['Queued', pool?.status?.queued ?? 0],
          ['Pool sent', pool?.status?.sent ?? 0],
          ['Failed / skipped', `${pool?.status?.failed ?? 0} / ${pool?.status?.skipped ?? 0}`],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-card rounded-lg border border-line p-4">
            <div className="text-xs text-dim uppercase tracking-wider">{k}</div>
            <div className="text-xl font-semibold text-heading mt-1">{v as any}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-card rounded-lg border border-line p-6 mb-6">
          <h2 className="text-sm font-semibold text-heading mb-4">{editing ? `Edit ${editing.email}` : 'Add an SMTP/IMAP mailbox'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {editing?.kind !== 'sendgrid' && (<>
              <label className="text-xs text-dim">Email<input disabled={!!editing} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`w-full mt-1 ${inputClass}`} placeholder="name@yourdomain.com" /></label>
              <label className="text-xs text-dim">Display name<input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className={`w-full mt-1 ${inputClass}`} /></label>
              <label className="text-xs text-dim">Password{editing ? ' (leave blank to keep)' : ''}<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`w-full mt-1 ${inputClass}`} /></label>
              <label className="text-xs text-dim">SMTP host<input value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} className={`w-full mt-1 ${inputClass}`} placeholder="smtp.yourprovider.com" /></label>
              <label className="text-xs text-dim">SMTP port (SSL)<input type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
              <label className="text-xs text-dim">IMAP host<input value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} className={`w-full mt-1 ${inputClass}`} placeholder="imap.yourprovider.com" /></label>
              <label className="text-xs text-dim">IMAP port<input type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            </>)}
            <label className="text-xs text-dim">Daily cap (hard max)<input type="number" value={form.daily_cap} onChange={e => setForm({ ...form, daily_cap: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim md:col-span-2">Warmup ramp (per day, comma separated; blank = no ramp)<input value={form.ramp} onChange={e => setForm({ ...form, ramp: e.target.value })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim">Window start hour<input type="number" min={0} max={23} value={form.start_hour} onChange={e => setForm({ ...form, start_hour: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim">Window end hour<input type="number" min={1} max={24} value={form.end_hour} onChange={e => setForm({ ...form, end_hour: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim">Timezone<input value={form.tz} onChange={e => setForm({ ...form, tz: e.target.value })} className={`w-full mt-1 ${inputClass}`} /></label>
            <div className="text-xs text-dim md:col-span-3">Send days
              <div className="flex gap-2 mt-1">{DAY_LABELS.map((d, i) => (
                <button key={d} type="button" onClick={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter(x => x !== i) : [...form.days, i].sort() })}
                  className={`px-2.5 py-1 rounded border text-xs ${form.days.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'border-line text-subtle hover:bg-elevated'}`}>{d}</button>
              ))}</div>
            </div>
            <label className="text-xs text-dim">Min gap between sends (sec)<input type="number" value={form.gap_min_sec} onChange={e => setForm({ ...form, gap_min_sec: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim">Max gap (sec)<input type="number" value={form.gap_max_sec} onChange={e => setForm({ ...form, gap_max_sec: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <div />
            <label className="text-xs text-dim">Auto-pause after N bounces/day<input type="number" value={form.bounces_per_day} onChange={e => setForm({ ...form, bounces_per_day: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-dim">Auto-pause after N complaints/day<input type="number" value={form.complaints_per_day} onChange={e => setForm({ ...form, complaints_per_day: Number(e.target.value) })} className={`w-full mt-1 ${inputClass}`} /></label>
            <div className="flex flex-col gap-2 text-sm text-body pt-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.include_in_pool} onChange={e => setForm({ ...form, include_in_pool: e.target.checked })} /> Include in pool rotation</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.drop_footer} onChange={e => setForm({ ...form, drop_footer: e.target.checked })} /> No unsubscribe footer (personal-style email)</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm border border-line rounded-md hover:bg-elevated">Cancel</button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || (!editing && (!form.email || !form.password))}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {editing ? 'Save changes' : 'Add and test'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg border border-line overflow-hidden mb-6">
        {isLoading ? <div className="p-6 text-subtle text-sm">Loading…</div> : (
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated">
              <tr>{['Sender', 'Status', 'Warmup', 'Today', 'Queued', 'Bounces', 'Replies', 'Opt-outs', 'Last sent', 'Last poll', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(boxes || []).map(b => {
                const pct = b.allowance_today ? Math.min(100, Math.round((b.sent_today / b.allowance_today) * 100)) : 0;
                return (
                  <tr key={b._id} onClick={() => setSelected(b._id)} className={`hover:bg-elevated/50 cursor-pointer ${selected === b._id ? 'bg-elevated/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className={`w-4 h-4 ${b.kind === 'sendgrid' ? 'text-primary-500' : 'text-emerald-500'}`} />
                        <div>
                          <div className="text-sm font-medium text-heading">{b.email}</div>
                          <div className="text-xs text-dim">{b.display_name} · <span className="uppercase">{b.kind}</span>{b.include_in_pool ? '' : ' · not in pool'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${b.status === 'active' ? 'bg-success-500/15 text-success-500' : 'bg-danger-500/15 text-danger-500'}`}>{b.status}</span>
                      {b.status === 'active' && !b.in_window && <div className="text-[11px] text-dim mt-1">outside window</div>}
                      {b.paused_reason && <div className="text-[11px] text-danger-500 mt-1 max-w-[180px]">{b.paused_reason}</div>}
                      {b.last_error && <div className="text-[11px] text-warning-500 mt-1 max-w-[220px] truncate" title={b.last_error}>{b.last_error}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-body">day {b.warmup_day + 1}<div className="text-xs text-dim">limit {b.allowance_today}/day · cap {b.daily_cap}</div></td>
                    <td className="px-4 py-3 text-sm text-body w-40">
                      <div className="flex items-center justify-between text-xs"><span>{b.sent_today} / {b.allowance_today}</span><span className="text-dim">{pct}%</span></div>
                      <div className="h-1.5 bg-elevated rounded mt-1"><div className="h-1.5 bg-emerald-500 rounded" style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td className="px-4 py-3 text-sm text-body">{b.queued}</td>
                    <td className="px-4 py-3 text-sm text-body">{b.bounces_today} <span className="text-dim text-xs">today · {b.stats?.bounced_total ?? 0} total</span></td>
                    <td className="px-4 py-3 text-sm text-body">{b.stats?.replied_total ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-body">{b.stats?.opted_out_total ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-subtle">{fmt(b.last_sent_at)}</td>
                    <td className="px-4 py-3 text-xs text-subtle">{b.kind === 'smtp' ? fmt(b.imap_last_polled_at) : 'webhook'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button title="Test connection" disabled={busyId === b._id} onClick={() => run(b._id, () => mailboxApi.test(b._id), 'OK')} className="p-1.5 rounded hover:bg-elevated"><PlugZap className="w-4 h-4" /></button>
                        {b.kind === 'smtp' && <button title="Poll inbox now" disabled={busyId === b._id} onClick={() => run(b._id, () => mailboxApi.poll(b._id), 'Polled')} className="p-1.5 rounded hover:bg-elevated"><RefreshCw className={`w-4 h-4 ${busyId === b._id ? 'animate-spin' : ''}`} /></button>}
                        {b.status === 'active'
                          ? <button title="Pause" onClick={() => run(b._id, () => mailboxApi.pause(b._id), 'Paused')} className="p-1.5 rounded hover:bg-elevated"><Pause className="w-4 h-4" /></button>
                          : <button title="Resume" onClick={() => run(b._id, () => mailboxApi.resume(b._id), 'Resumed')} className="p-1.5 rounded hover:bg-elevated text-success-500"><Play className="w-4 h-4" /></button>}
                        <button title="Edit" onClick={() => startEdit(b)} className="p-1.5 rounded hover:bg-elevated"><Pencil className="w-4 h-4" /></button>
                        {b.kind === 'smtp' && <button title="Delete" onClick={() => { if (confirm(`Delete ${b.email}?`)) run(b._id, () => mailboxApi.delete(b._id), 'Deleted'); }} className="p-1.5 rounded hover:bg-elevated text-danger-500"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pool?.sends?.length ? (
        <div className="bg-card rounded-lg border border-line p-4 mb-6">
          <h2 className="text-sm font-semibold text-heading mb-3">Pool sends</h2>
          <div className="space-y-2">
            {pool.sends.map(s => {
              const q = s.queue || {}; const total = Object.values(q).reduce((a: number, b: any) => a + Number(b || 0), 0) || 1;
              return (
                <div key={s._id} className="text-sm">
                  <div className="flex justify-between"><span className="text-body truncate">{s.subject}</span><span className="text-xs text-dim">{s.status} · {q.sent || 0} sent · {q.queued || 0} queued{q.failed ? ` · ${q.failed} failed` : ''}{q.skipped ? ` · ${q.skipped} skipped` : ''}</span></div>
                  <div className="h-1.5 bg-elevated rounded mt-1 flex overflow-hidden">
                    <div className="h-1.5 bg-emerald-500" style={{ width: `${((q.sent || 0) / total) * 100}%` }} />
                    <div className="h-1.5 bg-danger-500" style={{ width: `${((q.failed || 0) / total) * 100}%` }} />
                    <div className="h-1.5 bg-warning-500" style={{ width: `${((q.skipped || 0) / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected && (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <div className="px-4 py-3 border-b border-line text-sm font-semibold text-heading">Recent activity · {(boxes || []).find(b => b._id === selected)?.email}</div>
          {!activity?.length ? <div className="p-4 text-sm text-subtle">No messages yet.</div> : (
            <table className="min-w-full divide-y divide-line">
              <tbody className="divide-y divide-line">
                {activity.map(m => (
                  <tr key={m._id} className="text-sm">
                    <td className="px-4 py-2 w-24"><span className={`text-[10px] font-semibold uppercase ${m.direction === 'outbound' ? 'text-emerald-500' : 'text-primary-500'}`}>{m.direction === 'outbound' ? 'Sent' : 'Received'}</span></td>
                    <td className="px-4 py-2 text-body">{m.subscriber?.email || m.to_address}</td>
                    <td className="px-4 py-2 text-subtle truncate max-w-[320px]">{m.subject_override}</td>
                    <td className="px-4 py-2 text-xs text-dim">{m.status_summary}{m.is_auto_reply ? ' · auto-reply' : ''}</td>
                    <td className="px-4 py-2 text-xs text-dim">{fmt(m.sent_at || m.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
