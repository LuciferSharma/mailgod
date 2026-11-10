/**
 * Shared helpers for tool modules: a registration wrapper that gives every tool
 * uniform error handling, plus small text-formatting utilities so tool output
 * stays compact and readable for the calling agent.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

type TextResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export function ok(text: string): TextResult {
  return { content: [{ type: 'text', text }] };
}

export function fail(message: string): TextResult {
  return { content: [{ type: 'text', text: `❌ ${message}` }], isError: true };
}

interface ToolMeta {
  title: string;
  description: string;
}

/**
 * Register a tool whose handler returns a plain string (or throws). The wrapper
 * converts the string into MCP text content and turns any thrown error into an
 * isError result so the agent sees a clean message instead of a transport crash.
 */
export function tool(
  server: McpServer,
  name: string,
  meta: ToolMeta,
  inputSchema: ZodRawShape,
  run: (args: any) => Promise<string> | string,
): void {
  server.registerTool(name, { ...meta, inputSchema }, async (args: any) => {
    try {
      return ok(await run(args));
    } catch (err: any) {
      return fail(err?.message || String(err));
    }
  });
}

export function truncate(s: string, max = 120): string {
  if (!s) return '';
  const oneLine = String(s).replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

/** Pretty-print an object as compact JSON, capped in length. */
export function json(value: unknown, max = 4000): string {
  const s = JSON.stringify(value, null, 2);
  return s.length > max ? s.slice(0, max) + '\n… (truncated)' : s;
}

/** "key: value" lines from an object, skipping empty values. */
export function kvLines(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}
