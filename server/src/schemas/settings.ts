import { z } from 'zod';

export const updateSettingsSchema = z.record(z.string(), z.any()).refine(
  (val) => Object.keys(val).length > 0,
  { message: 'At least one setting is required' }
);
