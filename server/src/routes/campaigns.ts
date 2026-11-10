import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { createCampaignSchema } from '../schemas/campaign';
import { Campaign } from '../models/campaign';
import { Segment } from '../models/segment';
import { Template } from '../models/template';
import { Subscriber } from '../models/subscriber';
import { Message } from '../models/message';
import { buildSegmentQuery } from '../services/segmentService';
import { dispatchCampaignSend } from '../services/flowDispatcher';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const campaigns = await Campaign.find()
      .populate('template_id', 'name subject')
      .populate('segment_id', 'name subscriber_count')
      .sort({ created_at: -1 });
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('template_id')
      .populate('segment_id');
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createCampaignSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.create(req.body);
    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    await Campaign.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/send', async (req: Request, res: Response, next: Function) => {
  try {
    const { id } = req.params;

    // Atomically claim the campaign: only one request can transition from draft/scheduled to sending
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, status: { $in: ['draft', 'scheduled'] } },
      { $set: { status: 'sending', started_at: new Date() } },
      { new: true }
    );

    if (!campaign) {
      // Distinguish "not found" from "wrong status"
      const existing = await Campaign.findById(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      return res.status(409).json({ error: `Campaign is already ${existing.status}` });
    }

    const segment = await Segment.findById(campaign.segment_id);
    if (!segment) return res.status(400).json({ error: 'Segment not found' });

    const template = await Template.findById(campaign.template_id);
    if (!template) return res.status(400).json({ error: 'Template not found' });

    const query = buildSegmentQuery(segment);
    const total = await Subscriber.countDocuments(query);

    await Campaign.findByIdAndUpdate(campaign._id, {
      $set: { 'stats.total': total },
    });

    dispatchCampaignSend(campaign._id.toString(), query, campaign.send_config).catch(err => {
      console.error('Campaign send error:', err);
      Campaign.findByIdAndUpdate(campaign._id, { $set: { status: 'paused' } }).catch(() => {});
    });

    res.json({ message: 'Campaign send started', total });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/schedule', async (req: Request, res: Response, next: Function) => {
  try {
    const { scheduled_at } = req.body;
    if (!scheduled_at || new Date(scheduled_at) <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'scheduled', scheduled_at: new Date(scheduled_at) } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'paused' } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/next-batch', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    if (!campaign.segment_id) return res.json({ recipients: [], remaining: 0, batch_size: 0, next_batch_at: null });

    const segment = await Segment.findById(campaign.segment_id);
    if (!segment) return res.json({ recipients: [], remaining: 0, batch_size: 0, next_batch_at: null });

    const batchSize = campaign.send_config?.batch_size || 500;
    const previewLimit = Math.min(20, batchSize);

    // Subscribers we've already sent to for this campaign
    const sentMessages = await Message.find({
      source_type: 'campaign',
      source_id: campaign._id,
      direction: 'outbound',
    }).select('subscriber_id').lean();
    const sentIds = sentMessages.map(m => m.subscriber_id);

    const segmentQuery = buildSegmentQuery(segment);
    const remainingQuery = { ...segmentQuery, _id: { $nin: sentIds } };

    const [recipients, remaining] = await Promise.all([
      Subscriber.find(remainingQuery).select('email name plan_tier').limit(previewLimit).lean(),
      Subscriber.countDocuments(remainingQuery),
    ]);

    res.json({
      recipients,
      remaining,
      batch_size: batchSize,
      next_batch_at: campaign.next_batch_at,
      last_batch_completed_at: campaign.last_batch_completed_at,
      last_batch_size: campaign.last_batch_size,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resume', async (req: Request, res: Response, next: Function) => {
  try {
    const { id } = req.params;
    // Atomically: only paused → sending allowed
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, status: 'paused' },
      { $set: { status: 'sending' } },
      { new: true }
    );
    if (!campaign) {
      const existing = await Campaign.findById(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      return res.status(409).json({ error: `Campaign is ${existing.status}, only paused campaigns can be resumed` });
    }

    const segment = await Segment.findById(campaign.segment_id);
    if (!segment) return res.status(400).json({ error: 'Segment not found' });

    const query = buildSegmentQuery(segment);
    dispatchCampaignSend(campaign._id.toString(), query, campaign.send_config).catch(err => {
      console.error('Campaign resume error:', err);
      Campaign.findByIdAndUpdate(campaign._id, { $set: { status: 'paused' } }).catch(() => {});
    });

    res.json({ message: 'Campaign resumed', campaign });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

export { router as campaignRoutes };
