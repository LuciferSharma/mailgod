import { z } from 'zod';

const conditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'exists', 'not_exists', 'before', 'after', 'between']),
  value: z.any(),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1, 'Segment name is required'),
  description: z.string().optional().default(''),
  rules: z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(conditionSchema).min(1, 'At least one condition is required'),
  }),
});
