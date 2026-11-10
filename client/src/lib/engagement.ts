import type { Subscriber } from '../types';

export type EngagementBand = 'vip' | 'hot' | 'warm' | 'cool' | 'cold' | 'at_risk';
export type EngagementActivity = 'active' | 'recent' | 'stale';

export const BAND_META: Record<EngagementBand, { label: string; emoji: string; color: string; bg: string }> = {
  vip:     { label: 'VIP',     emoji: '🔥', color: 'text-red-500',     bg: 'bg-red-500/15' },
  hot:     { label: 'Hot',     emoji: '⭐', color: 'text-orange-500',  bg: 'bg-orange-500/15' },
  warm:    { label: 'Warm',    emoji: '👍', color: 'text-yellow-500',  bg: 'bg-yellow-500/15' },
  cool:    { label: 'Cool',    emoji: '💤', color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  cold:    { label: 'Cold',    emoji: '❄️', color: 'text-zinc-500',    bg: 'bg-zinc-500/15' },
  at_risk: { label: 'At risk', emoji: '⚠️', color: 'text-red-500',     bg: 'bg-red-500/10' },
};

export function displayScore(sub: Pick<Subscriber, 'engagement_score' | 'engagement_silence_penalty' | 'engagement_score_manual'>): number {
  return (sub.engagement_score || 0) + (sub.engagement_silence_penalty || 0) + (sub.engagement_score_manual || 0);
}

export function bandFor(score: number): EngagementBand {
  if (score < 0) return 'at_risk';
  if (score === 0) return 'cold';
  if (score < 30) return 'cool';
  if (score < 100) return 'warm';
  if (score < 300) return 'hot';
  return 'vip';
}

export function activityFor(lastEventAt: string | null | undefined): EngagementActivity {
  if (!lastEventAt) return 'stale';
  const days = (Date.now() - new Date(lastEventAt).getTime()) / 86_400_000;
  if (days <= 30) return 'active';
  if (days <= 90) return 'recent';
  return 'stale';
}

export function relativeTimeShort(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
