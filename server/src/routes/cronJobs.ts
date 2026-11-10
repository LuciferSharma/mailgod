import { Router, Request, Response } from 'express';
import { CronJob } from '../models/cronJob';
import { CronJobRun } from '../models/cronJobRun';
import { restartCronJobs, runCronJobNow } from '../services/cronScheduler';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const jobs = await CronJob.find().sort({ created_at: -1 });
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: Function) => {
  try {
    const job = await CronJob.create(req.body);
    restartCronJobs();
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const job = await CronJob.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Not found' });
    restartCronJobs();
    res.json(job);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    await CronJob.findByIdAndDelete(req.params.id);
    restartCronJobs();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/toggle', async (req: Request, res: Response, next: Function) => {
  try {
    const job = await CronJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    job.status = job.status === 'active' ? 'paused' : 'active';
    await job.save();
    restartCronJobs();
    res.json(job);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/run', async (req: Request, res: Response, next: Function) => {
  try {
    const job = await CronJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const result = await runCronJobNow(job);
    await CronJob.findByIdAndUpdate(req.params.id, { $set: { last_run_at: new Date() } });
    res.json({ message: 'Job executed', result, job });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/runs', async (req: Request, res: Response, next: Function) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await CronJobRun.find({ cron_job_id: req.params.id })
      .sort({ ran_at: -1 })
      .limit(limit)
      .lean();
    res.json(runs);
  } catch (error) {
    next(error);
  }
});

export { router as cronJobRoutes };
