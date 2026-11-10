/**
 * Analytics tool — read-only platform metrics.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../client.js';
import { tool, json } from '../lib.js';

export function registerAnalyticsTools(server: McpServer): void {
  tool(
    server,
    'get_analytics',
    {
      title: 'Get analytics',
      description:
        'Read platform analytics. view="dashboard" (overall sends/opens/clicks etc.), ' +
        '"trends" (time series), or "activity" (recent email events feed).',
    },
    {
      view: z
        .enum(['dashboard', 'trends', 'activity'])
        .optional()
        .describe('Which view. Default "dashboard".'),
      limit: z.number().int().positive().max(100).optional().describe('For "activity": how many events (default 20).'),
    },
    async ({ view, limit }: { view?: string; limit?: number }) => {
      const v = view || 'dashboard';
      if (v === 'activity') {
        const data = await api('GET', '/api/analytics/activity', { query: { limit: limit ?? 20 } });
        return json(data);
      }
      const data = await api('GET', `/api/analytics/${v}`);
      return json(data);
    },
  );

  tool(
    server,
    'get_engaged_prospects',
    {
      title: 'Get engaged prospects (openers & clickers)',
      description:
        'Find high-intent prospects who opened or clicked outreach emails, with exact open counts, ' +
        'click metrics, URLs clicked, recency, intent score, and pipeline stage for targeted follow-ups.',
    },
    {
      min_opens: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Minimum email opens (default 1). Set to 2 or 3 to filter for high-intent openers.'),
      min_clicks: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Minimum link clicks (default 0). Set to 1 to find only clickers.'),
      timeframe: z
        .enum(['24h', '7d', '30d', 'all'])
        .optional()
        .describe('Timeframe filter for engagement activity. Default "all".'),
      exclude_replied: z
        .boolean()
        .optional()
        .describe('Exclude prospects who have already replied or booked a demo (default false).'),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe('Maximum number of engaged prospects to return (default 25).'),
      sort_by: z
        .enum(['opens', 'clicks', 'last_active', 'score'])
        .optional()
        .describe('Sort metric: "opens", "clicks", "last_active", or "score". Default "last_active".'),
    },
    async ({ min_opens, min_clicks, timeframe, exclude_replied, limit, sort_by }) => {
      const query: Record<string, any> = {
        minOpens: min_opens ?? 1,
        minClicks: min_clicks ?? 0,
        timeframe: timeframe ?? 'all',
        limit: limit ?? 25,
        sortBy: sort_by ?? 'last_active',
        sortOrder: 'desc',
      };
      if (exclude_replied) query.excludeReplied = 'true';

      const data = await api('GET', '/api/analytics/engaged-prospects', { query });
      return json(data);
    },
  );
}
