/**
 * Returns the singular or plural form based on count. If `plural` is omitted,
 * defaults to `singular + 's'`.
 *
 *   plural(1, 'reply', 'replies')  // "reply"
 *   plural(3, 'reply', 'replies')  // "replies"
 *   plural(0, 'recipient')          // "recipients"
 *   plural(1, 'recipient')          // "recipient"
 */
export function plural(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural || singular + 's');
}

/**
 * Convenience: "1 reply" / "3 replies" — count + space + plural form.
 */
export function pluralize(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${plural(n, singular, pluralForm)}`;
}
