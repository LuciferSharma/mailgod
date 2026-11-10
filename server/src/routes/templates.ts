import { Router, Request, Response } from 'express';
import Handlebars from 'handlebars';
import { Template } from '../models/template';
import { sendEmail, getTemplateVariables } from '../services/emailService';
import { validate } from '../middleware/validate';
import { createTemplateSchema } from '../schemas/template';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: Function) => {
  try {
    const templates = await Template.find().sort({ created_at: -1 });
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createTemplateSchema), async (req: Request, res: Response, next: Function) => {
  try {
    const { html_content } = req.body;
    const variables = extractVariables(html_content || '');
    const template = await Template.create({ ...req.body, variables });
    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/duplicate', async (req: Request, res: Response, next: Function) => {
  try {
    const source = await Template.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ error: 'Not found' });

    const requestedName = (req.body?.name || '').toString().trim();
    const newName = requestedName || `${source.name} (copy)`;

    const copy = await Template.create({
      name: newName,
      subject: source.subject,
      html_content: source.html_content,
      preview_text: source.preview_text,
      category: source.category,
      variables: source.variables,
    });

    res.status(201).json(copy);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    if (req.body.html_content) {
      req.body.variables = extractVariables(req.body.html_content);
    }
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    await Template.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/preview', async (req: Request, res: Response, next: Function) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Not found' });

    const globalVars = await getTemplateVariables();
    const sampleVars = {
      ...globalVars,
      name: 'John Doe',
      first_name: 'John',
      email: 'john@example.com',
      plan_tier: 'free',
      unsubscribe_url: '#',
      ...req.body.variables,
    };

    const html = Handlebars.compile(template.html_content)(sampleVars);
    const subject = Handlebars.compile(template.subject)(sampleVars);

    res.json({ html, subject });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test-send', async (req: Request, res: Response, next: Function) => {
  try {
    const email = req.body.email as string;
    const variables = req.body.variables;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { Subscriber } = await import('../models/subscriber');
    let subscriber = await Subscriber.findOne({ email });

    if (!subscriber) {
      subscriber = await Subscriber.create({ email: String(email), name: 'Test User', status: 'active' });
    }

    const result = await sendEmail({
      subscriberId: subscriber._id.toString(),
      templateId: req.params.id as string,
      variables,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

function extractVariables(html: string): string[] {
  const matches = html.match(/\{\{([^}]+)\}\}/g) || [];
  const vars = new Set(
    matches.map(m => m.replace(/\{\{|\}\}/g, '').trim().split(' ')[0])
  );
  return Array.from(vars);
}

export { router as templateRoutes };
