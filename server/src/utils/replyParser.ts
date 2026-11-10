/**
 * Lightweight reply parser. Strips most common quoted-reply patterns:
 *  - "On <date>, <name> wrote:" Gmail/Apple
 *  - ">"-prefixed lines blocks (basic)
 *  - "From:/Sent:/To:/Subject:" Outlook block
 *  - "-----Original Message-----" separators
 *
 * Returns the new content (best-effort). Falls back to the original text if
 * nothing obviously quoted is detected.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return '';

  const patterns: RegExp[] = [
    /\n[> ]*On\s.{1,200}wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n[> ]*From:\s.+\n[> ]*Sent:\s.+/i,
    /\n_{5,}\s*\n/,
    /\n[> ]*Le\s.{1,200}écrit:\s*\n/i,
    /\n[> ]*Am\s.{1,200}schrieb.+:\s*\n/i,
  ];

  let earliest = text.length;
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m.index !== undefined && m.index < earliest) {
      earliest = m.index;
    }
  }

  let stripped = text.slice(0, earliest).trim();

  // Drop trailing blocks that are entirely quoted lines
  const lines = stripped.split(/\r?\n/);
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last.startsWith('>') || last === '') lines.pop();
    else break;
  }

  return lines.join('\n').trim() || stripped;
}

export function isAutoReply(subject: string, headers: Record<string, string> = {}): boolean {
  if (!subject) return false;
  if (/auto[- ]?reply|out of office|automatic reply|vacation|away from|ticket|case\s*(#|number|id)|we('ve| have) received your|thank you for (contacting|reaching out to|your (email|message))|request received|has been (received|raised|logged|created)|acknowledg/i.test(subject)) return true;
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') return true;
  if (headers['x-autoreply'] || headers['x-autorespond']) return true;
  if ((headers['precedence'] || '').match(/auto[_-]?reply|bulk|junk/i)) return true;
  return false;
}

/**
 * Extract reply token from an email address like "reply+abc123@reply.example.com".
 * Returns null if no token portion is found.
 */
export function extractReplyToken(toAddress: string): string | null {
  if (!toAddress) return null;
  // Possible formats: <reply+token@host>, "Name" <reply+token@host>, reply+token@host
  const m = toAddress.match(/reply\+([A-Za-z0-9_-]+)@/i);
  return m ? m[1] : null;
}
