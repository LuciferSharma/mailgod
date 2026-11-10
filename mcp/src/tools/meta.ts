/**
 * Meta tools — connection check and the in-context platform guide.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { health, verifyAuth } from '../client.js';
import { config } from '../config.js';
import { tool } from '../lib.js';
import { guideText } from '../guide.js';

export function registerMetaTools(server: McpServer): void {
  tool(
    server,
    'check_connection',
    {
      title: 'Check connection',
      description:
        'Verify the MCP can reach the platform and authenticate. Good first call to run before anything else.',
    },
    {},
    async () => {
      const h = await health();
      const authed = h.ok ? await verifyAuth() : false;
      const lines = [
        `base URL: ${config.baseUrl}`,
        `platform health: ${h.ok ? '✅ ok' : `❌ unreachable (status ${h.status})`}`,
        `auth: ${authed ? '✅ ok' : '❌ failed'} (${config.token ? 'using MAILGOD_TOKEN' : 'using password login'})`,
        `sending: ${config.allowSend ? 'enabled' : 'DISABLED (MAILGOD_ALLOW_SEND=false)'}`,
        `recipient cap: ${config.maxRecipients ?? 'platform defaults only'}`,
      ];
      if (!h.ok) lines.push('\n⚠️ Is the platform server running and is MAILGOD_BASE_URL correct?');
      else if (!authed) lines.push('\n⚠️ Reached the platform but auth failed — check MAILGOD_PASSWORD / MAILGOD_TOKEN.');
      return lines.join('\n');
    },
  );

  tool(
    server,
    'read_guide',
    {
      title: 'Read platform guide',
      description:
        'Return the full Mailgod platform + MCP guide (concepts, when to use each send type, ' +
        'tool reference, recipes, safety). Read this first if you are unsure how to use the platform.',
    },
    {},
    async () => guideText,
  );
}
