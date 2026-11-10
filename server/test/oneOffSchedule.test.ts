import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { OneOffSend } from '../src/models/oneOffSend';
import { Subscriber } from '../src/models/subscriber';
import { oneOffSendRoutes, processDueOneOffSends } from '../src/routes/oneOffSends';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/one-off-sends', oneOffSendRoutes);
  return a;
}

async function makeDraft() {
  const sub = await Subscriber.create({ email: `s${Date.now()}@x.com`, name: 'S', status: 'active' });
  return OneOffSend.create({
    subject: 'Hello',
    html_body: '<p>Hi</p>',
    recipient_ids: [sub._id],
    recipient_count: 1,
    status: 'draft',
  });
}

const inFuture = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();
const inPast = (mins: number) => new Date(Date.now() - mins * 60_000);

describe('one-off scheduling', () => {
  it('schedules a draft for a future time', async () => {
    const draft = await makeDraft();
    const res = await request(app())
      .post(`/api/one-off-sends/${draft._id}/schedule`)
      .send({ scheduled_at: inFuture(60) });
    expect(res.status).toBe(200);
    expect(res.body.send.status).toBe('scheduled');
    expect(res.body.send.scheduled_at).toBeTruthy();
  });

  it('rejects past times, invalid dates, and non-drafts', async () => {
    const a = app();
    const draft = await makeDraft();
    expect(
      (await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({ scheduled_at: inPast(5).toISOString() })).status,
    ).toBe(400);
    expect(
      (await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({ scheduled_at: 'not-a-date' })).status,
    ).toBe(400);
    expect((await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({})).status).toBe(400);

    await OneOffSend.findByIdAndUpdate(draft._id, { status: 'sent' });
    expect(
      (await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({ scheduled_at: inFuture(60) })).status,
    ).toBe(409);
  });

  it('unschedule returns a scheduled send to draft; 409 otherwise', async () => {
    const a = app();
    const draft = await makeDraft();
    await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({ scheduled_at: inFuture(60) });
    const res = await request(a).post(`/api/one-off-sends/${draft._id}/unschedule`);
    expect(res.status).toBe(200);
    expect(res.body.send.status).toBe('draft');
    expect(res.body.send.scheduled_at).toBeNull();
    // now it's a draft — unschedule again is a 409
    expect((await request(a).post(`/api/one-off-sends/${draft._id}/unschedule`)).status).toBe(409);
  });

  it('processDueOneOffSends claims and dispatches only DUE sends, exactly once', async () => {
    const due = await makeDraft();
    const notDue = await makeDraft();
    await OneOffSend.findByIdAndUpdate(due._id, { status: 'scheduled', scheduled_at: inPast(1) });
    await OneOffSend.findByIdAndUpdate(notDue._id, { status: 'scheduled', scheduled_at: new Date(Date.now() + 3_600_000) });

    const first = await processDueOneOffSends();
    expect(first.dispatched).toBe(1);

    // The due send left 'scheduled' (dispatch ran: no SendGrid key in tests → failed/sent, not scheduled)
    const dueAfter = await OneOffSend.findById(due._id).lean();
    expect(dueAfter!.status).not.toBe('scheduled');
    // The future one is untouched
    const notDueAfter = await OneOffSend.findById(notDue._id).lean();
    expect(notDueAfter!.status).toBe('scheduled');

    // Re-run: nothing left to claim — proves the atomic claim can't double-send
    const second = await processDueOneOffSends();
    expect(second.dispatched).toBe(0);
  });

  it('a scheduled send can no longer be edited (draft-only guard) until unscheduled', async () => {
    const a = app();
    const draft = await makeDraft();
    await request(a).post(`/api/one-off-sends/${draft._id}/schedule`).send({ scheduled_at: inFuture(60) });
    const edit = await request(a).put(`/api/one-off-sends/${draft._id}`).send({ subject: 'Changed' });
    expect(edit.status).toBe(400);
    await request(a).post(`/api/one-off-sends/${draft._id}/unschedule`);
    const edit2 = await request(a).put(`/api/one-off-sends/${draft._id}`).send({ subject: 'Changed' });
    expect(edit2.status).toBe(200);
  });
});
