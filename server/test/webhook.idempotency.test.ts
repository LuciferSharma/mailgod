import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { webhookRoutes } from '../src/routes/webhooks';
import { Subscriber } from '../src/models/subscriber';
import { EmailEvent } from '../src/models/emailEvent';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/webhooks', webhookRoutes);
  return a;
}

describe('SendGrid event webhook — idempotency', () => {
  it('processes an event once and dedupes retries by sg_event_id', async () => {
    const a = app();
    const sub = await Subscriber.create({ email: 'w@x.com', status: 'active' });
    const event = {
      event: 'open',
      sg_event_id: 'evt-123',
      sg_message_id: 'm-1',
      email: 'w@x.com',
      custom_args: { subscriber_id: String(sub._id) },
    };

    const r1 = await request(a).post('/api/webhooks/sendgrid').send([event]);
    expect(r1.status).toBe(200);
    expect(r1.body.saved).toBe(1);

    const r2 = await request(a).post('/api/webhooks/sendgrid').send([event]); // retry
    expect(r2.status).toBe(200);
    expect(r2.body.saved).toBe(0);
    expect(r2.body.skipped).toBe(1);

    expect(await EmailEvent.countDocuments({ sg_event_id: 'evt-123' })).toBe(1);
    const fresh = await Subscriber.findById(sub._id);
    expect(fresh!.engagement.emails_opened).toBe(1); // counted once, not twice
  });
});
