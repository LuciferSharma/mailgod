import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi, templateApi, oneOffSendApi, settingsApi, mailboxApi } from '../../api';
import SenderPicker, { type SenderChoice } from './SenderPicker';
import type { InboxConversation, Template } from '../../types';
import CcBccFields from './CcBccFields';
import TagEditor from './TagEditor';
import RecipientField, { chipsToPayload, subscribersToChips, type RecipientChip } from './RecipientField';

const STANDARD_CHIPS = ['{{name}}', '{{first_name}}', '{{email}}', '{{plan_tier}}', '{{unsubscribe_url}}'];
const RECIPIENT_LIMIT = 50;

export default function DraftDetail({
  conv,
  onSent,
  onDeleted,
}: {
  conv: InboxConversation;
  onSent: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sender, setSender] = useState<SenderChoice>({ mode: 'pool', mailbox_ids: [] });
  const { data: mailboxes } = useQuery({ queryKey: ['mailboxes'], queryFn: mailboxApi.list });

  const { data: draft, isLoading } = useQuery({
    queryKey: ['one-off-draft', conv.id],
    queryFn: () => oneOffSendApi.get(conv.id),
  });

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const savedCcContacts = useMemo(() => {
    const v = (settings || []).find((s: any) => s.key === 'cc_contacts')?.value;
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : [];
  }, [settings]);

  useEffect(() => {
    if (!draft || loaded) return;
    setSubject(draft.subject || '');
    setBody(draft.html_body || '');
    setTemplateId(draft.template_id || '');
    setCc(draft.cc_addresses || []);
    setBcc(draft.bcc_addresses || []);
    setRecipients(subscribersToChips(draft.recipients || []));
    setSender({ mode: (draft.sender_mode as any) || 'pool', mailbox_ids: draft.mailbox_ids || [] });
    setLoaded(true);
  }, [draft, loaded]);

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
  });

  const { data: customFields } = useQuery({
    queryKey: ['custom-fields-discover'],
    queryFn: subscriberApi.discoverCustomFields,
  });

  const buildPayload = () => ({
    subject,
    html_body: body,
    template_id: templateId || null,
    ...chipsToPayload(recipients),
    cc,
    bcc,
    sender_mode: sender.mode,
    mailbox_ids: sender.mailbox_ids,
  });

  const saveMut = useMutation({
    mutationFn: () => oneOffSendApi.update(conv.id, buildPayload()),
    onSuccess: () => {
      toast.success('Draft saved');
      qc.invalidateQueries({ queryKey: ['one-off-draft', conv.id] });
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save draft'),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      await oneOffSendApi.update(conv.id, buildPayload());
      await oneOffSendApi.send(conv.id);
    },
    onSuccess: () => {
      toast.success('Email sent');
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      onSent();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to send'),
  });

  const deleteMut = useMutation({
    mutationFn: () => oneOffSendApi.delete(conv.id),
    onSuccess: () => {
      toast.success('Draft deleted');
      qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
      onDeleted();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete draft'),
  });

  const useTemplate = (t: Template) => {
    setTemplateId(t._id);
    if (!subject) setSubject(t.subject);
    setBody(t.html_content);
  };

  const overLimit = recipients.length > RECIPIENT_LIMIT;
  const canSend = recipients.length > 0 && !overLimit && subject.trim() && body.trim();
  const busy = saveMut.isPending || sendMut.isPending || deleteMut.isPending;

  if (isLoading || !loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-dim" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="border-b border-line px-5 py-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-subtle mb-0.5">
            <span className="px-1.5 py-0.5 rounded bg-elevated">{conv.source_label}</span>
            <span>{recipients.length} recipient{recipients.length !== 1 ? 's' : ''}</span>
          </div>
          <h2 className="text-base font-semibold text-heading truncate">{subject || '(no subject)'}</h2>
          {conv.inbox_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {conv.inbox_tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">#{t}</span>
              ))}
            </div>
          )}
        </div>
        <TagEditor
          conv={conv}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['inbox-conversations'] });
            qc.invalidateQueries({ queryKey: ['inbox-conv-detail'] });
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <RecipientField
          recipients={recipients}
          onChange={setRecipients}
          limit={RECIPIENT_LIMIT}
        />

        <CcBccFields
          cc={cc}
          bcc={bcc}
          onChange={({ cc: nc, bcc: nb }) => { setCc(nc); setBcc(nb); }}
          savedContacts={savedCcContacts}
        />

          <SenderPicker value={sender} onChange={setSender} mailboxes={mailboxes || []} />

        <div>
          <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
            Start from template (optional)
          </label>
          <select
            value={templateId}
            onChange={e => {
              const tid = e.target.value;
              setTemplateId(tid);
              if (tid && templates) {
                const t = templates.find((x: any) => x._id === tid);
                if (t) useTemplate(t as Template);
              }
            }}
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-field"
          >
            <option value="">— Skip — write from scratch —</option>
            {(templates || []).map((t: any) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Email subject..."
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-field"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">Body</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your email..."
            rows={14}
            className="w-full px-3 py-2 text-sm rounded-md border border-line bg-field font-mono resize-y"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-dim">Click to insert:</span>
            {STANDARD_CHIPS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setBody(prev => prev + v)}
                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-elevated border border-line text-blue-500 hover:bg-blue-500/10"
              >
                {v}
              </button>
            ))}
            {(customFields || []).slice(0, 8).map(cf => {
              const v = `{{${cf.key}}}`;
              return (
                <button
                  key={cf.key}
                  type="button"
                  onClick={() => setBody(prev => prev + v)}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/15"
                  title={`Custom field — ${cf.count} subscriber${cf.count !== 1 ? 's' : ''} have this set`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-dim mt-1.5">
            HTML allowed. Variables substitute per recipient. Unsubscribe link added automatically.
          </p>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={() => {
            if (window.confirm('Delete this draft?')) deleteMut.mutate();
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-red-500 border border-line rounded-md hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={busy || !subject.trim() || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-line rounded-md hover:bg-elevated disabled:opacity-50"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save draft
          </button>
          <button
            onClick={() => sendMut.mutate()}
            disabled={busy || !canSend}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sendMut.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> Send to {recipients.length || 'N'} {recipients.length === 1 ? 'person' : 'people'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
