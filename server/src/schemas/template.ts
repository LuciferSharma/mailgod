import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  html_content: z.string().optional().default(''),
  preview_text: z.string().optional().default(''),
  category: z.string().optional().default('marketing'),
  variables: z.array(z.string()).optional().default([]),
});
