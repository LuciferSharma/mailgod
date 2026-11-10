import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Subscriber } from '../src/models/subscriber';
import { Booking } from '../src/models/booking';
import { ConversationLabel } from '../src/models/conversationLabel';
import { PipelineStage, ensureStagesSeeded } from '../src/models/pipelineStage';
import { calcomWebhookRoutes } from '../src/routes/calcomWebhook';
import { Message } from '../src/models/message';
import { config } from '../src/config';

function app() {
  const a = express();
  a.use(express.raw({ type: 'application/json' }));
  a.use('/api/webhooks', calcomWebhookRoutes);
  return a;
}

describe('Cal.com Webhook Integration', () => {
  it('creates booking and subscriber, and advances pipeline to Demo Booked when booking is created', async () => {
    await ensureStagesSeeded();
    const sub = await Subscriber.create({
      email: 'john.doe@example.com',
      name: 'John Doe',
      status: 'active',
    });

    // Create a prior message so pipelineAuto has a conversation key
    await Message.create({
      direction: 'outbound',
      source_type: 'one_off',
      source_id: sub._id,
      subscriber_id: sub._id,
      to_address: sub.email,
      from_address: 'admin@example.com',
      reply_token: 'token-12345',
      subject: 'Outreach',
      text_body: 'Hello',
    });

    const payload = {
      triggerEvent: 'BOOKING_CREATED',
      payload: {
        uid: 'booking-12345',
        title: 'Strategy Call with Acme',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 86400000 + 1800000).toISOString(),
        attendees: [{ email: 'john.doe@example.com', name: 'John Doe' }],
        meetingUrl: 'https://cal.com/video/meeting-123',
      },
    };

    const res = await request(app())
      .post('/api/webhooks/cal')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify Booking in DB
    const booking = await Booking.findOne({ cal_booking_id: 'booking-12345' });
    expect(booking).toBeTruthy();
    expect(booking?.attendee_email).toBe('john.doe@example.com');
    expect(booking?.meeting_url).toBe('https://cal.com/video/meeting-123');

    // Verify Pipeline stage advanced to "Demo Booked"
    const label = await ConversationLabel.findOne({ subscriber_id: sub._id });
    expect(label).toBeTruthy();
    const demoStage = await PipelineStage.findOne({ name: 'Demo Booked' });
    expect(label?.stage_id.toString()).toBe(demoStage?._id.toString());
  });

  it('verifies HMAC SHA-256 signature when X-Cal-Signature-256 is present', async () => {
    const rawBody = JSON.stringify({
      triggerEvent: 'BOOKING_CREATED',
      payload: {
        uid: 'signed-booking-999',
        attendees: [{ email: 'signed@example.com', name: 'Signed User' }],
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    const validSig = crypto.createHmac('sha256', config.calcomSecret).update(rawBody).digest('hex');

    // Invalid signature -> 401
    const invalidRes = await request(app())
      .post('/api/webhooks/cal')
      .set('Content-Type', 'application/json')
      .set('X-Cal-Signature-256', 'wrongsignature')
      .send(rawBody);
    expect(invalidRes.status).toBe(401);

    // Valid signature -> 200
    const validRes = await request(app())
      .post('/api/webhooks/cal')
      .set('Content-Type', 'application/json')
      .set('X-Cal-Signature-256', validSig)
      .send(rawBody);
    expect(validRes.status).toBe(200);
  });

  it('fetches list of booked calls for dashboard', async () => {
    const res = await request(app()).get('/api/webhooks/cal/bookings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
