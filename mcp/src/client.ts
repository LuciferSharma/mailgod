/**
 * Thin HTTP client for the Mailgod platform API.
 *
 * Responsibilities:
 *  - Mint + cache a JWT (login with the admin password, or use a supplied token)
 *  - Attach the Bearer token to every request
 *  - Transparently re-login once on a 401 (tokens last 7 days, but the platform
 *    may restart with a new secret, or the cached token may be stale)
 *  - Surface platform error messages as thrown Errors the tools can relay
 *
 * It deliberately knows nothing about individual endpoints — tool modules own
 * that mapping. This keeps the surface small and testable.
 */
import { config } from './config.js';

let cachedToken: string | undefined = config.token;

/** A platform API error carrying the HTTP status so tools can branch on it. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function login(): Promise<string> {
  const res = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: config.password }),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Login failed (HTTP ${res.status}). Check MAILGOD_PASSWORD / MAILGOD_BASE_URL.`,
    );
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new ApiError(500, 'Login succeeded but no token was returned.');
  cachedToken = data.token;
  return cachedToken;
}

async function ensureToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  return login();
}

export interface ApiOptions {
  /** JSON body for POST/PUT. */
  body?: unknown;
  /** Query string params; null/undefined values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

/**
 * Make an authenticated JSON request to the platform.
 * Returns the parsed JSON body (typed as T). Throws ApiError on failure.
 */
export async function api<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const url = new URL(config.baseUrl + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const doFetch = async (token: string) =>
    fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let token = await ensureToken();
  let res = await doFetch(token);

  // Token rejected — mint a fresh one once and retry.
  if (res.status === 401) {
    token = await login();
    res = await doFetch(token);
  }

  const text = await res.text();
  let parsed: any = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text; // non-JSON (shouldn't happen for these endpoints)
    }
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && (parsed.error || parsed.message)) ||
      (typeof parsed === 'string' && parsed) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, String(msg));
  }

  return parsed as T;
}

/** Unauthenticated health probe (GET /health). */
export async function health(): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const res = await fetch(`${config.baseUrl}/health`);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err: any) {
    return { ok: false, status: 0, body: { error: err?.message || String(err) } };
  }
}

/** Force a fresh login (used by check_connection to validate the password). */
export async function verifyAuth(): Promise<boolean> {
  try {
    await login();
    return true;
  } catch {
    return false;
  }
}
