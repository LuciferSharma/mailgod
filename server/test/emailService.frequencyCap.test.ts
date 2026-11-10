import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Mock SendGrid so no real email is ever sent.
vi.mock('@sendgrid/mail', () => ({
  default: { setApiKey: vi.fn(), send: vi.fn() },
}));

import sgMail from '@sendgrid/mail';
import { config } from '../src/config';
import { Subscriber } from '../src/models/subscriber';
import { sendEmail, resolveFrequencyCap } from '../src/services/emailService';
import { setSetting } from '../src/models/settings';
import { RateWindow } from '../src/models/rateWindow';

const send = sgMail.send as unknown as ReturnType<typeof vi.fn>;

beforeAll(() => {
  config.sendgridApiKey = 'test-key';
  config.frequencyCapDaily = 1;
  config.globalRateLimit = 1_000_000; // don't let the rate limiter interfere
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue([{ headers: { 'x-message-id': 'msg-test' } }]);
});

async function makeSub() {
  return Subscriber.create({
    email: `u${Math.random().toString(36).slice(2)}@example.com`,
    name: 'U',
    status: 'active',
  });
}
const inline = { inlineSubject: 'Hi', inlineHtml: '<p>Hi</p>' };

describe('sendEmail — atomic frequency cap', () => {
  it('sends the first email and increments the daily counter', async () => {
    const s = await makeSub();
    const r = await sendEmail({ subscriberId: String(s._id), ...inline });
    expect(r.success).toBe(true);
    const fresh = await Subscriber.findById(s._id);
    expect(fresh!.frequency.emails_sent_today).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('blocks the second send the same day (cap = 1)', async () => {
    const s = await makeSub();
    await sendEmail({ subscriberId: String(s._id), ...inline });
    const r2 = await sendEmail({ subscriberId: String(s._id), ...inline });
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/frequency cap/i);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is race-safe: two concurrent sends, only one wins, no cap breach', async () => {
    const s = await makeSub();
    const [a, b] = await Promise.all([
      sendEmail({ subscriberId: String(s._id), ...inline }),
      sendEmail({ subscriberId: String(s._id), ...inline }),
    ]);
    expect([a, b].filter(r => r.success).length).toBe(1);
    const fresh = await Subscriber.findById(s._id);
    expect(fresh!.frequency.emails_sent_today).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('resets the counter on a new day', async () => {
    const s = await makeSub();
    const longAgo = new Date(Date.now() - 36 * 3600 * 1000);
    await Subscriber.findByIdAndUpdate(s._id, {
      $set: { 'frequency.last_email_date': longAgo, 'frequency.emails_sent_today': 5 },
    });
    const r = await sendEmail({ subscriberId: String(s._id), ...inline });
    expect(r.success).toBe(true);
    const fresh = await Subscriber.findById(s._id);
    expect(fresh!.frequency.emails_sent_today).toBe(1);
  });

  it('releases the reserved slot when the send fails', async () => {
    const s = await makeSub();
    send.mockReset();
    send.mockRejectedValue(new Error('sendgrid down'));
    const r = await sendEmail({ subscriberId: String(s._id), ...inline });
    expect(r.success).toBe(false);
    const fresh = await Subscriber.findById(s._id);
    expect(fresh!.frequency.emails_sent_today).toBe(0);
  });

  it('does NOT frequency-cap personal (1-to-1 reply) sends', async () => {
    const s = await makeSub();
    await sendEmail({ subscriberId: String(s._id), ...inline }); // consume the daily cap
    expect((await Subscriber.findById(s._id))!.frequency.emails_sent_today).toBe(1);
    const r = await sendEmail({ subscriberId: String(s._id), ...inline, personalEmail: true });
    expect(r.success).toBe(true); // reply still goes out despite cap being hit
    expect((await Subscriber.findById(s._id))!.frequency.emails_sent_today).toBe(1); // not consumed
  });

  it('advances engagement only on a successful send, never on failure', async () => {
    const s = await makeSub();
    send.mockReset();
    send.mockRejectedValueOnce(new Error('boom'));
    await sendEmail({ subscriberId: String(s._id), ...inline }); // fails
    let fresh = await Subscriber.findById(s._id);
    expect(fresh!.engagement.emails_sent).toBe(0);
    expect(fresh!.engagement.last_email_at).toBeNull(); // not advanced pre-send (regression guard)
    send.mockResolvedValue([{ headers: { 'x-message-id': 'm' } }]);
    const ok = await sendEmail({ subscriberId: String(s._id), ...inline }); // succeeds
    expect(ok.success).toBe(true);
    fresh = await Subscriber.findById(s._id);
    expect(fresh!.engagement.emails_sent).toBe(1);
    expect(fresh!.engagement.last_email_at).not.toBeNull();
  });

  it('releases the global rate slot when the send fails', async () => {
    const s = await makeSub();
    send.mockReset();
    send.mockRejectedValue(new Error('down'));
    await sendEmail({ subscriberId: String(s._id), ...inline });
    const doc = await RateWindow.findOne().lean();
    expect(doc?.count ?? 0).toBe(0); // reserved 1, released 1
  });

  it('cap of 0 blocks marketing sends (0 is preserved, not clobbered) but not personal replies', async () => {
    await setSetting('frequency_cap_daily', 0);
    const s = await makeSub();
    const r = await sendEmail({ subscriberId: String(s._id), ...inline });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/frequency cap/i);
    const reply = await sendEmail({ subscriberId: String(s._id), ...inline, personalEmail: true });
    expect(reply.success).toBe(true);
  });
});

// Pure unit test — the real protection against the "cap stored as a string"
// production bug (mongodb-memory-server silently coerces strings, so an
// integration test can't detect it; the helper is where the fix lives).
describe('resolveFrequencyCap', () => {
  it('coerces numeric strings, preserves 0, falls back on empty/garbage/negative', () => {
    expect(resolveFrequencyCap('3', 1)).toBe(3);
    expect(resolveFrequencyCap('0', 1)).toBe(0);
    expect(resolveFrequencyCap(0, 1)).toBe(0);
    expect(resolveFrequencyCap('', 1)).toBe(1);
    expect(resolveFrequencyCap('abc', 1)).toBe(1);
    expect(resolveFrequencyCap(null, 1)).toBe(1);
    expect(resolveFrequencyCap(-2, 1)).toBe(1);
  });
});
