import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Mail, ExternalLink, Loader2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi, inboxApi } from '../../api';
import EngagementCard from '../subscribers/EngagementCard';
import SubscriberRemindersCard from '../subscribers/SubscriberRemindersCard';
import StagePicker from './StagePicker';
import type { PipelineStage } from '../../types';

interface Props {
  subscriberId: string;
  fallbackEmail?: string;
  stages?: PipelineStage[];
  stageId?: string | null;
  onStageChange?: (stageId: string | null) => void;
  onClose?: () => void;
}

const cardCls = 'bg-card rounded-lg border border-line p-4';

/**
 * Module-level shell so it isn't recreated on every render (which would remount
 * the whole subtree and steal focus from the tag input).
 */
function PanelShell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <aside className="absolute right-0 top-0 bottom-0 z-20 w-[360px] max-w-[85vw] border-l border-line bg-card flex flex-col shadow-2xl animate-[slideInRight_180ms_ease-out]">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2 shrink-0">
        <User className="w-4 h-4 text-dim" />
        <h3 className="text-sm font-semibold text-heading flex-1">Prospect</h3>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-elevated text-dim hover:text-body" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </aside>
  );
}

/**
 * Right-rail prospect context for the inbox: identity, engagement, tags
 * (editable), custom fields, cross-conversation history, and
 * reminders — so a rep never has to leave the inbox to learn who replied.
 */
export default function ProspectPanel({ subscriberId, fallbackEmail, stages, stageId, onStageChange, onClose }: Props) {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscriber', subscriberId],
    queryFn: () => subscriberApi.get(subscriberId),
  });
  const subscriber = data?.subscriber;

  const { data: history } = useQuery({
    queryKey: ['inbox-recent-messages', subscriberId],
    queryFn: () => inboxApi.recentMessages(subscriberId, 10),
    enabled: !!subscriberId,
  });

  const addTag = useMutation({
    mutationFn: (tag: string) => subscriberApi.addTags(subscriberId, [tag]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber', subscriberId] });
      setNewTag('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to add tag'),
  });
  const removeTag = useMutation({
    mutationFn: (tag: string) => subscriberApi.removeTag(subscriberId, tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriber', subscriberId] }),
    onError: () => toast.error('Failed to remove tag'),
  });

  if (isLoading) {
    return (
      <PanelShell onClose={onClose}>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      </PanelShell>
    );
  }

  if (isError || !subscriber) {
    return (
      <PanelShell onClose={onClose}>
        <div className="flex-1 p-4 text-sm text-subtle">
          Couldn’t load prospect{fallbackEmail ? ` (${fallbackEmail})` : ''}.
        </div>
      </PanelShell>
    );
  }

  const initials = (subscriber.name || subscriber.email || '?').trim().slice(0, 2).toUpperCase();
  const customEntries = Object.entries(subscriber.custom_attributes || {});

  return (
    <PanelShell onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Identity */}
        <div className={cardCls}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary-500/15 text-primary-500 flex items-center justify-center text-sm font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-heading truncate">{subscriber.name || '(no name)'}</div>
              <div className="text-xs text-subtle truncate flex items-center gap-1">
                <Mail className="w-3 h-3 shrink-0" />
                {subscriber.email}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-elevated text-body text-[11px]">{subscriber.plan_tier || 'free'}</span>
            <StatusPill status={subscriber.status} />
            {subscriber.paid && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[11px]">paid</span>}
            {subscriber.cancelled && <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 text-[11px]">cancelled</span>}
            {subscriber.country && <span className="px-1.5 py-0.5 rounded bg-elevated text-subtle text-[11px]">{subscriber.country}</span>}
          </div>
          <div className="mt-2 text-[11px] text-dim space-y-0.5">
            {subscriber.signup_source && <div>source: {subscriber.signup_source}</div>}
            <div>usage count: {subscriber.usage_count ?? 0}</div>
            {subscriber.last_login && <div>last login: {new Date(subscriber.last_login).toLocaleDateString()}</div>}
          </div>
        </div>

        {/* Pipeline stage for this conversation */}
        {onStageChange && (
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-body">Pipeline</h3>
              <StagePicker stages={stages || []} value={stageId ?? null} onChange={onStageChange} />
            </div>
          </div>
        )}

        {/* Engagement (reused card) */}
        <EngagementCard subscriber={subscriber} />

        {/* Subscriber tags — editable */}
        <div className={cardCls}>
          <h3 className="text-sm font-medium text-body mb-2">Tags</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(subscriber.tags || []).length === 0 && <span className="text-xs text-dim">No tags yet.</span>}
            {(subscriber.tags || []).map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[11px]">
                {t}
                <button onClick={() => removeTag.mutate(t)} className="opacity-60 hover:opacity-100" title="Remove tag">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={e => { e.preventDefault(); const v = newTag.trim(); if (v) addTag.mutate(v); }}
            className="flex items-center gap-1"
          >
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              placeholder="Add tag…"
              className="flex-1 text-xs bg-field border border-field-line rounded-md px-2 py-1 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
            />
            <button type="submit" disabled={!newTag.trim() || addTag.isPending} className="p-1 text-blue-500 disabled:opacity-40">
              {addTag.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>


        {/* Custom fields — read-only here (edit on the full profile) */}
        {customEntries.length > 0 && (
          <div className={cardCls}>
            <h3 className="text-sm font-medium text-body mb-2">Custom fields</h3>
            <div className="space-y-1.5 text-xs">
              {customEntries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-2">
                  <span className="text-dim font-mono truncate" title={k}>{k}</span>
                  <span className="col-span-2 text-body break-words">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-conversation history */}
        <div className={cardCls}>
          <h3 className="text-sm font-medium text-body mb-2">
            History
            {history && <span className="text-dim font-normal"> · {history.outbound} sent · {history.inbound} replies</span>}
          </h3>
          {!history ? (
            <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-dim" /></div>
          ) : history.items.length === 0 ? (
            <p className="text-xs text-dim">No prior messages.</p>
          ) : (
            <div className="space-y-1.5">
              {history.items.map(m => (
                <div key={m._id} className="text-xs border-l-2 border-line pl-2 py-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={m.direction === 'inbound' ? 'text-emerald-500 font-medium' : 'text-subtle'}>
                      {m.direction === 'inbound' ? 'Reply' : 'Sent'} · {m.source_type.replace('_', ' ')}
                    </span>
                    <span className="text-dim shrink-0">{m.at ? new Date(m.at).toLocaleDateString() : ''}</span>
                  </div>
                  {(m.subject || m.preview) && <div className="text-body truncate">{m.subject || m.preview}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reminders (reused card) */}
        <SubscriberRemindersCard subscriberId={subscriberId} />
      </div>

      {/* Footer: deep link to the full profile */}
      <div className="border-t border-line p-3 shrink-0">
        <Link
          to={`/subscribers/${subscriberId}`}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-md border border-line text-sm text-subtle hover:bg-elevated hover:text-body"
        >
          Open full profile <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </PanelShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-500',
    unsubscribed: 'bg-amber-500/15 text-amber-500',
    bounced: 'bg-red-500/15 text-red-500',
    complained: 'bg-red-500/15 text-red-500',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[11px] ${map[status] || 'bg-elevated text-subtle'}`}>{status}</span>;
}
