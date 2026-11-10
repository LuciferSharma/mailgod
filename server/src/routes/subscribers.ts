import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { Subscriber } from '../models/subscriber';
import { EmailEvent } from '../models/emailEvent';
import { Readable } from 'stream';
import { validate } from '../middleware/validate';
import { createSubscriberSchema, updateSubscriberSchema, addTagsSchema } from '../schemas/subscriber';
import { createJob, getJob, updateJob } from '../services/importJobManager';
import { scoreRangeForBand, activityDateRangeFor } from '../services/engagementScorer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/stats', async (_req: Request, res: Response, next: Function) => {
  try {
    const [byStatus, byPlan, total] = await Promise.all([
      Subscriber.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Subscriber.aggregate([{ $group: { _id: '$plan_tier', count: { $sum: 1 } } }]),
      Subscriber.countDocuments(),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s: any) => { statusMap[s._id] = s.count; });

    const planMap: Record<string, number> = {};
    byPlan.forEach((p: any) => { planMap[p._id || 'unknown'] = p.count; });

    res.json({ total, by_status: statusMap, by_plan: planMap });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: Function) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const plan_tier = req.query.plan_tier as string;
    const tag = req.query.tag as string;
    const engagement_band = req.query.engagement_band as string;
    const engagement_activity = req.query.engagement_activity as string;
    const sort = (req.query.sort as string) || '-created_at';

    const filter: any = {};
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (plan_tier) filter.plan_tier = plan_tier;
    if (tag) filter.tags = tag;

    if (engagement_band) {
      const range = scoreRangeForBand(engagement_band as any);
      const cond: any = {};
      if (range.min !== undefined) cond.$gte = range.min;
      if (range.max !== undefined) cond.$lte = range.max;
      if (Object.keys(cond).length > 0) filter.engagement_score = cond;
    }
    if (engagement_activity) {
      const range = activityDateRangeFor(engagement_activity as any);
      const cond: any = {};
      if (range.after) cond.$gt = range.after;
      if (range.before) cond.$lt = range.before;
      if (range.nullOk) {
        filter.$or = (filter.$or || []).concat([
          { engagement_last_event_at: null },
          { engagement_last_event_at: { $exists: false } },
          ...(Object.keys(cond).length > 0 ? [{ engagement_last_event_at: cond }] : []),
        ]);
      } else if (Object.keys(cond).length > 0) {
        filter.engagement_last_event_at = cond;
      }
    }

    const [data, total] = await Promise.all([
      Subscriber.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Subscriber.countDocuments(filter),
    ]);

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/import/status/:jobId', async (req: Request, res: Response, next: Function) => {
  try {
    const job = await getJob(req.params.jobId as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id);
    if (!subscriber) return res.status(404).json({ error: 'Not found' });

    const events = await EmailEvent.find({ subscriber_id: subscriber._id })
      .sort({ timestamp: -1 })
      .limit(100);

    res.json({ subscriber, events });
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createSubscriberSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const subscriber = await Subscriber.create(req.body);
    res.status(201).json(subscriber);
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    next(error);
  }
});

router.post('/import/preview', upload.single('file'), async (req: Request, res: Response, next: Function) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const records: any[] = [];
    const parser = Readable.from(req.file.buffer).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    let headers: string[] = [];
    for await (const record of parser) {
      if (headers.length === 0) headers = Object.keys(record);
      if (record.tags && typeof record.tags === 'string') {
        record.tags = record.tags.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
      }
      records.push(record);
    }

    const preview = records.slice(0, 10);

    const validRecords = records.filter(r => isValidEmail(r.email));
    const invalidSamples: { value: string; row: number }[] = [];
    records.forEach((r, idx) => {
      if (!isValidEmail(r.email)) {
        if (invalidSamples.length < 10) {
          invalidSamples.push({ value: String(r.email ?? ''), row: idx + 2 }); // +2 because row 1 is header, idx is 0-based
        }
      }
    });

    const existing = await Subscriber.countDocuments({
      email: { $in: validRecords.map(r => r.email.toLowerCase().trim()) },
    });

    const customFields = headers.filter(h => !STANDARD_FIELDS.has(h.toLowerCase()));
    const standardFields = headers.filter(h => STANDARD_FIELDS.has(h.toLowerCase()));

    res.json({
      headers,
      standard_fields: standardFields,
      custom_fields: customFields,
      total: records.length,
      valid: validRecords.length,
      invalid_count: records.length - validRecords.length,
      invalid_samples: invalidSamples,
      existing,
      new: validRecords.length - existing,
      preview,
    });
  } catch (error) {
    next(error);
  }
});

const STANDARD_FIELDS = new Set([
  'email', 'name', 'country', 'plan_tier', 'signup_source', 'tags', 'status', 'language',
]);

// Conservative email regex — accepts standard formats, rejects values without
// an "@" or with whitespace/control chars. Not RFC 5322-strict; just enough to
// catch CSV rows where someone put a name or note in the email column.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
function isValidEmail(s: any): boolean {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (!trimmed || trimmed.length > 320) return false;
  return EMAIL_RE.test(trimmed);
}

router.post('/import', upload.single('file'), async (req: Request, res: Response, next: Function) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let mapping = null;
    if (req.body.mapping) {
      try {
        mapping = JSON.parse(req.body.mapping);
      } catch {
        return res.status(400).json({ error: 'Invalid mapping JSON' });
      }
    }

    // Optional bulk tag(s) applied to every imported row. Comma OR semicolon
    // separated — both work.
    const bulkTags: string[] = String(req.body.bulk_tags || '')
      .split(/[,;]/)
      .map(t => t.trim())
      .filter(Boolean);

    const records: any[] = [];

    const parser = Readable.from(req.file.buffer).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    for await (const record of parser) {
      const subscriber: any = {};
      const customAttrs: Record<string, any> = {};
      if (mapping) {
        for (const [dbField, csvField] of Object.entries(mapping)) {
          if (csvField && record[csvField as string] !== undefined) {
            subscriber[dbField] = record[csvField as string];
          }
        }
      } else {
        for (const [k, v] of Object.entries(record)) {
          if (STANDARD_FIELDS.has(k.toLowerCase())) {
            subscriber[k] = v;
          } else if (v !== '' && v !== null && v !== undefined) {
            customAttrs[k] = v;
          }
        }
      }
      if (subscriber.tags && typeof subscriber.tags === 'string') {
        subscriber.tags = subscriber.tags.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
      }
      // Merge bulk tags (from "tag all imported" UI) with per-row tags. Dedupe.
      if (bulkTags.length > 0) {
        const existing = Array.isArray(subscriber.tags) ? subscriber.tags : [];
        subscriber.tags = Array.from(new Set([...existing, ...bulkTags]));
      }
      if (Object.keys(customAttrs).length > 0) {
        subscriber.custom_attributes = customAttrs;
      }
      if (subscriber.email) {
        records.push(subscriber);
      }
    }

    // Partition: valid emails go through; invalid get reported back
    const invalidEmails: string[] = [];
    const validRecords = records.filter(r => {
      if (isValidEmail(r.email)) return true;
      if (invalidEmails.length < 100) invalidEmails.push(String(r.email).trim().slice(0, 200));
      return false;
    });
    const invalidCount = records.length - validRecords.length;

    const job = await createJob(records.length);
    // Persist invalid emails immediately so they show up while the job is still processing
    if (invalidCount > 0) {
      await updateJob(job.id, { invalid_count: invalidCount, invalid_emails: invalidEmails });
    }
    res.status(202).json({ jobId: job.id, total: records.length, invalid: invalidCount });

    (async () => {
      try {
        const batchSize = 500;
        let totalImported = 0;
        let totalSkipped = 0;
        for (let i = 0; i < validRecords.length; i += batchSize) {
          const batch = validRecords.slice(i, i + batchSize);
          const ops = batch.map(r => {
            const { tags, custom_attributes, ...rest } = r;
            const update: any = {
              $setOnInsert: { ...rest, email: r.email.toLowerCase().trim() },
            };
            if (Array.isArray(tags) && tags.length > 0) {
              update.$addToSet = { tags: { $each: tags } };
            }
            // Merge custom_attributes into existing doc (don't overwrite the whole map)
            if (custom_attributes && Object.keys(custom_attributes).length > 0) {
              update.$set = update.$set || {};
              for (const [k, v] of Object.entries(custom_attributes)) {
                update.$set[`custom_attributes.${k}`] = v;
              }
            }
            return {
              updateOne: {
                filter: { email: r.email.toLowerCase().trim() },
                update,
                upsert: true,
              },
            };
          });

          const result = await Subscriber.bulkWrite(ops, { ordered: false });
          totalImported += result.upsertedCount;
          totalSkipped += batch.length - result.upsertedCount;
          await updateJob(job.id, {
            processed: Math.min(i + batchSize, validRecords.length) + invalidCount,
            imported: totalImported,
            skipped: totalSkipped,
          });
        }
        await updateJob(job.id, { status: 'completed' });
      } catch (err: any) {
        await updateJob(job.id, { status: 'failed', import_errors: [err.message] });
      }
    })();
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validate(updateSubscriberSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ error: 'Not found' });
    res.json(subscriber);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    await Subscriber.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/tags', validate(addTagsSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const { tags } = req.body;
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { tags: { $each: tags } } },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ error: 'Not found' });
    res.json(subscriber);
  } catch (error) {
    next(error);
  }
});

router.post('/bulk-action', async (req: Request, res: Response, next: Function) => {
  try {
    const { action, subscriberIds, tag } = req.body;
    if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      return res.status(400).json({ error: 'subscriberIds required' });
    }

    if (action === 'delete') {
      const result = await Subscriber.deleteMany({ _id: { $in: subscriberIds } });
      return res.json({ deleted: result.deletedCount });
    }

    if (action === 'tag' && tag) {
      const result = await Subscriber.updateMany(
        { _id: { $in: subscriberIds } },
        { $addToSet: { tags: tag } }
      );
      return res.json({ modified: result.modifiedCount });
    }

    if (action === 'export') {
      const subscribers = await Subscriber.find({ _id: { $in: subscriberIds } }).lean();
      const fields = ['email', 'name', 'status', 'plan_tier', 'country', 'tags', 'signup_source'];
      const header = fields.join(',');
      const rows = subscribers.map(s => fields.map(f => {
        const val = (s as any)[f];
        if (Array.isArray(val)) return `"${val.join(';')}"`;
        return val != null ? `"${String(val).replace(/"/g, '""')}"` : '';
      }).join(','));
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/tags/:tag', async (req: Request, res: Response, next: Function) => {
  try {
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $pull: { tags: req.params.tag } },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ error: 'Not found' });
    res.json(subscriber);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Engagement
// ============================================================================
router.put('/:id/engagement/manual', async (req: Request, res: Response, next: Function) => {
  try {
    const value = Number(req.body?.value);
    if (!Number.isFinite(value)) return res.status(400).json({ error: 'value must be a number' });
    const reason = String(req.body?.reason || '').slice(0, 500);

    const sub: any = await Subscriber.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });

    sub.engagement_score_manual = value;
    const log = sub.engagement_manual_log || [];
    log.unshift({ value, reason, by: 'admin', at: new Date() });
    sub.engagement_manual_log = log.slice(0, 10);
    await sub.save();
    res.json(sub);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Custom fields
// ============================================================================

// Discover all custom field keys across subscribers, with sample values for type
// inference and counts.
// Returns all distinct tags across subscribers, with a count per tag, sorted
// by count desc. Used by the Subscribers page tag-filter dropdown.
router.get('/tags/discover', async (_req: Request, res: Response, next: Function) => {
  try {
    const result = await Subscriber.aggregate([
      { $match: { tags: { $exists: true, $ne: [] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 500 },
    ]);
    res.json(result.map((r: any) => ({ tag: r._id, count: r.count })));
  } catch (error) {
    next(error);
  }
});

router.get('/custom-fields/discover', async (_req: Request, res: Response, next: Function) => {
  try {
    const result = await Subscriber.aggregate([
      { $match: { custom_attributes: { $exists: true, $ne: {} } } },
      { $project: { entries: { $objectToArray: '$custom_attributes' } } },
      { $unwind: '$entries' },
      {
        $group: {
          _id: '$entries.k',
          count: { $sum: 1 },
          sample: { $first: '$entries.v' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]);

    const fields = result.map((r: any) => ({
      key: r._id,
      count: r.count,
      type: inferType(r.sample),
      sample: String(r.sample ?? '').slice(0, 100),
    }));

    res.json(fields);
  } catch (error) {
    next(error);
  }
});

// Set/update a single custom field on a subscriber
router.put('/:id/custom-fields/:key', async (req: Request, res: Response, next: Function) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(key)) {
      return res.status(400).json({ error: 'Invalid field key. Use letters, digits, underscores, hyphens.' });
    }
    const value = req.body?.value;
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $set: { [`custom_attributes.${key}`]: value } },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ error: 'Not found' });
    res.json(subscriber);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/custom-fields/:key', async (req: Request, res: Response, next: Function) => {
  try {
    const key = req.params.key;
    const subscriber = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $unset: { [`custom_attributes.${key}`]: '' } },
      { new: true }
    );
    if (!subscriber) return res.status(404).json({ error: 'Not found' });
    res.json(subscriber);
  } catch (error) {
    next(error);
  }
});

function inferType(value: any): 'text' | 'url' | 'number' | 'date' {
  if (value == null) return 'text';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'date';
  const s = String(value).trim();
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
  // ISO 8601 date
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return 'date';
  return 'text';
}

export { router as subscriberRoutes };
