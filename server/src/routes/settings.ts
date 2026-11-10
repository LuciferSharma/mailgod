import { Router, Request, Response } from 'express';
import { Setting, getSetting, setSetting } from '../models/settings';
import { validate } from '../middleware/validate';
import { updateSettingsSchema } from '../schemas/settings';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const settings = await Setting.find();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put('/', validate(updateSettingsSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, value);
    }
    const settings = await Setting.find();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

export { router as settingsRoutes };
