import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { Booking } from '../models/booking';
import { Subscriber } from '../models/subscriber';
import { Message } from '../models/message';
import { advanceStage } from '../services/pipelineAuto';

const router = Router();

function verifySignature(req: Request): boolean {
  const signature = req.headers['x-cal-signature-256'] as string;
  if (!signature) return true; // If Cal.com didn't send signature, accept payload
  const secret = config.calcomSecret;
  if (!secret) return true;

  try {
    let rawBody = '';
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch (e) {
    console.error('[calcom-webhook] Signature verification exception:', e);
    return false;
  }
}

/**
 * Cal.com Webhook Handler
 * Endpoint: POST /api/webhooks/cal
 */
router.post('/cal', async (req: Request, res: Response) => {
  try {
    if (!verifySignature(req)) {
      console.warn('[calcom-webhook] Signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload: any = req.body;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString('utf8'));
    } else if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    }
    const triggerEvent = payload.triggerEvent || payload.type || 'BOOKING_CREATED';
    const bookingData = payload.payload || payload;

    const bookingUid = String(bookingData.uid || bookingData.id || Date.now());
    const attendees = Array.isArray(bookingData.attendees) ? bookingData.attendees : [];
    const mainAttendee = attendees[0] || {};
    const attendeeEmail = (mainAttendee.email || bookingData.email || '').trim().toLowerCase();
    const attendeeName = mainAttendee.name || bookingData.name || '';
    const eventTitle = bookingData.title || bookingData.eventTitle || 'Cal.com Meeting';
    const startTime = new Date(bookingData.startTime || bookingData.start || Date.now());
    const endTime = new Date(bookingData.endTime || bookingData.end || Date.now());
    const meetingUrl = bookingData.meetingUrl || bookingData.location || null;

    let bookingStatus: 'ACCEPTED' | 'CANCELLED' | 'RESCHEDULED' | 'PENDING' = 'ACCEPTED';
    if (triggerEvent === 'BOOKING_CANCELLED' || bookingData.status === 'CANCELLED') {
      bookingStatus = 'CANCELLED';
    } else if (triggerEvent === 'BOOKING_RESCHEDULED' || bookingData.status === 'RESCHEDULED') {
      bookingStatus = 'RESCHEDULED';
    }

    let subscriber = null;
    if (attendeeEmail) {
      subscriber = await Subscriber.findOne({ email: attendeeEmail });
      if (!subscriber) {
        subscriber = await Subscriber.create({
          email: attendeeEmail,
          name: attendeeName,
          status: 'active',
          signup_source: 'calcom_booking',
        });
      }
    }

    // Upsert the booking
    const booking = await Booking.findOneAndUpdate(
      { cal_booking_id: bookingUid },
      {
        $set: {
          cal_booking_id: bookingUid,
          event_title: eventTitle,
          trigger_event: triggerEvent,
          subscriber_id: subscriber?._id || null,
          attendee_email: attendeeEmail,
          attendee_name: attendeeName,
          start_time: startTime,
          end_time: endTime,
          status: bookingStatus,
          meeting_url: meetingUrl,
          raw_payload: payload,
        },
      },
      { upsert: true, new: true }
    );

    // If a call is booked, auto-advance the prospect's pipeline stage to "Demo Booked"
    if (subscriber && (bookingStatus === 'ACCEPTED' || triggerEvent === 'BOOKING_CREATED')) {
      // Find the most recent conversation/message for this subscriber
      const lastMsg = await Message.findOne({ subscriber_id: subscriber._id })
        .sort({ created_at: -1 })
        .select('source_type source_id flow_node_id')
        .lean();

      if (lastMsg) {
        await advanceStage(
          {
            subscriber_id: subscriber._id.toString(),
            source_type: lastMsg.source_type,
            source_id: lastMsg.source_id.toString(),
            flow_node_id: lastMsg.flow_node_id,
          },
          'Demo Booked'
        );
      }
    }

    res.status(200).json({ success: true, booking_id: booking._id });
  } catch (error: any) {
    console.error('[calcom-webhook] Error processing webhook:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/webhooks/cal/bookings (for Dashboard)
router.get('/cal/bookings', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const bookings = await Booking.find()
      .populate('subscriber_id', 'email name status')
      .sort({ start_time: -1 })
      .limit(limit)
      .lean();

    res.json(bookings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as calcomWebhookRoutes };
