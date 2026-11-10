import { z } from 'zod';

export const createSubscriberSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().optional().default(''),
  country: z.string().optional().default(''),
  language: z.string().optional().default(''),
  plan_tier: z.string().optional().default('free'),
  signup_source: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  custom_attributes: z.record(z.string(), z.any()).optional().default({}),
});

export const updateSubscriberSchema = z.object({
  name: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  plan_tier: z.string().optional(),
  signup_source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  custom_attributes: z.record(z.string(), z.any()).optional(),
  status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
});

export const addTagsSchema = z.object({
  tags: z.array(z.string().min(1)).min(1, 'At least one tag is required'),
});
