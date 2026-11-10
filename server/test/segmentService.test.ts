import { describe, it, expect } from 'vitest';
import { buildSegmentQuery, getSegmentSubscribers } from '../src/services/segmentService';
import { Subscriber } from '../src/models/subscriber';
import { Segment } from '../src/models/segment';

const q = (operator: 'AND' | 'OR', conditions: any[]) =>
  buildSegmentQuery({ rules: { operator, conditions } } as any);

describe('buildSegmentQuery', () => {
  it('defaults to active-only when there are no conditions', () => {
    expect(buildSegmentQuery({ rules: { operator: 'AND', conditions: [] } } as any)).toEqual({ status: 'active' });
  });

  it('wraps equals conditions with status=active under AND', () => {
    expect(q('AND', [{ field: 'plan_tier', operator: 'equals', value: 'pro' }]))
      .toEqual({ $and: [{ status: 'active' }, { $and: [{ plan_tier: 'pro' }] }] });
  });

  it('supports OR with multiple conditions', () => {
    expect(q('OR', [
      { field: 'country', operator: 'equals', value: 'US' },
      { field: 'country', operator: 'equals', value: 'CA' },
    ])).toEqual({ $and: [{ status: 'active' }, { $or: [{ country: 'US' }, { country: 'CA' }] }] });
  });

  it('coerces numeric, regex (contains) and array (in) operators', () => {
    expect(q('AND', [{ field: 'usage_count', operator: 'gt', value: '5' }]))
      .toEqual({ $and: [{ status: 'active' }, { $and: [{ usage_count: { $gt: 5 } }] }] });
    expect(q('AND', [{ field: 'email', operator: 'contains', value: 'gmail' }]))
      .toEqual({ $and: [{ status: 'active' }, { $and: [{ email: { $regex: 'gmail', $options: 'i' } }] }] });
    expect(q('AND', [{ field: 'plan_tier', operator: 'in', value: ['pro', 'free'] }]))
      .toEqual({ $and: [{ status: 'active' }, { $and: [{ plan_tier: { $in: ['pro', 'free'] } }] }] });
  });
});

describe('getSegmentSubscribers', () => {
  it('returns only matching ACTIVE subscribers', async () => {
    await Subscriber.create([
      { email: 'a@x.com', plan_tier: 'pro', status: 'active' },
      { email: 'b@x.com', plan_tier: 'free', status: 'active' },
      { email: 'c@x.com', plan_tier: 'pro', status: 'unsubscribed' },
    ]);
    const seg = await Segment.create({
      name: 'pro',
      rules: { operator: 'AND', conditions: [{ field: 'plan_tier', operator: 'equals', value: 'pro' }] },
    });
    const { total, subscribers } = await getSegmentSubscribers(String(seg._id), 1, 50);
    expect(total).toBe(1); // the unsubscribed pro is excluded
    expect(subscribers[0].email).toBe('a@x.com');
  });
});
