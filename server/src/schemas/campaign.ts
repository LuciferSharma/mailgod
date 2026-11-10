import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  subject: z.string().min(1, 'Subject is required'),
  segment_id: z.string().min(1, 'Segment is required'),
  template_id: z.string().min(1, 'Template is required'),
  send_config: z.object({
    batch_size: z.number().int().positive().optional().default(100),
    emails_per_hour: z.number().int().positive().optional().default(1000),
  }).optional().default({ batch_size: 100, emails_per_hour: 1000 }),
});
