import { Router, Request, Response } from 'express';
import { Subscriber } from '../models/subscriber';
import { verifyUnsubscribeToken } from '../utils/unsubscribe';
import { getSetting } from '../models/settings';
import { config } from '../config';

async function brandName(): Promise<string> {
  const vars = (await getSetting('template_variables', {})) as Record<string, string>;
  const name = vars.product_name || (await getSetting('from_name', config.fromName));
  return String(name || 'Unsubscribe').replace(/[&<>"']/g, '');
}

const router = Router();

router.get('/:id/:token', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const token = req.params.token as string;

    if (!verifyUnsubscribeToken(id, token)) {
      return res.status(400).send(unsubscribePage('Invalid unsubscribe link.', false));
    }

    const subscriber = await Subscriber.findById(id);
    if (!subscriber) {
      return res.status(404).send(unsubscribePage('Subscriber not found.', false));
    }

    if (subscriber.status === 'unsubscribed') {
      return res.send(unsubscribePage('You are already unsubscribed.', true));
    }

    res.send(unsubscribePage(
      `Are you sure you want to unsubscribe <strong>${subscriber.email}</strong>?`,
      false,
      true,
      await brandName(),
    ));
  } catch (error: any) {
    res.status(500).send(unsubscribePage('An error occurred.', false));
  }
});

router.post('/:id/:token', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const token = req.params.token as string;

    if (!verifyUnsubscribeToken(id, token)) {
      return res.status(400).send(unsubscribePage('Invalid unsubscribe link.', false));
    }

    await Subscriber.findByIdAndUpdate(id, {
      $set: { status: 'unsubscribed' },
    });

    res.send(unsubscribePage('You have been successfully unsubscribed. You will no longer receive marketing emails from us.', true, false, await brandName()));
  } catch (error: any) {
    res.status(500).send(unsubscribePage('An error occurred.', false));
  }
});

function unsubscribePage(message: string, success: boolean, showButton = false, brand = 'Unsubscribe'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - ${brand}</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
    h2 { color: #333; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
    .btn { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 16px; }
    .btn:hover { background: #dc2626; }
    .success { color: #22c55e; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${brand}</h2>
    <p${success ? ' class="success"' : ''}>${message}</p>
    ${showButton ? '<form method="POST"><button type="submit" class="btn">Unsubscribe</button></form>' : ''}
  </div>
</body>
</html>`;
}

export { router as unsubscribeRoutes };
