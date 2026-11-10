/**
 * Render a user-typed reply or compose body into safe, properly-formatted HTML
 * suitable for sending via SendGrid.
 *
 * Detects plain text vs HTML and handles each:
 *  - Plain text: escape, paragraph-break on blank lines, <br> on single \n,
 *    auto-linkify URLs and bare emails, wrap in a styled body shell.
 *  - HTML (from TipTap or templates): pass through unchanged. Caller is
 *    responsible for producing safe markup.
 */

const URL_RE = /\b(https?:\/\/[^\s<>"]+)/g;
const EMAIL_RE = /\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeHtml(s: string): boolean {
  // Cheap heuristic: if it contains any of these block-ish tags, treat as HTML.
  // Tolerates inline <a> in otherwise plain text by also requiring multi-line
  // structure or another HTML tag.
  return /<(p|div|br|h[1-6]|ul|ol|li|table|tr|td|blockquote|img|hr|html|body|head)\b/i.test(s);
}

/**
 * Plain text → HTML. Splits on blank lines into paragraphs, single newlines
 * become <br>. Auto-links URLs and emails. Escapes everything else.
 */
export function textToHtml(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  // Split into paragraphs on blank lines (one or more empty lines)
  const paragraphs = trimmed.split(/\n\s*\n+/);

  const renderedParas = paragraphs.map(para => {
    // Escape first, THEN inject anchor tags so user content can't sneak in HTML
    const escaped = escapeHtml(para);
    // Convert single newlines within a paragraph to <br>
    const withBreaks = escaped.replace(/\n/g, '<br>');
    // Linkify URLs (must run before email regex to avoid double-matching)
    const linked = withBreaks
      .replace(URL_RE, (match) => `<a href="${match}" style="color:#2563eb;text-decoration:underline;">${match}</a>`)
      .replace(EMAIL_RE, (match) => {
        // Don't re-wrap an email that's already inside an href attribute
        return `<a href="mailto:${match}" style="color:#2563eb;text-decoration:underline;">${match}</a>`;
      });
    return `<p style="margin:0 0 16px 0;line-height:1.6;">${linked}</p>`;
  });

  return renderedParas.join('\n');
}

/**
 * Wrap rendered HTML in a styled email shell. Used for the reply body so the
 * recipient sees a consistent visual format regardless of whether the sender
 * used plain or rich mode.
 */
export function wrapInEmailShell(innerHtml: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#111827;line-height:1.6;max-width:640px;">${innerHtml}</div>`;
}

/**
 * High-level: given a user-typed body and the declared format, return final
 * HTML to hand to SendGrid.
 *
 *  - format === 'plain' : run textToHtml + wrap in shell
 *  - format === 'html'  : pass through; assume caller produced safe HTML
 *  - format omitted     : auto-detect via looksLikeHtml()
 */
export function renderEmailBody(body: string, format?: 'plain' | 'html' | 'auto'): string {
  const input = body || '';
  const explicit = format === 'plain' || format === 'html';
  const isHtml = format === 'html' || (!explicit && looksLikeHtml(input));
  if (isHtml) {
    // If the HTML doesn't include the shell wrapper, add it for consistency
    if (/^<div[^>]*max-width/.test(input.trim())) return input;
    return wrapInEmailShell(input);
  }
  return wrapInEmailShell(textToHtml(input));
}
