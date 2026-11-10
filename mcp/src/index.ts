#!/usr/bin/env node
/**
 * Mailgod — MCP server.
 *
 * Exposes the platform (subscribers, templates, segments, sends, campaigns,
 * flows, analytics) to an MCP-capable agent over stdio. It is a thin client
 * over the platform's REST API; all business rules live in the platform.
 *
 * NOTE: stdout is the MCP protocol channel — never console.log here. Diagnostics
 * go to stderr only.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { config } from './config.js';
import { guideText } from './guide.js';
import { registerProspectTools } from './tools/prospects.js';
import { registerContentTools } from './tools/content.js';
import { registerSendingTools } from './tools/sending.js';
import { registerFlowTools } from './tools/flows.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerMetaTools } from './tools/meta.js';

const server = new McpServer({
  name: 'mailgod',
  version: '1.0.0',
});

// Tools
registerMetaTools(server);
registerProspectTools(server);
registerContentTools(server);
registerSendingTools(server);
registerFlowTools(server);
registerAnalyticsTools(server);

// The guide, also exposed as a resource for clients that surface those.
server.registerResource(
  'guide',
  'guide://mailgod',
  {
    title: 'Mailgod Guide',
    description: 'How the platform works and how to use every MCP tool, with recipes and safety notes.',
    mimeType: 'text/markdown',
  },
  async (uri) => ({ contents: [{ uri: uri.href, text: guideText }] }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // To stderr so we don't corrupt the stdio protocol on stdout.
  console.error(`[mailgod-mcp] ready → ${config.baseUrl} (sending ${config.allowSend ? 'enabled' : 'disabled'})`);
}

main().catch((err) => {
  console.error('[mailgod-mcp] fatal:', err);
  process.exit(1);
});
