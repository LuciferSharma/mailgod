import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, Send, Eye, Loader2, Type, Reply as ReplyIcon, ReplyAll, Forward as ForwardIcon,
  Bold, Italic, Link as LinkIcon, List, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { inboxApi, settingsApi } from '../../api';
import type { InboxConversation, InboxRecipientRow, InboxRenderedMessage } from '../../types';
import CcBccFields from './CcBccFields';
import ReplyPreviewModal from './ReplyPreviewModal';
import { plainToRichHtml, plainTextHasLinkable } from '../../lib/plainToRichHtml';

export type ComposerMode = 'reply' | 'reply_all' | 'forward';

interface Props {
  conv: InboxConversation;
  recipient: InboxRecipientRow;
  /** The message we're acting on. For 'forward' it's the message being forwarded. For 'reply' it's the latest in the thread. */
  parentMessage: InboxRenderedMessage | null;
  /** Previous outbound message's cc list — used for reply-all auto-cc. */
  previousCc?: string[];
  mode: ComposerMode;
  onClose: () => void;
  onSent: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Dynamic TipTap loader — gracefully degrades to textarea if missing. */
type TipTapModule = {
  useEditor: any;
  EditorContent: any;
  StarterKit: any;
  Link: any;
} | null;

let cachedTipTap: TipTapModule = null;
async function loadTipTap(): Promise<TipTapModule> {
  if (cachedTipTap) return cachedTipTap;
  try {
    const [react, kit, link] = await Promise.all([
      import('@tiptap/react'),
      import('@tiptap/starter-kit'),
      import('@tiptap/extension-link'),
    ]);
    cachedTipTap = {
      useEditor: (react as any).useEditor,
      EditorContent: (react as any).EditorContent,
      StarterKit: (kit as any).default || (kit as any),
      Link: (link as any).default || (link as any).Link,
    };
    return cachedTipTap;
  } catch {
    return null;
  }
}

export default function ReplyComposer({
  conv, recipient, parentMessage, previousCc = [], mode, onClose, onSent,
}: Props) {
  // ─── Derived defaults from mode ──────────────────────────────────────────
  const defaultTo = useMemo(() => {
    if (mode === 'forward') return [] as string[];
    return [recipient.email];
  }, [mode, recipient.email]);

  const defaultCc = useMemo(() => {
    if (mode !== 'reply_all') return [] as string[];
    // Exclude the recipient (already in To) and our own outbound address
    const exclude = new Set([recipient.email.toLowerCase()]);
    return (previousCc || []).filter(e => !exclude.has(e.toLowerCase()));
  }, [mode, previousCc, recipient.email]);

  const defaultSubject = useMemo(() => {
    const base = parentMessage?.subject || '';
    if (mode === 'forward') {
      return base.toLowerCase().startsWith('fwd:') ? base : `Fwd: ${base}`;
    }
    return base.toLowerCase().startsWith('re:') ? base : `Re: ${base}`;
  }, [mode, parentMessage]);

  const defaultBody = useMemo(() => {
    if (mode !== 'forward') return '';
    if (!parentMessage) return '';
    const date = parentMessage.sent_at || parentMessage.received_at;
    const dateStr = date ? new Date(date).toString() : '';
    // Use plain-text preamble + the original HTML body so it renders cleanly
    const preamble = `\n\n\n---------- Forwarded message ----------\nFrom: ${parentMessage.from_address}\nDate: ${dateStr}\nSubject: ${parentMessage.subject}\nTo: ${parentMessage.to_address}\n\n`;
    return preamble + (parentMessage.html_body || parentMessage.text_body || '');
  }, [mode, parentMessage]);

  // ─── Form state ──────────────────────────────────────────────────────────
  const [to, setTo] = useState<string[]>(defaultTo);
  const [toInput, setToInput] = useState('');
  const [cc, setCc] = useState<string[]>(defaultCc);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(defaultCc.length > 0 || mode === 'reply_all');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  // Forward mode contains HTML — start in rich mode so it renders sensibly
  const [isRich, setIsRich] = useState(mode === 'forward');
  const [richHtml, setRichHtml] = useState(mode === 'forward' ? defaultBody : '');
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tipTap, setTipTap] = useState<TipTapModule>(null);
  const [tipTapTried, setTipTapTried] = useState(false);
  const [richEditorKey, setRichEditorKey] = useState(0);

  const formRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const savedCcContacts = useMemo(() => {
    const v = (settings || []).find((s: any) => s.key === 'cc_contacts')?.value;
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : [];
  }, [settings]);

  // ─── Load TipTap lazily when the user toggles rich mode ──────────────────
  useEffect(() => {
    if (!isRich || tipTap || tipTapTried) return;
    setTipTapTried(true);
    loadTipTap().then(mod => {
      if (mod) setTipTap(mod);
      else {
        toast.error('Rich text editor unavailable — using plain text');
        setIsRich(false);
      }
    });
  }, [isRich, tipTap, tipTapTried]);

  // ─── Keyboard shortcuts: Esc cancel, Cmd/Ctrl+Enter send ─────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSend();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, richHtml, to, cc, bcc, subject, isRich]);

  // ─── To chip handlers ────────────────────────────────────────────────────
  const addToFromInput = useCallback(() => {
    const raw = toInput.trim();
    if (!raw) return;
    // Allow paste of multiple comma/space separated emails at once
    const candidates = raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const valid: string[] = [];
    let anyInvalid = false;
    for (const c of candidates) {
      const lower = c.toLowerCase();
      if (!EMAIL_RE.test(lower)) { anyInvalid = true; continue; }
      if (to.includes(lower) || valid.includes(lower)) continue;
      valid.push(lower);
    }
    if (valid.length > 0) setTo(prev => [...prev, ...valid]);
    setToInput(anyInvalid && valid.length === 0 ? raw : '');
  }, [toInput, to]);

  const removeTo = (addr: string) => setTo(prev => prev.filter(x => x !== addr));

  // ─── Build outgoing payload ──────────────────────────────────────────────
  const finalHtml = isRich ? richHtml : body;
  const bodyFormat: 'plain' | 'html' = isRich ? 'html' : 'plain';

  const canSend = to.length > 0
    && subject.trim().length > 0
    && finalHtml.trim().length > 0
    && !sending;

  async function handleSend() {
    if (!canSend) {
      if (to.length === 0) toast.error('Add at least one recipient');
      else if (!subject.trim()) toast.error('Subject required');
      else if (!finalHtml.trim()) toast.error('Body is empty');
      return;
    }
    setSending(true);
    try {
      if (mode === 'forward') {
        if (!parentMessage) throw new Error('Nothing to forward');
        await inboxApi.forward({
          source_message_id: parentMessage._id,
          to,
          subject,
          prefix_body: '',  // user-typed prefix is already concatenated in body
          cc,
          bcc,
        });
      } else {
        await inboxApi.reply(
          conv.type, conv.id, recipient.subscriber_id,
          {
            html_body: finalHtml,
            subject,
            cc,
            bcc,
            to,
            body_format: bodyFormat,
            in_reply_to_message_id: parentMessage?._id || null,
          },
          { flow_node_id: conv.flow_node_id || undefined }
        );
      }
      toast.success(mode === 'forward' ? 'Forwarded' : 'Reply sent');
      onSent();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  // ─── Mode metadata ───────────────────────────────────────────────────────
  const modeMeta = {
    reply: { icon: ReplyIcon, label: 'Reply', accent: 'text-blue-500' },
    reply_all: { icon: ReplyAll, label: 'Reply all', accent: 'text-blue-500' },
    forward: { icon: ForwardIcon, label: 'Forward', accent: 'text-violet-500' },
  }[mode];
  const ModeIcon = modeMeta.icon;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={formRef}
      className="rounded-lg border border-line bg-card shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col min-h-0 max-h-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mode strip */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line/60 bg-elevated/40 shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <ModeIcon className={`w-3.5 h-3.5 ${modeMeta.accent}`} />
          <span className="font-semibold text-body uppercase tracking-wider">{modeMeta.label}</span>
          {mode === 'reply_all' && previousCc.length > 0 && (
            <span className="text-dim">· {previousCc.length} from prev. Cc</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-dim mr-1 hidden sm:inline">⌘↵ send · esc close</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-elevated text-dim hover:text-body" title="Close (esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Header fields — label gutter pattern */}
      <div className="px-4 py-3 space-y-1.5 border-b border-line/60 shrink-0">
        {/* To */}
        <Field label="To">
          <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
            {to.map(addr => (
              <span
                key={addr}
                className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-elevated border border-line text-xs text-body"
              >
                <span className="font-medium">{addr}</span>
                <button
                  type="button"
                  onClick={() => removeTo(addr)}
                  className="text-dim hover:text-red-500 rounded-sm"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="email"
              value={toInput}
              onChange={e => setToInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
                  if (toInput.trim()) { e.preventDefault(); addToFromInput(); }
                }
                if (e.key === 'Backspace' && !toInput && to.length > 0) {
                  setTo(prev => prev.slice(0, -1));
                }
              }}
              onBlur={addToFromInput}
              placeholder={to.length === 0 ? 'email@example.com (Enter or , to add)' : 'add more...'}
              className="flex-1 min-w-[160px] bg-transparent text-sm focus:outline-none placeholder:text-dim py-0.5"
              autoFocus={mode === 'forward'}
            />
          </div>
        </Field>

        {/* Cc/Bcc toggle */}
        {!showCcBcc ? (
          <Field label="">
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-blue-500 hover:text-blue-400 py-0.5"
            >
              + Add Cc / Bcc
            </button>
          </Field>
        ) : (
          <div className="pt-1">
            <CcBccFields
              cc={cc}
              bcc={bcc}
              onChange={({ cc: c, bcc: b }) => { setCc(c); setBcc(b); }}
              savedContacts={savedCcContacts}
            />
          </div>
        )}

        {/* Subject */}
        <Field label="Subject">
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full bg-transparent text-sm font-medium text-heading focus:outline-none placeholder:text-dim py-0.5"
          />
        </Field>
      </div>

      {/* Body editor — scrolls when reply is long; toolbar + actions stay put */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {isRich && tipTap ? (
          <RichEditor
            key={richEditorKey}
            tipTap={tipTap}
            html={richHtml}
            onChange={setRichHtml}
            autoFocus={mode !== 'forward'}
          />
        ) : isRich && !tipTap && tipTapTried ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Rich editor failed to load. Falling back to plain text.</span>
          </div>
        ) : (
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={mode === 'forward' ? 10 : 6}
            className="w-full min-h-[120px] bg-field border border-line rounded-md px-3 py-2.5 text-sm text-heading placeholder:text-dim resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 leading-relaxed"
            autoFocus={mode !== 'forward'}
          />
        )}
        <p className="text-[10px] text-dim mt-1.5">
          {isRich
            ? 'Rich formatting — bold, italic, lists, links.'
            : 'Plain text. Line breaks and URLs are auto-formatted on send.'}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-line/60 bg-elevated/30 shrink-0">
        {/* Left: rich text toggle */}
        <button
          type="button"
          onClick={() => {
            if (isRich) {
              // rich → plain: extract text (lossy)
              if (richHtml.trim() && !confirm('Switch to plain text? Formatting will be lost.')) return;
              const temp = document.createElement('div');
              temp.innerHTML = richHtml;
              setBody(temp.textContent || '');
              setIsRich(false);
            } else {
              // plain → rich: linkify URLs so they appear as real hyperlinks
              const converted = plainToRichHtml(body);
              setRichHtml(converted);
              setRichEditorKey(k => k + 1);
              setIsRich(true);
            }
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            isRich
              ? 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30'
              : 'text-subtle hover:bg-elevated hover:text-body'
          }`}
          title="Toggle rich text formatting"
        >
          <Type className="w-3.5 h-3.5" />
          {isRich ? 'Rich' : 'Aa Rich text'}
        </button>

        {/* Right: cancel / preview / send */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-subtle hover:text-body rounded-md hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={!finalHtml.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line rounded-md text-body hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-900/30"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending
              ? (mode === 'forward' ? 'Forwarding...' : 'Sending...')
              : (mode === 'forward' ? 'Send forward' : 'Send reply')}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <ReplyPreviewModal
          html={finalHtml}
          bodyFormat={bodyFormat}
          subject={subject}
          to={to}
          cc={cc}
          onClose={() => setPreviewOpen(false)}
          onSend={() => { setPreviewOpen(false); void handleSend(); }}
          sending={sending}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ─────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[44px_1fr] items-start gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-dim pt-1.5">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function RichEditor({
  tipTap, html, onChange, autoFocus,
}: {
  tipTap: NonNullable<TipTapModule>;
  html: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
}) {
  const { useEditor, EditorContent, StarterKit, Link } = tipTap;
  const editorRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: html,
    autofocus: autoFocus,
    onCreate: ({ editor: ed }: any) => { editorRef.current = ed; },
    editorProps: {
      attributes: {
        class: 'tiptap-reply-content focus:outline-none text-sm leading-relaxed',
      },
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        const clipHtml = event.clipboardData?.getData('text/html');
        if (clipHtml?.includes('<a ')) return false;

        const text = event.clipboardData?.getData('text/plain');
        if (!text || !plainTextHasLinkable(text)) return false;

        event.preventDefault();
        editorRef.current
          ?.chain()
          .focus()
          .insertContent(plainToRichHtml(text))
          .run();
        return true;
      },
    },
    onUpdate: ({ editor: ed }: any) => onChange(ed.getHTML()),
  });

  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, Icon: typeof Bold, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-blue-500/20 text-blue-500' : 'text-subtle hover:bg-elevated hover:text-body'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

  const addLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="rounded-md border border-line bg-field overflow-hidden flex flex-col">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-line/60 bg-elevated/40 shrink-0">
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold, 'Bold (⌘B)')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic, 'Italic (⌘I)')}
        {btn(editor.isActive('link'), addLink, LinkIcon, 'Link')}
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List, 'Bullet list')}
      </div>
      <div className="px-3 py-2.5 min-h-[120px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
