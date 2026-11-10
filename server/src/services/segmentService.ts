import { Subscriber, ISubscriber } from '../models/subscriber';
import { Segment, ISegment, ISegmentCondition } from '../models/segment';
import type { FilterQuery } from 'mongoose';

function buildConditionQuery(condition: ISegmentCondition): FilterQuery<ISubscriber> {
  const { field, operator, value } = condition;

  switch (operator) {
    case 'equals':
      return { [field]: value };
    case 'not_equals':
      return { [field]: { $ne: value } };
    case 'contains':
      return { [field]: { $regex: value, $options: 'i' } };
    case 'not_contains':
      return { [field]: { $not: { $regex: value, $options: 'i' } } };
    case 'gt':
      return { [field]: { $gt: Number(value) } };
    case 'gte':
      return { [field]: { $gte: Number(value) } };
    case 'lt':
      return { [field]: { $lt: Number(value) } };
    case 'lte':
      return { [field]: { $lte: Number(value) } };
    case 'in':
      return { [field]: { $in: Array.isArray(value) ? value : [value] } };
    case 'not_in':
      return { [field]: { $nin: Array.isArray(value) ? value : [value] } };
    case 'exists':
      return { [field]: { $exists: true, $ne: null } };
    case 'not_exists':
      return { [field]: { $exists: false } };
    case 'before':
      return { [field]: { $lt: new Date(value) } };
    case 'after':
      return { [field]: { $gt: new Date(value) } };
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        return { [field]: { $gte: new Date(value[0]), $lte: new Date(value[1]) } };
      }
      return {};
    default:
      return {};
  }
}

export function buildSegmentQuery(segment: ISegment): FilterQuery<ISubscriber> {
  const { rules } = segment;
  if (!rules.conditions || rules.conditions.length === 0) {
    return { status: 'active' };
  }

  const conditionQueries = rules.conditions.map(buildConditionQuery);

  const logicQuery = rules.operator === 'OR'
    ? { $or: conditionQueries }
    : { $and: conditionQueries };

  return { $and: [{ status: 'active' }, logicQuery] };
}

export async function getSegmentSubscribers(
  segmentId: string,
  page = 1,
  limit = 50
): Promise<{ subscribers: ISubscriber[]; total: number }> {
  const segment = await Segment.findById(segmentId);
  if (!segment) throw new Error('Segment not found');

  const query = buildSegmentQuery(segment);
  const [subscribers, total] = await Promise.all([
    Subscriber.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ created_at: -1 }),
    Subscriber.countDocuments(query),
  ]);

  return { subscribers, total };
}

export async function refreshSegmentCount(segmentId: string): Promise<number> {
  const segment = await Segment.findById(segmentId);
  if (!segment) throw new Error('Segment not found');

  const query = buildSegmentQuery(segment);
  const count = await Subscriber.countDocuments(query);

  await Segment.findByIdAndUpdate(segmentId, {
    subscriber_count: count,
    last_computed_at: new Date(),
  });

  return count;
}

export async function evaluateSubscriberAgainstSegment(
  subscriberId: string,
  segmentId: string
): Promise<boolean> {
  const segment = await Segment.findById(segmentId);
  if (!segment) return false;

  const query = buildSegmentQuery(segment);
  const match = await Subscriber.findOne({
    ...query,
    _id: subscriberId,
  });

  return !!match;
}
