import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Loader2, Send, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { templateApi, oneOffSendApi, settingsApi, subscriberApi, mailboxApi } from '../../api';
import SenderPicker, { type SenderChoice } from './SenderPicker';
import type { Template } from '../../types';
import CcBccFields from './CcBccFields';
import RecipientField, { chipsToPayload, type RecipientChip } from './RecipientField';

const STANDARD_CHIPS = ['{{name}}', '{{first_name}}', '{{email}}', '{{plan_tier}}', '{{unsubscribe_url}}'];

const RECIPIENT_LIMIT = 50;
const POOL_LIMIT = 2000;

export default function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hi {{name}},\n\n');
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [sender, setSender] = useState<SenderChoice>({ mode: 'pool', mailbox_ids: [] });
  const { data: mailboxes } = useQuery({ queryKey: ['mailboxes'], queryFn: mailboxApi.list });
  const recipientLimit = sender.mode === 'default' ? RECIPIENT_LIMIT : POOL_LIMIT;

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const savedCcContacts = useMemo(() => {
    const v = (settings || []).find((s: any) => s.key === 'cc_contacts')?.value;
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : [];
  }, [settings]);

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
  });

  const { data: customFields } = useQuery({
    queryKey: ['custom-fields-discover'],
    queryFn: subscriberApi.discoverCustomFields,
  });

  const sendMut = useMutation({
    mutationFn: (action: 'send' | 'draft') =>
      oneOffSendApi.create({
        subject,
        html_body: body,
        template_id: templateId || null,
        ...chipsToPayload(recipients),
        cc,
        bcc,
        action,
        sender_mode: sender.mode,
        mailbox_ids: sender.mailbox_ids,
      }),
    onSuccess: (_data, vars) => {
      if (vars === 'send') onSent();
      else { toast.success('Draft saved'); onClose(); }
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const useTemplate = (t: Template) => {
    setTemplateId(t._id);
    if (!subject) setSubject(t.subject);
    setBody(t.html_content);
  };

  const overLimit = recipients.length > recipientLimit;
  const canSend = recipients.length > 0 && !overLimit && subject.trim() && body.trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card border border-line rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl"
      >
        <div className="px-5 py-3 border-b border-line flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-heading">New email</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-elevated">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <RecipientField
            recipients={recipients}
            onChange={setRecipients}
            limit={recipientLimit}
          />

          <SenderPicker value={sender} onChange={setSender} mailboxes={mailboxes || []} />

          <CcBccFields
            cc={cc}
            bcc={bcc}
            onChange={({ cc: nc, bcc: nb }) => { setCc(nc); setBcc(nb); }}
            savedContacts={savedCcContacts}
          />

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
            <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              Body
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your email..."
              rows={12}
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
              HTML allowed. Variables substitute per recipient (case-insensitive). SendGrid sends get the unsubscribe footer; own mailboxes send it as a personal email.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2 shrink-0">
          <button
            onClick={() => sendMut.mutate('draft')}
            disabled={sendMut.isPending || !subject.trim() || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-line rounded-md hover:bg-elevated disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Save draft
          </button>
          <button
            onClick={() => sendMut.mutate('send')}
            disabled={sendMut.isPending || !canSend}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sendMut.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> {sender.mode === 'default' ? 'Send' : 'Queue'} to {recipients.length || 'N'} {recipients.length === 1 ? 'person' : 'people'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
