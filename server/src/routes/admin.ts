import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Subscriber } from '../models/subscriber';
import { EmailEvent } from '../models/emailEvent';
import { Message } from '../models/message';

const router = Router();

const POINTS = { open: 1, click: 10, reply: 50, bounce: -5, unsubscribe: -100, spam: -200 } as const;

router.post('/backfill-engagement-scores', async (_req: Request, res: Response, next: Function) => {
  try {
    const total = await Subscriber.countDocuments();
    let processed = 0;
    let updated = 0;
    const batchSize = 1000;

    res.json({ status: 'started', total });

    (async () => {
      const cursor = Subscriber.find().select('_id').cursor();
      let batch: mongoose.Types.ObjectId[] = [];

      const flush = async () => {
        if (batch.length === 0) return;
        await scoreBatch(batch);
        updated += batch.length;
        batch = [];
        if (updated % 5000 === 0) {
          console.log(`[engagement-backfill] ${updated}/${total} subscribers scored`);
        }
      };

      for await (const sub of cursor) {
        batch.push(sub._id as mongoose.Types.ObjectId);
        processed++;
        if (batch.length >= batchSize) {
          await flush();
        }
      }
      await flush();
      console.log(`[engagement-backfill] complete: ${updated}/${total}`);
    })().catch(err => console.error('[engagement-backfill] error:', err));
  } catch (err) {
    next(err);
  }
});

async function scoreBatch(ids: mongoose.Types.ObjectId[]) {
  // 1. Aggregate event counts per subscriber from EmailEvent
  const eventAgg = await EmailEvent.aggregate([
    { $match: { subscriber_id: { $in: ids } } },
    {
      $group: {
        _id: { sub: '$subscriber_id', event: '$event' },
        count: { $sum: 1 },
        latest: { $max: '$timestamp' },
      },
    },
  ]);

  // 2. Aggregate inbound message counts (replies)
  const replyAgg = await Message.aggregate([
    { $match: { subscriber_id: { $in: ids }, direction: 'inbound', is_auto_reply: { $ne: true } } },
    {
      $group: {
        _id: '$subscriber_id',
        count: { $sum: 1 },
        latest: { $max: '$received_at' },
      },
    },
  ]);

  // Build per-subscriber score totals + latest engagement timestamp
  type SubScore = { score: number; lastEvent: Date | null };
  const tally = new Map<string, SubScore>();
  const ensure = (id: string): SubScore => {
    let entry = tally.get(id);
    if (!entry) { entry = { score: 0, lastEvent: null }; tally.set(id, entry); }
    return entry;
  };
  const updateLatest = (entry: SubScore, when: Date | null) => {
    if (!when) return;
    if (!entry.lastEvent || when > entry.lastEvent) entry.lastEvent = when;
  };

  for (const row of eventAgg) {
    const id = row._id.sub.toString();
    const event: string = row._id.event;
    const entry = ensure(id);
    let delta = 0;
    let positive = false;
    switch (event) {
      case 'open': delta = POINTS.open * row.count; positive = true; break;
      case 'click': delta = POINTS.click * row.count; positive = true; break;
      case 'bounce': delta = POINTS.bounce * row.count; break;
      case 'unsubscribe': delta = POINTS.unsubscribe * row.count; break;
      case 'spamreport': delta = POINTS.spam * row.count; break;
      // sent, delivered: 0 (skip)
    }
    entry.score += delta;
    if (positive) updateLatest(entry, row.latest);
  }

  for (const row of replyAgg) {
    const id = row._id.toString();
    const entry = ensure(id);
    entry.score += POINTS.reply * row.count;
    updateLatest(entry, row.latest);
  }

  // 3. Bulk update — also reset silence penalty (cron will recompute on next run)
  const ops = ids.map(id => {
    const entry = tally.get(id.toString()) || { score: 0, lastEvent: null };
    return {
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            engagement_score: entry.score,
            engagement_last_event_at: entry.lastEvent,
            engagement_silence_penalty: 0,
          },
        },
      },
    };
  });
  if (ops.length > 0) await Subscriber.bulkWrite(ops, { ordered: false });
}

export { router as adminRoutes };
