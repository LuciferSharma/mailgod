/**
 * Convert plain text to HTML suitable for TipTap — paragraphs, line breaks,
 * and auto-linked URLs / emails (visible as blue underlined links in the editor).
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

function linkifyEscaped(escaped: string): string {
  return escaped
    .replace(URL_RE, (match) => `<a href="${match}">${match}</a>`)
    .replace(EMAIL_RE, (match) => `<a href="mailto:${match}">${match}</a>`);
}

/** Plain text → HTML paragraphs with linkified URLs for the rich editor. */
export function plainToRichHtml(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  const paragraphs = trimmed.split(/\n\s*\n+/);
  return paragraphs
    .map((para) => {
      const escaped = escapeHtml(para);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${linkifyEscaped(withBreaks)}</p>`;
    })
    .join('');
}

/** True when clipboard plain text should be linkified on paste into TipTap. */
export function plainTextHasLinkable(text: string): boolean {
  URL_RE.lastIndex = 0;
  EMAIL_RE.lastIndex = 0;
  return URL_RE.test(text) || EMAIL_RE.test(text);
}
