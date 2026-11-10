import { Subscriber } from '../models/subscriber';

export type EngagementEvent = 'open' | 'click' | 'reply' | 'bounce' | 'unsubscribe' | 'spam';

const POINTS: Record<EngagementEvent, number> = {
  open: 1,
  click: 10,
  reply: 50,
  bounce: -5,
  unsubscribe: -100,
  spam: -200,
};

const POSITIVE: Set<EngagementEvent> = new Set(['open', 'click', 'reply']);

/**
 * Apply an engagement event to a subscriber's score.
 * - Increments engagement_score by the event's weight
 * - For positive events (open/click/reply), updates engagement_last_event_at
 *
 * Failures are logged but do not throw — score is not safety-critical.
 * The originating event (EmailEvent / Message) is the source of truth.
 */
export async function applyEngagementEvent(
  subscriberId: string | null | undefined,
  event: EngagementEvent
): Promise<void> {
  if (!subscriberId) return;
  const delta = POINTS[event];
  if (delta === undefined) return;

  const update: any = { $inc: { engagement_score: delta } };
  if (POSITIVE.has(event)) {
    update.$set = { engagement_last_event_at: new Date() };
  }

  try {
    await Subscriber.findByIdAndUpdate(subscriberId, update);
  } catch (err) {
    console.error(`[engagement] failed to apply ${event} (${delta}) to ${subscriberId}:`, err);
  }
}

/**
 * Compute display score = base + silence + manual.
 * Used by routes that need the effective score without joining math in client code.
 */
export function computeDisplayScore(sub: {
  engagement_score?: number;
  engagement_silence_penalty?: number;
  engagement_score_manual?: number;
}): number {
  return (sub.engagement_score || 0) + (sub.engagement_silence_penalty || 0) + (sub.engagement_score_manual || 0);
}

export type EngagementBand = 'vip' | 'hot' | 'warm' | 'cool' | 'cold' | 'at_risk';

export function bandFor(score: number): EngagementBand {
  if (score < 0) return 'at_risk';
  if (score === 0) return 'cold';
  if (score < 30) return 'cool';
  if (score < 100) return 'warm';
  if (score < 300) return 'hot';
  return 'vip';
}

export function scoreRangeForBand(band: EngagementBand): { min?: number; max?: number } {
  switch (band) {
    case 'at_risk': return { max: -1 };
    case 'cold': return { min: 0, max: 0 };
    case 'cool': return { min: 1, max: 29 };
    case 'warm': return { min: 30, max: 99 };
    case 'hot': return { min: 100, max: 299 };
    case 'vip': return { min: 300 };
  }
}

export type EngagementActivity = 'active' | 'recent' | 'stale';

export function activityFor(lastEventAt: Date | null | undefined): EngagementActivity {
  if (!lastEventAt) return 'stale';
  const days = (Date.now() - new Date(lastEventAt).getTime()) / 86_400_000;
  if (days <= 30) return 'active';
  if (days <= 90) return 'recent';
  return 'stale';
}

export function activityDateRangeFor(activity: EngagementActivity): { after?: Date; before?: Date; nullOk?: boolean } {
  const now = Date.now();
  const day = 86_400_000;
  switch (activity) {
    case 'active': return { after: new Date(now - 30 * day) };
    case 'recent': return { after: new Date(now - 90 * day), before: new Date(now - 30 * day) };
    case 'stale': return { before: new Date(now - 90 * day), nullOk: true };
  }
}
