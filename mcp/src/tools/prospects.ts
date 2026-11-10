/**
 * Prospect (subscriber) tools — add, find, inspect, update, tag.
 *
 * "Prospect" and "subscriber" are the same entity in the platform; the API path
 * is /api/subscribers. Adding a prospect inserts an active subscriber that
 * campaigns/flows/one-offs can then target.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api, ApiError } from '../client.js';
import { tool, truncate } from '../lib.js';

const MAX_BULK = 500;

const prospectFields = {
  email: z.string().email().describe('Email address (required, unique, lowercased).'),
  name: z.string().optional().describe('Full name, e.g. "Jane Doe".'),
  country: z.string().optional().describe('Country, free text, e.g. "US".'),
  language: z.string().optional().describe('Language code, e.g. "en". Defaults to "en".'),
  plan_tier: z.string().optional().describe('Plan tier, e.g. "free", "pro". Defaults to "free".'),
  signup_source: z.string().optional().describe('Where they came from, e.g. "clay-outbound".'),
  tags: z.array(z.string()).optional().describe('Tags for segmentation, e.g. ["clay-jun-26", "us"].'),
  custom_attributes: z
    .record(z.string(), z.any())
    .optional()
    .describe('Arbitrary key/values usable as Handlebars vars in emails, e.g. {"channel_link":"..."}.'),
};

function describeSubscriber(s: any): string {
  const tags = Array.isArray(s.tags) && s.tags.length ? ` [${s.tags.join(', ')}]` : '';
  return `${s._id}  ${s.email}  ${s.name || '(no name)'}  ${s.plan_tier || 'free'}/${s.status}${tags}`;
}

export function registerProspectTools(server: McpServer): void {
  tool(
    server,
    'add_prospect',
    {
      title: 'Add prospect',
      description:
        'Add a single prospect (subscriber) to the platform. Returns the new id. ' +
        'If the email already exists, returns the existing id instead of erroring.',
    },
    prospectFields,
    async (args) => {
      try {
        const sub = await api('POST', '/api/subscribers', { body: args });
        return `✅ Added prospect.\n${describeSubscriber(sub)}`;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 409 || /already exists/i.test(err.message))) {
          const found = await api<{ data: any[] }>('GET', '/api/subscribers', {
            query: { search: args.email, limit: 1 },
          });
          const existing = found.data?.[0];
          return existing
            ? `ℹ️ Prospect already exists.\n${describeSubscriber(existing)}`
            : `ℹ️ Prospect already exists (${args.email}).`;
        }
        throw err;
      }
    },
  );

  tool(
    server,
    'add_prospects',
    {
      title: 'Add prospects (bulk)',
      description:
        `Add up to ${MAX_BULK} prospects in one call. Each item takes the same fields as add_prospect. ` +
        'Existing emails are skipped (not updated). Returns a summary of added/skipped/failed.',
    },
    {
      prospects: z
        .array(z.object(prospectFields))
        .min(1)
        .max(MAX_BULK)
        .describe(`Array of prospects (max ${MAX_BULK}).`),
    },
    async ({ prospects }: { prospects: any[] }) => {
      const added: string[] = [];
      let skipped = 0;
      const failed: string[] = [];

      for (const p of prospects) {
        try {
          const sub = await api('POST', '/api/subscribers', { body: p });
          added.push(`${sub.email} → ${sub._id}`);
        } catch (err) {
          if (err instanceof ApiError && (err.status === 409 || /already exists/i.test(err.message))) {
            skipped++;
          } else {
            failed.push(`${p.email}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const lines = [
        `Added ${added.length}, skipped (already existed) ${skipped}, failed ${failed.length} of ${prospects.length}.`,
      ];
      if (added.length) {
        lines.push('\nAdded:');
        lines.push(...added.slice(0, 100));
        if (added.length > 100) lines.push(`… +${added.length - 100} more`);
      }
      if (failed.length) {
        lines.push('\nFailed:');
        lines.push(...failed.slice(0, 20));
      }
      return lines.join('\n');
    },
  );

  tool(
    server,
    'find_prospects',
    {
      title: 'Find prospects',
      description:
        'Search/list prospects with filters. Returns total match count plus a page of compact rows ' +
        '(id, email, name, plan/status, tags). Use the id with get_prospect / send tools.',
    },
    {
      search: z.string().optional().describe('Match against email or name (case-insensitive).'),
      status: z
        .enum(['active', 'unsubscribed', 'bounced', 'complained'])
        .optional()
        .describe('Filter by subscriber status.'),
      plan_tier: z.string().optional().describe('Filter by plan tier, e.g. "free".'),
      tag: z.string().optional().describe('Filter to subscribers carrying this exact tag.'),
      engagement_band: z
        .enum(['cold', 'cool', 'warm', 'hot'])
        .optional()
        .describe('Filter by engagement band.'),
      page: z.number().int().positive().optional().describe('Page number (default 1).'),
      limit: z.number().int().positive().max(200).optional().describe('Rows per page (default 25, max 200).'),
      sort: z.string().optional().describe('Sort key, e.g. "-created_at" (default), "engagement_score".'),
    },
    async (args) => {
      const limit = args.limit ?? 25;
      const res = await api<{ data: any[]; total: number; page: number; totalPages: number }>(
        'GET',
        '/api/subscribers',
        { query: { ...args, limit } },
      );
      if (!res.total) return 'No prospects matched.';
      const rows = res.data.map(describeSubscriber).join('\n');
      return `${res.total} match(es). Page ${res.page}/${res.totalPages}, showing ${res.data.length}:\n${rows}`;
    },
  );

  tool(
    server,
    'get_prospect',
    {
      title: 'Get prospect',
      description: 'Full profile of one prospect by id, plus their most recent email events.',
    },
    { id: z.string().describe('Subscriber id.') },
    async ({ id }: { id: string }) => {
      const { subscriber: s, events } = await api<{ subscriber: any; events: any[] }>(
        'GET',
        `/api/subscribers/${id}`,
      );
      const profile = [
        `${s.email}  (${s._id})`,
        `name: ${s.name || '(none)'}   plan: ${s.plan_tier}   status: ${s.status}`,
        `country: ${s.country || '-'}   language: ${s.language || '-'}   source: ${s.signup_source || '-'}`,
        `tags: ${(s.tags || []).join(', ') || '(none)'}`,
        `engagement: sent ${s.engagement?.emails_sent ?? 0}, opened ${s.engagement?.emails_opened ?? 0}, clicked ${s.engagement?.emails_clicked ?? 0} (score ${s.engagement_score ?? 0})`,
      ];
      const attrs = s.custom_attributes && Object.keys(s.custom_attributes).length
        ? `\ncustom_attributes: ${JSON.stringify(s.custom_attributes)}`
        : '';
      const recent = (events || []).slice(0, 5).map(
        (e: any) => `  - ${new Date(e.timestamp).toISOString()}  ${e.event}${e.metadata?.reason ? ` (${e.metadata.reason})` : ''}`,
      );
      const eventBlock = recent.length ? `\nrecent events:\n${recent.join('\n')}` : '\nrecent events: none';
      return profile.join('\n') + attrs + eventBlock;
    },
  );

  tool(
    server,
    'update_prospect',
    {
      title: 'Update prospect',
      description:
        'Update fields on one prospect. Only provided fields change. Note: `tags` REPLACES the whole ' +
        'tag list — use tag_prospects to add a tag without removing existing ones.',
    },
    {
      id: z.string().describe('Subscriber id.'),
      name: z.string().optional(),
      country: z.string().optional(),
      language: z.string().optional(),
      plan_tier: z.string().optional(),
      signup_source: z.string().optional(),
      status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
      tags: z.array(z.string()).optional().describe('REPLACES all tags.'),
      custom_attributes: z.record(z.string(), z.any()).optional(),
    },
    async ({ id, ...body }: any) => {
      const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return 'Nothing to update — provide at least one field.';
      const s = await api('PUT', `/api/subscribers/${id}`, { body: clean });
      return `✅ Updated.\n${describeSubscriber(s)}`;
    },
  );

  tool(
    server,
    'tag_prospects',
    {
      title: 'Tag prospects',
      description:
        'Add one tag to many prospects at once (does not remove existing tags). Great for labelling ' +
        'an imported batch, e.g. tag ["id1","id2",…] with "clay-jun-26".',
    },
    {
      subscriber_ids: z.array(z.string()).min(1).describe('Subscriber ids to tag.'),
      tag: z.string().min(1).describe('The tag to add to all of them.'),
    },
    async ({ subscriber_ids, tag }: { subscriber_ids: string[]; tag: string }) => {
      const res = await api<{ modified: number }>('POST', '/api/subscribers/bulk-action', {
        body: { action: 'tag', subscriberIds: subscriber_ids, tag },
      });
      return `✅ Tagged ${res.modified ?? 0} prospect(s) with "${truncate(tag, 40)}".`;
    },
  );
}
