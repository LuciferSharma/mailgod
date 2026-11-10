import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Send, Loader2, Eye } from 'lucide-react';
import { inboxApi } from '../../api';

interface Props {
  html: string;
  bodyFormat: 'plain' | 'html';
  subject: string;
  to: string[];
  cc?: string[];
  onClose: () => void;
  onSend: () => void;
  sending?: boolean;
}

export default function ReplyPreviewModal({
  html, bodyFormat, subject, to, cc = [], onClose, onSend, sending,
}: Props) {
  // Render server-side so the user sees exactly what the recipient will see —
  // same emailRender pipeline that the real send uses.
  const { data, isLoading } = useQuery({
    queryKey: ['reply-preview', html, bodyFormat],
    queryFn: () => inboxApi.previewRender(html, bodyFormat),
    enabled: !!html.trim(),
  });

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-card border border-line rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-500" />
            <div>
              <h2 className="text-sm font-semibold text-heading leading-tight">Preview</h2>
              <p className="text-[11px] text-dim leading-tight">Exactly what the recipient will see</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-elevated text-dim hover:text-body">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recipient summary */}
        <div className="px-5 py-2.5 border-b border-line/60 bg-elevated/40 text-xs space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold text-dim uppercase tracking-wider w-12 shrink-0">To</span>
            <span className="text-body">{to.join(', ') || <span className="text-dim italic">no recipients</span>}</span>
          </div>
          {cc.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold text-dim uppercase tracking-wider w-12 shrink-0">Cc</span>
              <span className="text-body">{cc.join(', ')}</span>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold text-dim uppercase tracking-wider w-12 shrink-0">Subject</span>
            <span className="text-heading font-medium">{subject || <span className="text-dim italic">no subject</span>}</span>
          </div>
        </div>

        {/* Rendered body — white background simulating the recipient's email client */}
        <div className="flex-1 overflow-y-auto bg-zinc-950/50 p-5">
          <div className="max-w-2xl mx-auto rounded-md bg-white shadow-lg overflow-hidden">
            {isLoading ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : data?.rendered_html ? (
              <div
                className="p-6 email-preview-body"
                style={{ color: '#111827' }}
                dangerouslySetInnerHTML={{ __html: data.rendered_html }}
              />
            ) : (
              <div className="p-10 text-center text-zinc-500 text-sm italic">Empty message</div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-subtle hover:text-body rounded-md hover:bg-elevated"
          >
            Back to edit
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !data?.rendered_html}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 shadow-sm shadow-blue-900/30"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? 'Sending...' : 'Send now'}
          </button>
        </div>
      </div>
    </div>
  );
}
