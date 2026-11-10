import { Router, Request, Response } from 'express';
import { Segment } from '../models/segment';
import { Subscriber } from '../models/subscriber';
import { getSegmentSubscribers, refreshSegmentCount, buildSegmentQuery } from '../services/segmentService';
import { validate } from '../middleware/validate';
import { createSegmentSchema } from '../schemas/segment';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const segments = await Segment.find().sort({ created_at: -1 });
    res.json(segments);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Not found' });
    res.json(segment);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createSegmentSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const segment = await Segment.create(req.body);
    await refreshSegmentCount(segment._id.toString());
    const updated = await Segment.findById(segment._id);
    res.status(201).json(updated);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const segment = await Segment.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!segment) return res.status(404).json({ error: 'Not found' });
    await refreshSegmentCount(segment._id.toString());
    const updated = await Segment.findById(segment._id);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    await Segment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/subscribers', async (req: Request, res: Response, next: Function) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const { subscribers, total } = await getSegmentSubscribers(req.params.id as string, page, limit);
    res.json({
      data: subscribers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/preview-count', async (req: Request, res: Response, next: Function) => {
  try {
    const { operator, conditions } = req.body;
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      return res.json({ count: 0 });
    }
    const fakeSegment = { rules: { operator: operator || 'AND', conditions } } as any;
    const query = buildSegmentQuery(fakeSegment);
    const count = await Subscriber.countDocuments(query);
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/refresh', async (req: Request, res: Response, next: Function) => {
  try {
    const count = await refreshSegmentCount(req.params.id as string);
    res.json({ subscriber_count: count });
  } catch (error) {
    next(error);
  }
});

export { router as segmentRoutes };
