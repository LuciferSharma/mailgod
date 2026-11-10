import { Router, Request, Response } from 'express';
import { EmailEvent } from '../models/emailEvent';
import { Subscriber } from '../models/subscriber';
import { Campaign } from '../models/campaign';
import { applyEngagementEvent, EngagementEvent } from '../services/engagementScorer';
import { advanceStage } from '../services/pipelineAuto';

const router = Router();

router.post('/sendgrid', async (req: Request, res: Response) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(body)) {
      body = JSON.parse(body.toString('utf8'));
    } else if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    const events = Array.isArray(body) ? body : [body];
    console.log(`[sendgrid-event] received ${events.length} event(s):`, events.map((e: any) => e?.event).join(', '));

    let saved = 0;
    let skipped = 0;

    for (const event of events) {
      const subscriberId = event.subscriber_id || event.custom_args?.subscriber_id;
      const campaignId = event.campaign_id || event.custom_args?.campaign_id;
      const flowId = event.flow_id || event.custom_args?.flow_id;
      const flowExecutionId = event.flow_execution_id || event.custom_args?.flow_execution_id;
      const oneOffSendId = event.one_off_send_id || event.custom_args?.one_off_send_id;

      const eventType = mapSendGridEvent(event.event);
      const { getDefaultMailbox } = await import('../services/mailboxService');
      const sgMailbox = await getDefaultMailbox().catch(() => null);
      if (!eventType) {
        skipped++;
        continue;
      }

      if (!subscriberId) {
        skipped++;
        console.warn(`[sendgrid-event] skipped ${event.event} — no subscriber_id in event or custom_args. Available keys:`, Object.keys(event));
        continue;
      }

      if (subscriberId) {
        // Idempotency: SendGrid retries event batches, and a retry/replay would
        // otherwise double-count opens/clicks/bounces and corrupt stats +
        // engagement scores. sg_event_id is unique per event — skip if already
        // processed. The unique index is the hard backstop for races.
        const sgEventId = event.sg_event_id ? String(event.sg_event_id) : null;
        if (sgEventId && (await EmailEvent.exists({ sg_event_id: sgEventId }))) {
          skipped++;
          continue;
        }
        try {
          await EmailEvent.create({
            subscriber_id: subscriberId,
            campaign_id: campaignId || null,
            flow_id: flowId || null,
            flow_execution_id: flowExecutionId || null,
            mailbox_id: sgMailbox ? sgMailbox._id : null,
            sendgrid_message_id: event.sg_message_id || '',
            sg_event_id: sgEventId ?? undefined,
            event: eventType,
            metadata: {
              url: event.url,
              user_agent: event.useragent,
              ip: event.ip,
              reason: event.reason || event.response,
            },
            timestamp: event.timestamp ? new Date(event.timestamp * 1000) : new Date(),
          });
        } catch (e: any) {
          // Concurrent duplicate (unique index) — already counted, skip safely.
          if (e?.code === 11000) { skipped++; continue; }
          throw e;
        }

        if (eventType === 'open') {
          await Subscriber.findByIdAndUpdate(subscriberId, {
            $inc: { 'engagement.emails_opened': 1 },
          });
        } else if (eventType === 'click') {
          await Subscriber.findByIdAndUpdate(subscriberId, {
            $inc: { 'engagement.emails_clicked': 1 },
          });
        } else if (eventType === 'bounce') {
          await Subscriber.findByIdAndUpdate(subscriberId, {
            $set: { status: 'bounced' },
          });
        } else if (eventType === 'spamreport') {
          await Subscriber.findByIdAndUpdate(subscriberId, {
            $set: { status: 'complained' },
          });
        } else if (eventType === 'unsubscribe') {
          await Subscriber.findByIdAndUpdate(subscriberId, {
            $set: { status: 'unsubscribed' },
          });
        }

        if (campaignId && (eventType === 'delivered' || eventType === 'open' || eventType === 'click' || eventType === 'bounce' || eventType === 'unsubscribe')) {
          const statField = `stats.${eventType === 'open' ? 'opened' : eventType === 'click' ? 'clicked' : eventType}`;
          await Campaign.findByIdAndUpdate(campaignId, { $inc: { [statField]: 1 } });
        }

        // Update engagement score (best-effort, doesn't block event recording)
        // Suppress engagement bump when the click is on the unsubscribe link.
        // Corporate email scanners (Defender, Mimecast, Apple Mail Privacy, etc.)
        // GET every URL in an email — including the unsubscribe link — without
        // a human ever clicking. Counting those as +10 engagement inflates
        // scores. The real unsubscribe (POST) flips status separately.
        const url: string = String(event.url || '');
        const isUnsubscribeClick = eventType === 'click' && /\/api\/unsubscribe\//.test(url);

        const scoreEvent: EngagementEvent | null =
          eventType === 'open' ? 'open' :
          (eventType === 'click' && !isUnsubscribeClick) ? 'click' :
          eventType === 'bounce' ? 'bounce' :
          eventType === 'spamreport' ? 'spam' :
          eventType === 'unsubscribe' ? 'unsubscribe' :
          null;
        if (scoreEvent) await applyEngagementEvent(subscriberId, scoreEvent);

        // Auto-pipeline: a genuine open/click advances the conversation to
        // "Contacted" (forward-only). Mapped via custom_args — campaign/one-off
        // have a clean key; flow steps lack a node id in the event, so skip them.
        if (eventType === 'open' || (eventType === 'click' && !isUnsubscribeClick)) {
          if (campaignId) {
            await advanceStage({ subscriber_id: subscriberId, source_type: 'campaign', source_id: campaignId, flow_node_id: null }, 'Contacted');
          } else if (oneOffSendId) {
            await advanceStage({ subscriber_id: subscriberId, source_type: 'one_off', source_id: oneOffSendId, flow_node_id: null }, 'Contacted');
          }
        }

        saved++;
      }
    }

    console.log(`[sendgrid-event] saved=${saved} skipped=${skipped}`);
    res.status(200).json({ received: true, saved, skipped });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(200).json({ received: true });
  }
});

function mapSendGridEvent(event: string): string | null {
  // NOTE: we intentionally do NOT map `processed` here. emailService
  // writes the 'sent' EmailEvent synchronously when SendGrid accepts
  // the API call. If we also recorded the `processed` webhook as 'sent',
  // every email would double-count in stats.
  const map: Record<string, string> = {
    delivered: 'delivered',
    open: 'open',
    click: 'click',
    bounce: 'bounce',
    dropped: 'bounce',
    spamreport: 'spamreport',
    unsubscribe: 'unsubscribe',
    group_unsubscribe: 'unsubscribe',
  };
  return map[event] || null;
}

export { router as webhookRoutes };
