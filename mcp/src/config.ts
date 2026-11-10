/**
 * Runtime configuration, read once from environment variables.
 *
 * Everything has a sensible local-dev default so the server starts with zero
 * config against a platform running on localhost. Point it at production by
 * setting MAILGOD_BASE_URL + MAILGOD_PASSWORD (or MAILGOD_TOKEN).
 */

function intOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export const config = {
  /** Base URL of the platform API, no trailing slash. */
  baseUrl: (process.env.MAILGOD_BASE_URL || 'http://localhost:3001').replace(/\/+$/, ''),

  /** Admin password used to mint a JWT via POST /api/auth/login. */
  password: process.env.MAILGOD_PASSWORD || 'admin',

  /** Pre-minted JWT. If set, skips the password login entirely. */
  token: process.env.MAILGOD_TOKEN || undefined,

  /**
   * Extra hard cap on recipients for a single send/enroll, on TOP of the
   * platform's own limits. Unset = rely on platform limits only.
   */
  maxRecipients: intOrUndefined(process.env.MAILGOD_MAX_RECIPIENTS),

  /**
   * Master kill-switch. When false, confirm_send and flow enrollment refuse to
   * dispatch (drafts + read tools still work). Default: sending allowed.
   */
  allowSend: process.env.MAILGOD_ALLOW_SEND !== 'false',
};

export type Config = typeof config;
