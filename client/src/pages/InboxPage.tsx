import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  Inbox, Star, StarOff, Bell, FileEdit, Tag, Mail, Reply,
  ArrowLeft, Search, RefreshCw, Loader2, MessageSquare, Pin,
  CheckCircle2, Circle, Send, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { inboxApi, pipelineApi } from '../api';
import type { InboxConversation, InboxRecipientRow, InboxRenderedMessage } from '../types';
import StagePicker from '../components/inbox/StagePicker';
import PageHint from '../components/PageHint';
import ComposeModal from '../components/inbox/ComposeModal';
import DraftDetail from '../components/inbox/DraftDetail';
import NotesPanel from '../components/inbox/NotesPanel';
import ReminderButton from '../components/inbox/ReminderButton';
import TagEditor from '../components/inbox/TagEditor';
import RemindersList from '../components/inbox/RemindersList';
import ReplyComposer, { ComposerMode } from '../components/inbox/ReplyComposer';
import { bandFor, BAND_META } from '../lib/engagement';
import { pluralize } from '../lib/plural';
import {
  getInboxViewedStore,
  markInboxThreadViewed,
  recipientHasNewActivity,
  threadRefFromConv,
  inboxThreadKey,
  type InboxThreadRef,
} from '../lib/inboxViewed';
import {
  dismissInboxBadge,
  getDismissedBadgesStore,
  isInboxBadgeDismissed,
  type DismissedBadgesStore,
  type InboxBadgeKind,
} from '../lib/inboxDismissed';
import type { LucideIcon } from 'lucide-react';
import { Archive, ReplyAll, Forward as ForwardIcon, ChevronDown, ChevronRight, PanelRight } from 'lucide-react';
import ProspectPanel from '../components/inbox/ProspectPanel';
import OverflowMenu, { StageChip } from '../components/inbox/OverflowMenu';
import { useLocation } from 'react-router-dom';

type FilterValue = 'all' | 'starred' | 'unread' | 'replies' | 'reminders' | 'drafts' | 'archived';
type SourceValue = '' | 'campaign' | 'flow' | 'one_off';

const RECIPIENTS_PAGE_SIZE = 30;

export default function InboxPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceValue>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [openRecipient, setOpenRecipient] = useState<InboxRecipientRow | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [viewedStore, setViewedStore] = useState(() => getInboxViewedStore());
  const [dismissedBadges, setDismissedBadges] = useState(() => getDismissedBadgesStore());
  const location = useLocation();

  const markThreadViewed = useCallback((ref: InboxThreadRef) => {
    markInboxThreadViewed(ref);
    setViewedStore(getInboxViewedStore());
  }, []);

  const dismissBadge = useCallback((threadKey: string, badge: InboxBadgeKind) => {
    dismissInboxBadge(threadKey, badge);
    setDismissedBadges(getDismissedBadgesStore());
  }, []);

  // Deep-link from the Pipeline board: open a specific conversation + recipient.
  useEffect(() => {
    const open = (location.state as any)?.open;
    if (!open?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const conv = await inboxApi.conversationDetail(open.type, open.id, open.flow_node_id || undefined);
        if (cancelled || !conv) return;
        setSelected(conv as InboxConversation);
        inboxApi.markRead(open.type, open.id, open.flow_node_id || undefined)
          .then(() => {
            qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
            qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
          })
          .catch(() => {});
        if (open.subscriber_id) {
          const recips = await inboxApi.recipients(open.type, open.id, {
            flow_node_id: open.flow_node_id || undefined,
            limit: 200,
          });
          const row = recips.data.find(r => r.subscriber_id === open.subscriber_id);
          if (!cancelled && row) {
            setOpenRecipient(row);
            markThreadViewed(threadRefFromConv(conv as InboxConversation, open.subscriber_id));
          }
        }
      } catch { /* fall back to the inbox list */ }
      // Clear nav state so a refresh/back doesn't re-trigger the deep-link.
      try { window.history.replaceState({}, ''); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const { data: convListResp, isLoading } = useQuery({
    queryKey: ['inbox-conversations', filter, sourceFilter, tagFilter],
    queryFn: () =>
      inboxApi.conversations({
        filter,
        source: sourceFilter || undefined,
        tag: tagFilter || undefined,
      }),
    refetchInterval: 15000,
  });

  const { data: tags } = useQuery({
    queryKey: ['inbox-tags'],
    queryFn: inboxApi.tags,
  });

  const conversations = useMemo(() => {
    const all = convListResp?.data || [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      c => c.subject.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  }, [convListResp, search]);

  const starMutation = useMutation({
    mutationFn: (c: InboxConversation) => inboxApi.toggleStar(c.type, c.id, c.flow_node_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox-conversations'] }),
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ conv, tag }: { conv: InboxConversation; tag: string }) =>
      inboxApi.updateTags(conv.type, conv.id, { remove: [tag] }, conv.flow_node_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      qc.invalidateQueries({ queryKey: ['inbox-tags'] });
      qc.invalidateQueries({ queryKey: ['inbox-conv-detail'] });
    },
    onError: () => toast.error('Failed to remove tag'),
  });

  const handleSelectConversation = (c: InboxConversation) => {
    setSelected(c);
    setOpenRecipient(null);
    inboxApi.markRead(c.type, c.id, c.flow_node_id).then(() => {
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] });
    });
  };

  return (
    <div className="h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] min-h-0 flex overflow-hidden bg-zinc-950 text-heading -m-6">
      {/* Pane 1: Filters */}
      <aside className="w-56 border-r border-line bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-line">
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors"
          >
            <FileEdit className="w-4 h-4" /> Compose
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <FilterButton current={filter} value="all" icon={Inbox} label="All" onClick={setFilter} />
          <FilterButton current={filter} value="starred" icon={Star} label="Starred" onClick={setFilter} />
          <FilterButton current={filter} value="unread" icon={Mail} label="Unread" onClick={setFilter} />
          <FilterButton current={filter} value="replies" icon={Reply} label="Replies" onClick={setFilter} />
          <FilterButton current={filter} value="reminders" icon={Bell} label="Reminders" onClick={setFilter} />
          <FilterButton current={filter} value="drafts" icon={FileEdit} label="Drafts" onClick={setFilter} />
          <FilterButton current={filter} value="archived" icon={Archive} label="Archived" onClick={setFilter} />

          <div className="mt-4 mb-1 px-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Tags</div>
          <button
            onClick={() => setTagFilter('')}
            className={`w-full text-left px-3 py-1.5 rounded text-sm ${
              !tagFilter ? 'bg-blue-500/15 text-blue-500' : 'text-subtle hover:bg-elevated'
            }`}
          >
            All tags
          </button>
          {(tags || []).map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${
                tagFilter === t ? 'bg-blue-500/15 text-blue-500' : 'text-subtle hover:bg-elevated'
              }`}
            >
              <Tag className="w-3 h-3" /> #{t}
            </button>
          ))}

          <div className="mt-4 mb-1 px-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Sources</div>
          <SourceButton current={sourceFilter} value="" label="All sources" onClick={setSourceFilter} />
          <SourceButton current={sourceFilter} value="campaign" label="Campaigns" onClick={setSourceFilter} />
          <SourceButton current={sourceFilter} value="flow" label="Flow steps" onClick={setSourceFilter} />
          <SourceButton current={sourceFilter} value="one_off" label="One-offs" onClick={setSourceFilter} />
        </nav>
      </aside>

      {/* Pane 2: Conversation list */}
      <section className="w-96 border-r border-line bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-line">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-line bg-field placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filter === 'reminders' ? (
            <RemindersList onOpenConversation={handleSelectConversation} />
          ) : isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-dim" /></div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-subtle">
              <Inbox className="w-10 h-10 mx-auto text-dim mb-2" />
              No conversations yet.
            </div>
          ) : (
            conversations.map(c => (
              <ConversationRow
                key={`${c.type}-${c.id}-${c.flow_node_id || ''}`}
                c={c}
                active={selected?.id === c.id && selected?.type === c.type && selected?.flow_node_id === c.flow_node_id}
                onClick={() => handleSelectConversation(c)}
                onStar={(e) => { e.stopPropagation(); starMutation.mutate(c); }}
                onRemoveTag={(tag) => removeTagMutation.mutate({ conv: c, tag })}
              />
            ))
          )}
        </div>
      </section>

      {/* Pane 3: Detail */}
      <section className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!selected ? (
          <EmptyDetail />
        ) : openRecipient ? (
          <RecipientThread
            key={`${selected.type}-${selected.id}-${selected.flow_node_id || ''}-${openRecipient.subscriber_id}`}
            conv={selected}
            recipient={openRecipient}
            onBack={() => setOpenRecipient(null)}
            markThreadViewed={markThreadViewed}
          />
        ) : isOneOffDraft(selected) ? (
          <DraftDetail
            conv={selected}
            onSent={() => {
              qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
              setSelected(null);
            }}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <ConversationDetail
            conv={selected}
            onOpenRecipient={(r) => {
              markThreadViewed(threadRefFromConv(selected, r.subscriber_id));
              setOpenRecipient(r);
            }}
            onTagsChanged={() => qc.invalidateQueries({ queryKey: ['inbox-tags'] })}
            viewedStore={viewedStore}
            dismissedBadges={dismissedBadges}
            onDismissBadge={dismissBadge}
            onRemoveTag={(tag) => removeTagMutation.mutate({ conv: selected, tag })}
          />
        )}
      </section>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
            toast.success('Email sent');
          }}
        />
      )}
    </div>
  );
}

function isOneOffDraft(c: InboxConversation): boolean {
  return c.type === 'one_off' && (c.is_draft === true || c.source_label === 'Draft');
}

function FilterButton({ current, value, icon: Icon, label, onClick }: any) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${
        active ? 'bg-blue-500/15 text-blue-500 font-medium' : 'text-subtle hover:bg-elevated'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function SourceButton({ current, value, label, onClick }: any) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`w-full text-left px-3 py-1.5 rounded text-sm ${
        active ? 'bg-blue-500/15 text-blue-500 font-medium' : 'text-subtle hover:bg-elevated'
      }`}
    >
      {label}
    </button>
  );
}

function ConversationRow({
  c, active, onClick, onStar, onRemoveTag,
}: {
  c: InboxConversation;
  active: boolean;
  onClick: () => void;
  onStar: (e: React.MouseEvent) => void;
  onRemoveTag: (tag: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-3 py-2.5 border-b border-line cursor-pointer transition-colors ${
        active ? 'bg-blue-500/10' : 'hover:bg-elevated'
      } ${c.unread ? 'border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}
    >
      <div className="flex items-start gap-2">
        <button onClick={onStar} className="mt-0.5 shrink-0">
          {c.inbox_starred ? (
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          ) : (
            <StarOff className="w-3.5 h-3.5 text-dim hover:text-yellow-500" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={`text-sm truncate ${c.unread ? 'font-semibold text-heading' : 'text-body'}`}>
              {c.subject}
            </h3>
            {c.inbox_last_message_at && (
              <span className="text-[10px] text-dim shrink-0">{relativeTime(c.inbox_last_message_at)}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-subtle">
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-elevated text-dim">{c.source_label}</span>
            <span>{pluralize(c.recipient_count, 'recipient')}</span>
            {c.reply_count > 0 && (
              <span className="text-blue-500 font-medium">· {pluralize(c.reply_count, 'reply', 'replies')}</span>
            )}
          </div>
          {c.preview && (
            <p className="text-xs text-dim mt-1 line-clamp-2">{c.preview}</p>
          )}
          {c.inbox_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {c.inbox_tags.map(t => (
                <RemovableChip
                  key={t}
                  label={`#${t}`}
                  onRemove={() => onRemoveTag(t)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
      <MessageSquare className="w-14 h-14 text-dim mb-3" />
      <h3 className="text-base font-semibold text-heading">Select a conversation</h3>
      <p className="text-sm text-subtle mt-1 max-w-sm">
        Pick any conversation on the left to see who got it, who replied, and the full thread for each recipient.
      </p>
    </div>
  );
}

function ConversationDetail({
  conv, onOpenRecipient, onTagsChanged, viewedStore, dismissedBadges, onDismissBadge, onRemoveTag,
}: {
  conv: InboxConversation;
  onOpenRecipient: (r: InboxRecipientRow) => void;
  onTagsChanged: () => void;
  viewedStore: Record<string, string>;
  dismissedBadges: DismissedBadgesStore;
  onDismissBadge: (threadKey: string, badge: InboxBadgeKind) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const qc = useQueryClient();
  const [repliedOnly, setRepliedOnly] = useState(false);
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const [unviewedOnly, setUnviewedOnly] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedRecipientSearch(recipientSearch.trim()), 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [recipientSearch]);

  const { data: detail } = useQuery({
    queryKey: ['inbox-conv-detail', conv.type, conv.id, conv.flow_node_id],
    queryFn: () => inboxApi.conversationDetail(conv.type, conv.id, conv.flow_node_id),
  });

  const [stageFilter, setStageFilter] = useState<string>('');
  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages(),
    staleTime: 300_000,
  });

  const {
    data: recipPages,
    isLoading: recipLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'inbox-recipients',
      conv.type,
      conv.id,
      conv.flow_node_id,
      repliedOnly,
      needsReplyOnly,
      stageFilter,
      debouncedRecipientSearch,
    ],
    queryFn: ({ pageParam }) =>
      inboxApi.recipients(conv.type, conv.id, {
        page: pageParam,
        limit: RECIPIENTS_PAGE_SIZE,
        flow_node_id: conv.flow_node_id || undefined,
        replied_only: repliedOnly ? 'true' : undefined,
        needs_reply_only: needsReplyOnly ? 'true' : undefined,
        stage: stageFilter || undefined,
        search: debouncedRecipientSearch || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
  });

  const recipMeta = recipPages?.pages[0];
  const allRecipients = useMemo(
    () => recipPages?.pages.flatMap(p => p.data) ?? [],
    [recipPages],
  );

  const visibleRecipients = useMemo(() => {
    if (!unviewedOnly) return allRecipients;
    return allRecipients.filter(r => {
      const key = inboxThreadKey(threadRefFromConv(conv, r.subscriber_id));
      return recipientHasNewActivity(r, viewedStore[key]);
    });
  }, [allRecipients, unviewedOnly, viewedStore, conv]);

  const loadedCount = allRecipients.length;
  const totalCount = recipMeta?.total ?? 0;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = loadMoreRef.current;
    if (!root || !sentinel || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { root, rootMargin: '160px' },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, loadedCount, visibleRecipients.length]);

  // When "Unviewed" is on, keep loading pages until we find matches or run out.
  useEffect(() => {
    if (!unviewedOnly || recipLoading || isFetchingNextPage || !hasNextPage) return;
    if (visibleRecipients.length === 0 && loadedCount > 0) {
      fetchNextPage();
    }
  }, [unviewedOnly, visibleRecipients.length, loadedCount, hasNextPage, isFetchingNextPage, recipLoading, fetchNextPage]);

  const setStageMut = useMutation({
    mutationFn: ({ subscriber_id, stage_id }: { subscriber_id: string; stage_id: string | null }) =>
      pipelineApi.setStage({
        subscriber_id,
        source_type: conv.type,
        source_id: conv.id,
        flow_node_id: conv.flow_node_id || null,
        stage_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-recipients', conv.type, conv.id, conv.flow_node_id] });
      qc.invalidateQueries({ queryKey: ['pipeline-board'] });
    },
    onError: () => toast.error('Failed to update stage'),
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="border-b border-line px-5 py-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-subtle mb-0.5">
            <span className="px-1.5 py-0.5 rounded bg-elevated">{conv.source_label}</span>
            <span>{pluralize(conv.recipient_count, 'recipient')}</span>
            {conv.reply_count > 0 && (
              <button
                onClick={() => setRepliedOnly(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  repliedOnly
                    ? 'bg-emerald-500/20 text-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                }`}
                title={repliedOnly ? 'Show all recipients' : 'Show only recipients who replied to you'}
              >
                <Reply className="w-3 h-3" />
                They replied · {pluralize(conv.reply_count, 'reply', 'replies')}
                {repliedOnly && <span className="text-[10px] ml-0.5">(filtered)</span>}
              </button>
            )}
            {(recipMeta?.total_needs_reply ?? 0) > 0 && (
              <button
                onClick={() => setNeedsReplyOnly(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  needsReplyOnly
                    ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/40'
                    : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                }`}
                title={needsReplyOnly ? 'Show all recipients' : 'Show only threads waiting for your reply'}
              >
                <Mail className="w-3 h-3" />
                Needs reply · {recipMeta?.total_needs_reply}
                {needsReplyOnly && <span className="text-[10px] ml-0.5">(filtered)</span>}
              </button>
            )}
          </div>
          <h2 className="text-base font-semibold text-heading truncate">{conv.subject}</h2>
          {conv.inbox_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {conv.inbox_tags.map(t => (
                <RemovableChip
                  key={t}
                  label={`#${t}`}
                  onRemove={() => onRemoveTag(t)}
                  className="bg-blue-500/10 text-blue-500"
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => inboxApi.toggleStar(conv.type, conv.id, conv.flow_node_id).then(() => { qc.invalidateQueries({ queryKey: ['inbox-conversations'] }); qc.invalidateQueries({ queryKey: ['inbox-conv-detail'] }); })}
            className="p-1.5 rounded hover:bg-elevated"
            title="Star"
          >
            {conv.inbox_starred
              ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              : <StarOff className="w-4 h-4 text-dim" />}
          </button>
          <ReminderButton conv={conv} />
          <TagEditor conv={conv} onChanged={() => { qc.invalidateQueries({ queryKey: ['inbox-conversations'] }); onTagsChanged(); }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="p-5 space-y-4">
          {detail?.preview && (
            <div className="text-sm text-subtle italic">Subject: {detail.preview}</div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <h3 className="text-xs font-semibold text-dim uppercase tracking-wider">
                {needsReplyOnly
                  ? 'Waiting for your reply'
                  : repliedOnly
                    ? 'Recipients who replied'
                    : 'Recipients'}
                {recipMeta && (
                  <span className="text-dim/60 ml-1.5">
                    ({unviewedOnly ? visibleRecipients.length : totalCount}
                    {unviewedOnly ? ' unviewed' : ''}
                    {!unviewedOnly && loadedCount < totalCount ? ` · ${loadedCount} loaded` : ''})
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-dim pointer-events-none" />
                  <input
                    type="search"
                    value={recipientSearch}
                    onChange={e => setRecipientSearch(e.target.value)}
                    placeholder="Search email or name…"
                    className="text-[11px] bg-field border border-field-line rounded pl-7 pr-2 py-1 w-40 text-body outline-none focus:border-blue-500/50"
                  />
                </div>
                <button
                  onClick={() => setUnviewedOnly(prev => !prev)}
                  className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider transition-colors ${
                    unviewedOnly
                      ? 'bg-blue-500/20 text-blue-500 ring-1 ring-blue-500/40'
                      : 'text-dim hover:text-body hover:bg-elevated'
                  }`}
                  title={unviewedOnly ? 'Show all' : 'Show only threads you have not opened yet'}
                >
                  Unviewed
                </button>
                {stages.length > 0 && (
                  <select
                    value={stageFilter}
                    onChange={e => setStageFilter(e.target.value)}
                    className="text-[11px] bg-field border border-field-line rounded px-1.5 py-0.5 text-body outline-none"
                    title="Filter by pipeline stage"
                  >
                    <option value="">All stages</option>
                    {stages.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                )}
                {(repliedOnly || needsReplyOnly || debouncedRecipientSearch) && (
                  <button
                    onClick={() => {
                      setRepliedOnly(false);
                      setNeedsReplyOnly(false);
                      setRecipientSearch('');
                    }}
                    className="text-[10px] text-blue-500 hover:underline uppercase tracking-wider"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
            {recipLoading ? (
              <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-dim" /></div>
            ) : !visibleRecipients.length ? (
              <p className="text-sm text-subtle py-4">
                {unviewedOnly
                  ? (hasNextPage ? 'Loading unviewed threads…' : 'No unviewed threads.')
                  : debouncedRecipientSearch
                    ? 'No recipients match your search.'
                    : 'No recipients yet.'}
              </p>
            ) : (
              <div className="rounded-lg border border-line overflow-hidden">
                <div className="px-4 py-2 border-b border-line bg-elevated/40 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-dim">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Needs your reply</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> They replied</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> You replied</span>
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-dim" /> Viewed</span>
                  <span className="inline-flex items-center gap-1"><Circle className="w-3 h-3 text-blue-500 fill-blue-500/30" /> Not opened</span>
                </div>
                {visibleRecipients.map(r => {
                  const hasTheirReply = r.reply_count > 0;
                  const hasYourReply = (r.user_reply_count || 0) > 0;
                  const needsReply = r.needs_reply;
                  const threadKey = inboxThreadKey(threadRefFromConv(conv, r.subscriber_id));
                  const isUnviewed = recipientHasNewActivity(r, viewedStore[threadKey]);
                  const isViewed = !isUnviewed && !!viewedStore[threadKey];

                  const showNeedsReply = needsReply && !isInboxBadgeDismissed(threadKey, 'needs_reply', r.last_reply_at, dismissedBadges);
                  const showTheirReply = hasTheirReply && !isInboxBadgeDismissed(threadKey, 'their_reply', r.last_reply_at, dismissedBadges);
                  const showYourReply = hasYourReply && !isInboxBadgeDismissed(threadKey, 'your_reply', r.last_user_reply_at, dismissedBadges);

                  let rowAccent = 'border-l-2 border-l-transparent';
                  let rowBg = '';
                  if (showNeedsReply) {
                    rowAccent = 'border-l-2 border-l-amber-500';
                    rowBg = 'bg-amber-500/[0.06]';
                  } else if (showTheirReply) {
                    rowAccent = 'border-l-2 border-l-emerald-500';
                    rowBg = 'bg-emerald-500/[0.04]';
                  }
                  if (isViewed && !showNeedsReply) {
                    rowBg = `${rowBg} opacity-75`.trim();
                  }

                  return (
                    <div
                      key={r.subscriber_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenRecipient(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenRecipient(r); } }}
                      className={`w-full text-left px-4 py-3 border-b border-line last:border-b-0 hover:bg-elevated/60 flex items-center justify-between gap-3 cursor-pointer ${rowAccent} ${rowBg}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          {isUnviewed && (
                            <span title="Not opened yet">
                              <Circle className="w-2.5 h-2.5 text-blue-500 fill-blue-500 shrink-0" />
                            </span>
                          )}
                          {isViewed && (
                            <span title="Opened">
                              <CheckCircle2 className="w-3.5 h-3.5 text-dim shrink-0" />
                            </span>
                          )}
                          {showNeedsReply && (
                            <DismissibleBadge
                              label="Needs reply"
                              icon={Mail}
                              className="bg-amber-500 text-white"
                              onDismiss={() => onDismissBadge(threadKey, 'needs_reply')}
                            />
                          )}
                          {showTheirReply && (
                            <DismissibleBadge
                              label="They replied"
                              icon={Reply}
                              className="bg-emerald-500 text-white"
                              onDismiss={() => onDismissBadge(threadKey, 'their_reply')}
                            />
                          )}
                          {showYourReply && (
                            <DismissibleBadge
                              label="You replied"
                              icon={Send}
                              className="bg-blue-500 text-white"
                              onDismiss={() => onDismissBadge(threadKey, 'your_reply')}
                            />
                          )}
                          <div className={`text-sm truncate ${isUnviewed ? 'font-semibold text-heading' : 'font-medium text-heading'}`}>
                            {r.email}
                          </div>
                          {typeof r.engagement_score === 'number' && r.engagement_score !== 0 && (() => {
                            const meta = BAND_META[bandFor(r.engagement_score)];
                            return (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${meta.bg} ${meta.color} shrink-0`} title={`Engagement ${meta.label}: ${r.engagement_score}`}>
                                {meta.emoji} {r.engagement_score}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-subtle truncate flex items-center gap-2">
                          {r.name && <span>{r.name}</span>}
                          {r.subscriber_tags?.length > 0 && (
                            <span className="text-dim">{r.subscriber_tags.join(', ')}</span>
                          )}
                          {showTheirReply && r.last_reply_at && (
                            <span className="text-emerald-500">
                              · their reply {new Date(r.last_reply_at).toLocaleString()}
                            </span>
                          )}
                          {showYourReply && r.last_user_reply_at && (
                            <span className="text-blue-500">
                              · you replied {new Date(r.last_user_reply_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StagePicker
                          stages={stages}
                          value={r.stage_id ?? null}
                          onChange={(stage_id) => setStageMut.mutate({ subscriber_id: r.subscriber_id, stage_id })}
                        />
                        <div className="text-right">
                          <StatusBadge status={r.latest_status} />
                          {showTheirReply && (
                            <div className="text-[11px] text-emerald-500 mt-1 font-semibold">
                              {pluralize(r.reply_count, 'their reply', 'their replies')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={loadMoreRef} className="h-1" aria-hidden />
              </div>
            )}
            {!recipLoading && loadedCount > 0 && (
              <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-dim">
                <span>
                  Showing {visibleRecipients.length}
                  {unviewedOnly ? ' unviewed' : ` of ${totalCount}`}
                  {loadedCount < totalCount && !unviewedOnly && ` (${loadedCount} loaded)`}
                </span>
                {hasNextPage ? (
                  <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex items-center gap-1 text-blue-500 hover:underline disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Loading…</>
                    ) : (
                      'Load more'
                    )}
                  </button>
                ) : loadedCount >= totalCount && totalCount > RECIPIENTS_PAGE_SIZE ? (
                  <span className="text-dim">All loaded</span>
                ) : null}
              </div>
            )}
          </div>

          <NotesPanel conv={conv} />
        </div>
      </div>
    </div>
  );
}

function RecipientThread({
  conv, recipient, onBack, markThreadViewed,
}: {
  conv: InboxConversation;
  recipient: InboxRecipientRow;
  onBack: () => void;
  markThreadViewed: (ref: InboxThreadRef) => void;
}) {
  const qc = useQueryClient();
  const threadRef = useMemo(
    () => threadRefFromConv(conv, recipient.subscriber_id),
    [conv, recipient.subscriber_id],
  );

  useEffect(() => {
    markThreadViewed(threadRef);
  }, [threadRef, markThreadViewed]);

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-thread', conv.type, conv.id, recipient.subscriber_id, conv.flow_node_id],
    queryFn: () =>
      inboxApi.thread(conv.type, conv.id, recipient.subscriber_id, {
        flow_node_id: conv.flow_node_id || undefined,
        page: 1,
        limit: 50,
      }),
  });

  const [composerMode, setComposerMode] = useState<ComposerMode | null>(null);
  const [composerTargetMessageId, setComposerTargetMessageId] = useState<string | null>(null);

  // The "parent" message for the composer:
  //  - reply/reply_all → the latest message in the thread
  //  - forward → the message the user clicked Forward on (we use the latest for now)
  const parentMessage = useMemo(() => {
    if (!data?.messages?.length) return null;
    if (composerTargetMessageId) {
      const explicit = data.messages.find(m => m._id === composerTargetMessageId);
      if (explicit) return explicit;
    }
    return data.messages[data.messages.length - 1];
  }, [data, composerTargetMessageId]);

  // For reply-all: previous outbound's CC list (the one we're replying TO)
  const previousCc = useMemo(() => {
    if (!data?.messages?.length) return [];
    // Walk backwards to find the most recent outbound message — that's where
    // the original CC list lived. (Replying-all should include those same people.)
    for (let i = data.messages.length - 1; i >= 0; i--) {
      const m = data.messages[i];
      if (m.direction === 'outbound' && (m.cc_addresses?.length || 0) > 0) {
        return m.cc_addresses || [];
      }
    }
    return [];
  }, [data]);

  const openComposer = (mode: ComposerMode, targetMessageId?: string) => {
    setComposerMode(mode);
    setComposerTargetMessageId(targetMessageId || null);
  };

  const closeComposer = () => {
    setComposerMode(null);
    setComposerTargetMessageId(null);
  };

  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('inbox.prospectPanel');
      if (saved === 'open') return true;
      if (saved === 'closed') return false;
      // First visit: auto-open only on wide screens (it's an overlay drawer, but
      // popping it open on a laptop covers too much of the email).
      return typeof window !== 'undefined' && window.innerWidth >= 1280;
    } catch { return false; }
  });
  const togglePanel = () => setPanelOpen(v => {
    const next = !v;
    try { localStorage.setItem('inbox.prospectPanel', next ? 'open' : 'closed'); } catch { /* ignore */ }
    return next;
  });
  // Esc closes the drawer (only while open and no composer is up).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !composerMode) {
        setPanelOpen(false);
        try { localStorage.setItem('inbox.prospectPanel', 'closed'); } catch { /* ignore */ }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, composerMode]);

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages(),
    staleTime: 300_000,
  });
  const [stageId, setStageId] = useState<string | null>(recipient.stage_id ?? null);
  const stageMut = useMutation({
    mutationFn: (sid: string | null) =>
      pipelineApi.setStage({
        subscriber_id: recipient.subscriber_id,
        source_type: conv.type,
        source_id: conv.id,
        flow_node_id: conv.flow_node_id || null,
        stage_id: sid,
      }),
    onSuccess: (_data, sid) => {
      setStageId(sid);
      qc.invalidateQueries({ queryKey: ['inbox-recipients', conv.type, conv.id, conv.flow_node_id] });
      qc.invalidateQueries({ queryKey: ['pipeline-board'] });
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const archiveMut = useMutation({
    mutationFn: () => inboxApi.archive(conv.type, conv.id, true, conv.flow_node_id),
    onSuccess: () => {
      toast.success('Archived');
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      onBack();
    },
  });

  return (
    <div className="flex-1 flex overflow-hidden relative min-h-0">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
      {/* Thread header */}
      <div className="border-b border-line px-5 py-3 flex items-center gap-2 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-elevated" title="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-heading truncate">{recipient.email}</h2>
          <div className="text-xs text-subtle">{conv.subject}</div>
        </div>
        {recipient.subscriber_status !== 'active' && (
          <div className="text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-500 shrink-0">
            Subscriber is {recipient.subscriber_status}
          </div>
        )}
        <StageChip
          stage={stages.find(s => s._id === stageId) || null}
          onClick={() => { if (!panelOpen) togglePanel(); }}
        />
        {/* Reply is primary; secondary actions live in the overflow menu. */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => openComposer('reply')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-line rounded-md text-body hover:bg-elevated"
            title="Reply (r)"
          >
            <Reply className="w-3.5 h-3.5" /> Reply
          </button>
          <OverflowMenu
            actions={[
              { label: 'Reply all', icon: ReplyAll, onClick: () => openComposer('reply_all') },
              { label: 'Forward', icon: ForwardIcon, onClick: () => openComposer('forward') },
              { label: 'Archive', icon: Archive, onClick: () => { if (confirm('Archive this conversation?')) archiveMut.mutate(); } },
            ]}
          />
          <button
            onClick={togglePanel}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-md border hover:bg-elevated ${panelOpen ? 'text-blue-500 border-blue-500/40' : 'text-subtle border-line'}`}
            title="Toggle prospect details"
            aria-pressed={panelOpen}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-dim" /></div>
        ) : !data?.messages?.length ? (
          <p className="text-sm text-subtle">No messages.</p>
        ) : (
          data.messages.map((m, i, arr) => (
            <MessageBubble
              key={m._id}
              m={m}
              onForward={() => openComposer('forward', m._id)}
              // Gmail-style: only the latest message starts expanded.
              // Click any older one to expand it.
              defaultCollapsed={arr.length > 1 && i !== arr.length - 1}
            />
          ))
        )}
      </div>

      {/* Composer — capped height; body scrolls inside, actions stay visible */}
      <div
        className={`border-t border-line shrink-0 min-h-0 ${
          composerMode ? 'flex flex-col max-h-[min(55vh,520px)] overflow-hidden p-3' : 'p-3'
        }`}
      >
        {composerMode ? (
          <ReplyComposer
            conv={conv}
            recipient={recipient}
            parentMessage={parentMessage}
            previousCc={previousCc}
            mode={composerMode}
            onClose={closeComposer}
            onSent={() => {
              closeComposer();
              markThreadViewed(threadRef);
              qc.invalidateQueries({ queryKey: ['inbox-thread'] });
              qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
              qc.invalidateQueries({ queryKey: ['inbox-recipients', conv.type, conv.id, conv.flow_node_id] });
            }}
          />
        ) : (
          <button
            onClick={() => openComposer('reply')}
            className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md border border-line text-sm text-subtle hover:bg-elevated hover:text-body"
          >
            <Reply className="w-4 h-4" /> Reply
          </button>
        )}
      </div>
      </div>
      {panelOpen && (
        <>
          {/* Scrim on narrow screens where the drawer floats over the email. */}
          <div className="xl:hidden absolute inset-0 z-10 bg-black/30" onClick={togglePanel} />
          <ProspectPanel
            subscriberId={recipient.subscriber_id}
            fallbackEmail={recipient.email}
            stages={stages}
            stageId={stageId}
            onStageChange={(sid) => stageMut.mutate(sid)}
            onClose={togglePanel}
          />
        </>
      )}
    </div>
  );
}

function MessageBubble({ m, onForward, defaultCollapsed = false }: { m: InboxRenderedMessage; onForward?: () => void; defaultCollapsed?: boolean }) {
  const outbound = m.direction === 'outbound';
  const ts = m.sent_at || m.received_at;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const preview = (m.text_body || stripHtml(m.html_body || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

  return (
    <div
      className={`
        group relative rounded-lg border bg-card overflow-hidden
        transition-colors duration-150
        ${outbound
          ? 'border-line hover:border-line/80'
          : 'border-line hover:border-line/80'}
      `}
    >
      <div
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-[2px] ${
          outbound ? 'bg-emerald-500/60' : 'bg-primary-500/60'
        }`}
      />

      {/* Header — also acts as the collapse toggle (whole row clickable) */}
      <button
        type="button"
        onClick={() => { setCollapsed(v => !v); if (!collapsed) setDetailsOpen(false); }}
        className="w-full pl-5 pr-3 py-2.5 border-b border-line flex items-center justify-between gap-3 text-xs text-left hover:bg-elevated/30 transition-colors"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px] ${
              outbound ? 'text-emerald-500' : 'text-primary-500'
            }`}
          >
            <span
              className={`inline-block w-1 h-1 rounded-full ${
                outbound ? 'bg-emerald-500' : 'bg-primary-500'
              }`}
            />
            {outbound ? 'Sent' : 'Received'}
          </span>
          {outbound && m.from_address && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 truncate max-w-[220px]"
              title={`Sent from ${m.from_address}`}
            >
              via {m.from_address}
            </span>
          )}
          {m.is_auto_reply && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-elevated text-dim border border-line">
              auto-reply
            </span>
          )}
          {collapsed && preview ? (
            <span className="text-dim truncate min-w-0">{preview}</span>
          ) : (
            m.subject && (
              <span className="text-subtle truncate hidden sm:inline">— {m.subject}</span>
            )
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onForward && !collapsed && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onForward(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onForward(); } }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-elevated text-dim hover:text-heading"
              title="Forward this message"
            >
              <ForwardIcon className="w-3.5 h-3.5" />
            </span>
          )}
          {!collapsed && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setDetailsOpen(v => !v); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setDetailsOpen(v => !v); } }}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                detailsOpen
                  ? 'text-body bg-elevated border-line'
                  : 'text-dim border-transparent hover:text-body hover:bg-elevated hover:border-line'
              }`}
              title="Show email details"
              aria-expanded={detailsOpen}
            >
              Details
              <ChevronDown className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            </span>
          )}
          {ts && (
            <span className="text-dim tabular-nums">{new Date(ts).toLocaleString()}</span>
          )}
          <span
            className="p-1 rounded text-dim group-hover:text-body transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </div>
      </button>

      {!collapsed && detailsOpen && <MessageDetails m={m} />}

      {/* Body */}
      {!collapsed && (
        <div className="pl-5 pr-4 py-4">
          {m.html_body ? (
            <div
              className="email-prose"
              dangerouslySetInnerHTML={{ __html: m.html_body }}
            />
          ) : (
            <pre className="email-prose-plain">{m.text_body}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function MessageDetails({ m }: { m: InboxRenderedMessage }) {
  const ts = m.sent_at || m.received_at;
  const rows: { label: string; value: string }[] = [
    { label: 'From', value: m.from_address || '—' },
    { label: 'To', value: m.to_address || '—' },
  ];
  if (m.cc_addresses?.length) {
    rows.push({ label: 'Cc', value: m.cc_addresses.join(', ') });
  }
  if (m.bcc_addresses?.length) {
    rows.push({ label: 'Bcc', value: m.bcc_addresses.join(', ') });
  }
  if (m.subject) {
    rows.push({ label: 'Subject', value: m.subject });
  }
  if (ts) {
    rows.push({
      label: m.direction === 'outbound' ? 'Sent' : 'Received',
      value: new Date(ts).toLocaleString(),
    });
  }
  if (m.direction === 'outbound' && m.status_summary) {
    rows.push({ label: 'Status', value: m.status_summary });
  }

  return (
    <div className="pl-5 pr-4 py-2.5 border-b border-line bg-elevated/30 text-[11px] space-y-1.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex gap-3 min-w-0">
          <span className="text-dim font-semibold uppercase tracking-wider w-14 shrink-0 pt-px">
            {label}
          </span>
          <span className="text-subtle break-all leading-relaxed">{value}</span>
        </div>
      ))}
    </div>
  );
}

function RemovableChip({
  label,
  onRemove,
  className = 'bg-blue-500/10 text-blue-500',
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <span
      className={`group/chip inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded text-[10px] shrink-0 ${className}`}
    >
      {label}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover/chip:opacity-100 p-0.5 rounded hover:bg-black/15 transition-opacity"
        title="Remove"
        aria-label={`Remove ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function DismissibleBadge({
  label,
  icon: Icon,
  className,
  onDismiss,
}: {
  label: string;
  icon: LucideIcon;
  className: string;
  onDismiss: () => void;
}) {
  return (
    <span
      className={`group/badge inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${className}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="opacity-0 group-hover/badge:opacity-100 p-0.5 rounded hover:bg-black/20 transition-opacity"
        title="Dismiss"
        aria-label={`Dismiss ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
             .replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<[^>]+>/g, ' ');
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: 'bg-emerald-500/15 text-emerald-500',
    delivered: 'bg-emerald-500/15 text-emerald-500',
    open: 'bg-blue-500/15 text-blue-500',
    opened: 'bg-blue-500/15 text-blue-500',
    click: 'bg-violet-500/15 text-violet-500',
    clicked: 'bg-violet-500/15 text-violet-500',
    bounce: 'bg-red-500/15 text-red-500',
    bounced: 'bg-red-500/15 text-red-500',
    received: 'bg-blue-500/15 text-blue-500',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[status] || 'bg-zinc-500/15 text-subtle'}`}>
      {status}
    </span>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
