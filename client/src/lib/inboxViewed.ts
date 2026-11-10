import type { InboxConversation, InboxRecipientRow } from '../types';

const STORAGE_KEY = 'qrm:inbox-viewed';

export type InboxThreadRef = {
  type: string;
  id: string;
  flow_node_id?: string | null;
  subscriber_id: string;
};

export function inboxThreadKey(ref: InboxThreadRef): string {
  return `${ref.type}:${ref.id}:${ref.flow_node_id || ''}:${ref.subscriber_id}`;
}

function loadStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function markInboxThreadViewed(ref: InboxThreadRef): void {
  const key = inboxThreadKey(ref);
  const store = loadStore();
  store[key] = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

export function getInboxViewedStore(): Record<string, string> {
  return loadStore();
}

/** True when the thread has activity newer than the last time you opened it. */
export function recipientHasNewActivity(
  r: InboxRecipientRow,
  viewedAtIso: string | undefined,
): boolean {
  const times = [r.last_reply_at, r.last_user_reply_at, r.latest_outbound_at]
    .filter((t): t is string => !!t)
    .map(t => new Date(t).getTime());
  if (!viewedAtIso) return times.length > 0;
  const viewedMs = new Date(viewedAtIso).getTime();
  if (times.length === 0) return false;
  return Math.max(...times) > viewedMs;
}

export function threadRefFromConv(
  conv: InboxConversation,
  subscriberId: string,
): InboxThreadRef {
  return {
    type: conv.type,
    id: conv.id,
    flow_node_id: conv.flow_node_id,
    subscriber_id: subscriberId,
  };
}
