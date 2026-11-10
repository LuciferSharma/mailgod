import nodemailer, { Transporter } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import mongoose from 'mongoose';
import { Mailbox, IMailbox, DEFAULT_RAMP } from '../models/mailbox';
import { Message } from '../models/message';
import { EmailEvent } from '../models/emailEvent';
import { SendQueueItem } from '../models/sendQueueItem';
import { getSetting } from '../models/settings';
import { config } from '../config';
import { decryptSecret } from './mailboxCrypto';

// ---------------------------------------------------------------------------
// Seeding / lookup
// ---------------------------------------------------------------------------

/** The platform's SendGrid sender is always present as pool member #1. */
export async function ensureSendgridMailbox(): Promise<IMailbox> {
  const email = ((await getSetting('from_email', config.fromEmail)) as string).toLowerCase();
  const name = (await getSetting('from_name', config.fromName)) as string;
  let mb = await Mailbox.findOne({ kind: 'sendgrid' });
  if (!mb) {
    mb = await Mailbox.create({
      kind: 'sendgrid',
      email,
      display_name: name,
      domain: email.split('@')[1] || '',
      status: 'active',
      include_in_pool: true,
      drop_footer: false,
      daily_cap: 100,
      ramp: [],
      warmup_started_at: new Date(),
      gap_min_sec: 60,
      gap_max_sec: 120,
      auto_pause: { bounces_per_day: 10, complaints_per_day: 1 },
    });
    console.log('[mailbox] seeded SendGrid sender', email);
  } else if (mb.email !== email || mb.display_name !== name) {
    mb.email = email;
    mb.display_name = name;
    mb.domain = email.split('@')[1] || '';
    await mb.save();
  }
  return mb;
}

let _defaultCache: { at: number; mb: IMailbox | null } = { at: 0, mb: null };
export async function getDefaultMailbox(): Promise<IMailbox | null> {
  if (Date.now() - _defaultCache.at < 30_000 && _defaultCache.mb) return _defaultCache.mb;
  const mb = await Mailbox.findOne({ kind: 'sendgrid' });
  _defaultCache = { at: Date.now(), mb };
  return mb;
}

export async function allMailboxEmails(): Promise<Set<string>> {
  const rows = await Mailbox.find({}).select('email').lean();
  return new Set(rows.map(r => r.email.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Time helpers (mailbox-local day/hour)
// ---------------------------------------------------------------------------

function tzParts(date: Date, tz: string): { hour: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { hour: Number(parts.hour) % 24, weekday: wd, ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

/** UTC instant of local midnight (start of "today") in the mailbox timezone. */
export function startOfLocalDay(tz: string, now = new Date()): Date {
  const { ymd } = tzParts(now, tz);
  // Walk back from now until the local date changes; cheap and DST-safe.
  let t = new Date(now.getTime());
  t.setUTCMinutes(0, 0, 0);
  while (tzParts(t, tz).ymd === ymd) t = new Date(t.getTime() - 3600_000);
  t = new Date(t.getTime() + 3600_000);
  // t is now the first whole hour of the local day; back off sub-hour drift
  while (tzParts(new Date(t.getTime() - 60_000), tz).ymd === ymd) t = new Date(t.getTime() - 60_000);
  return t;
}

export function inSendWindow(mb: IMailbox, now = new Date()): boolean {
  const w = mb.send_window || ({} as any);
  const { hour, weekday } = tzParts(now, w.tz || 'America/New_York');
  const days: number[] = w.days && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(weekday)) return false;
  return hour >= (w.start_hour ?? 9) && hour < (w.end_hour ?? 18);
}

// ---------------------------------------------------------------------------
// Allowance / counters
// ---------------------------------------------------------------------------

export function warmupDay(mb: IMailbox, now = new Date()): number {
  if (!mb.warmup_started_at) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(mb.warmup_started_at).getTime()) / 86_400_000));
}

export function allowanceToday(mb: IMailbox, now = new Date()): number {
  let cap = mb.daily_cap ?? 30;
  const ramp = mb.ramp && mb.ramp.length ? mb.ramp : (mb.kind === 'smtp' ? DEFAULT_RAMP : []);
  if (ramp.length) {
    const d = warmupDay(mb, now);
    cap = Math.min(cap, ramp[Math.min(d, ramp.length - 1)]);
  }
  return cap;
}

export async function sentToday(mb: IMailbox, now = new Date()): Promise<number> {
  const since = startOfLocalDay(mb.send_window?.tz || 'America/New_York', now);
  return Message.countDocuments({ mailbox_id: mb._id, direction: 'outbound', sent_at: { $gte: since } });
}

export async function eventsToday(mb: IMailbox, event: 'bounce' | 'spamreport', now = new Date()): Promise<number> {
  const since = startOfLocalDay(mb.send_window?.tz || 'America/New_York', now);
  return EmailEvent.countDocuments({ mailbox_id: mb._id, event, timestamp: { $gte: since } });
}

export async function queuedFor(mb: IMailbox): Promise<number> {
  return SendQueueItem.countDocuments({
    status: 'queued',
    $or: [{ allowed_mailbox_ids: { $size: 0 } }, { allowed_mailbox_ids: mb._id }],
  });
}

/** Pause the mailbox if today's bounces/complaints crossed its thresholds. Returns true if paused. */
export async function checkAutoPause(mb: IMailbox): Promise<boolean> {
  if (mb.status !== 'active') return mb.status === 'paused';
  const [b, c] = await Promise.all([eventsToday(mb, 'bounce'), eventsToday(mb, 'spamreport')]);
  const limB = mb.auto_pause?.bounces_per_day ?? 3;
  const limC = mb.auto_pause?.complaints_per_day ?? 1;
  let reason: string | null = null;
  if (limC > 0 && c >= limC) reason = `${c} spam complaint${c !== 1 ? 's' : ''} today`;
  else if (limB > 0 && b >= limB) reason = `${b} bounces today`;
  if (!reason) return false;
  await Mailbox.updateOne({ _id: mb._id }, { $set: { status: 'paused', paused_reason: `Auto-paused: ${reason}` } });
  console.warn(`[mailbox] auto-paused ${mb.email}: ${reason}`);
  return true;
}

/** Lift an auto-pause once the daily bounce/complaint counters have reset. Manual pauses are left alone. */
export async function autoResumeMailboxes(): Promise<number> {
  const paused = await Mailbox.find({ status: 'paused', paused_reason: /^Auto-paused/ });
  let resumed = 0;
  for (const mb of paused) {
    const [b, c] = await Promise.all([eventsToday(mb, 'bounce'), eventsToday(mb, 'spamreport')]);
    const limB = mb.auto_pause?.bounces_per_day ?? 3;
    const limC = mb.auto_pause?.complaints_per_day ?? 1;
    if ((limB > 0 && b >= limB) || (limC > 0 && c >= limC)) continue;
    await Mailbox.updateOne({ _id: mb._id }, { $set: { status: 'active', paused_reason: null } });
    console.log(`[mailbox] auto-resumed ${mb.email}`);
    resumed++;
  }
  return resumed;
}

export async function mailboxSummary(mb: IMailbox) {
  const now = new Date();
  const [sent, queued, bounces, complaints] = await Promise.all([
    sentToday(mb, now), queuedFor(mb), eventsToday(mb, 'bounce', now), eventsToday(mb, 'spamreport', now),
  ]);
  const obj: any = mb.toObject ? mb.toObject() : { ...mb };
  delete obj.password_enc;
  obj.has_password = !!mb.password_enc;
  obj.warmup_day = warmupDay(mb, now);
  obj.allowance_today = allowanceToday(mb, now);
  obj.sent_today = sent;
  obj.queued = queued;
  obj.bounces_today = bounces;
  obj.complaints_today = complaints;
  obj.in_window = inSendWindow(mb, now);
  return obj;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const transports = new Map<string, { key: string; t: Transporter }>();

export function getTransport(mb: IMailbox): Transporter {
  const id = (mb._id as mongoose.Types.ObjectId).toString();
  const key = `${mb.smtp_host}:${mb.smtp_port}:${mb.email}:${mb.password_enc.slice(-12)}`;
  const cached = transports.get(id);
  if (cached && cached.key === key) return cached.t;
  const t = nodemailer.createTransport({
    host: mb.smtp_host,
    port: mb.smtp_port,
    secure: mb.smtp_secure !== false,
    auth: { user: mb.email, pass: decryptSecret(mb.password_enc) },
    pool: true,
    maxConnections: 1,
    maxMessages: 20,
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
  });
  transports.set(id, { key, t });
  return t;
}

export function imapClient(mb: IMailbox): ImapFlow {
  return new ImapFlow({
    host: mb.imap_host,
    port: mb.imap_port,
    secure: true,
    auth: { user: mb.email, pass: decryptSecret(mb.password_enc) },
    logger: false,
    emitLogs: false,
  });
}

export async function testMailbox(mb: IMailbox): Promise<{ smtp: string; imap: string; ok: boolean }> {
  if (mb.kind === 'sendgrid') {
    return { smtp: config.sendgridApiKey ? 'SendGrid API key configured' : 'SendGrid API key missing', imap: 'n/a', ok: !!config.sendgridApiKey };
  }
  let smtp = 'ok', imap = 'ok';
  try {
    await getTransport(mb).verify();
  } catch (e: any) {
    smtp = `FAIL: ${e.message}`;
  }
  try {
    const c = imapClient(mb);
    await c.connect();
    await c.logout();
  } catch (e: any) {
    imap = `FAIL: ${e.message}`;
  }
  const ok = smtp === 'ok' && imap === 'ok';
  await Mailbox.updateOne({ _id: mb._id }, { $set: { last_error: ok ? null : `${smtp} / ${imap}` } });
  return { smtp, imap, ok };
}

/** Plain-text alternative for SMTP sends (mail clients + spam filters like having one). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => (txt.trim() && txt.trim() !== href ? `${txt.trim()} (${href})` : href))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
