export type InboxBadgeKind = 'needs_reply' | 'their_reply' | 'your_reply';

const STORAGE_KEY = 'qrm:inbox-dismissed-badges';

/** threadKey → badge kind → dismissed-at ISO timestamp */
export type DismissedBadgesStore = Record<string, Partial<Record<InboxBadgeKind, string>>>;

function loadStore(): DismissedBadgesStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as DismissedBadgesStore;
  } catch {
    return {};
  }
}

export function getDismissedBadgesStore(): DismissedBadgesStore {
  return loadStore();
}

export function dismissInboxBadge(threadKey: string, badge: InboxBadgeKind): void {
  const store = loadStore();
  const entry = { ...(store[threadKey] || {}), [badge]: new Date().toISOString() };
  store[threadKey] = entry;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Badge stays hidden until activity on that badge happens after dismiss time. */
export function isInboxBadgeDismissed(
  threadKey: string,
  badge: InboxBadgeKind,
  activityAt: string | null | undefined,
  store: DismissedBadgesStore,
): boolean {
  const dismissedAt = store[threadKey]?.[badge];
  if (!dismissedAt) return false;
  if (!activityAt) return true;
  return new Date(dismissedAt) >= new Date(activityAt);
}
