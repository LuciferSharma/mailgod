import { z } from 'zod';

export const createFlowSchema = z.object({
  name: z.string().min(1, 'Flow name is required'),
  description: z.string().optional().default(''),
  trigger: z.object({
    type: z.enum(['event', 'segment_entry', 'date', 'manual', 'recurring']).optional().default('manual'),
    config: z.record(z.string(), z.any()).optional().default({}),
  }).optional().default({ type: 'manual', config: {} }),
});
