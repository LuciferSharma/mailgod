/**
 * Flow tools — list automations and enroll subscribers into them.
 *
 * A flow is a multi-step automation (email → wait → email …). Enrolling a
 * subscriber into an ACTIVE flow triggers real automated sends, so enroll_in_flow
 * is dry-run by default and requires confirm:true to proceed (and respects the
 * MAILGOD_ALLOW_SEND kill-switch).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../client.js';
import { config } from '../config.js';
import { tool, truncate } from '../lib.js';

export function registerFlowTools(server: McpServer): void {
  tool(
    server,
    'list_flows',
    {
      title: 'List flows',
      description: 'List automation flows with status, trigger type, and live enrollment stats.',
    },
    {},
    async () => {
      const flows = await api<any[]>('GET', '/api/flows');
      if (!flows.length) return 'No flows defined.';
      return flows
        .map((f) => {
          const s = f.stats || {};
          return (
            `${f._id}  "${truncate(f.name, 40)}"  [${f.status}/${f.trigger?.type || 'manual'}]  ` +
            `enrolled ${s.enrolled ?? 0}, active ${s.active ?? 0}, completed ${s.completed ?? 0}, exited ${s.exited ?? 0}`
          );
        })
        .join('\n');
    },
  );

  tool(
    server,
    'enroll_in_flow',
    {
      title: 'Enroll into flow',
      description:
        'Enroll subscribers into an ACTIVE flow — by a list of subscriber_ids OR by segment_id. ' +
        'Dry-run by default: returns how many WOULD enroll. Pass confirm:true to actually enroll ' +
        '(this starts real automated sends). The flow must already be active.',
    },
    {
      flow_id: z.string().describe('The flow id (from list_flows).'),
      subscriber_ids: z.array(z.string()).optional().describe('Enroll these specific subscribers.'),
      segment_id: z.string().optional().describe('OR enroll everyone matching this segment.'),
      confirm: z.boolean().optional().describe('Set true to actually enroll. Default false = dry run.'),
    },
    async ({ flow_id, subscriber_ids, segment_id, confirm }: any) => {
      const hasIds = Array.isArray(subscriber_ids) && subscriber_ids.length > 0;
      const hasSeg = typeof segment_id === 'string' && segment_id.length > 0;
      if (hasIds === hasSeg) {
        throw new Error('Provide exactly one of subscriber_ids or segment_id.');
      }

      // Confirm flow is active up front for a clear message either way.
      const flow = await api<any>('GET', `/api/flows/${flow_id}`);
      if (flow.status !== 'active') {
        throw new Error(`Flow "${flow.name}" is ${flow.status}, not active. Activate it in the UI first.`);
      }

      // Determine blast radius.
      let count: number;
      if (hasIds) {
        count = subscriber_ids.length;
      } else {
        const seg = await api<{ subscriber_count: number; name: string }>('GET', `/api/segments/${segment_id}`);
        count = seg.subscriber_count;
      }

      if (!confirm) {
        return (
          `DRY RUN — would enroll up to ${count} subscriber(s) into "${flow.name}" ` +
          `(already-running subscribers are skipped).\n➡️ Re-call with confirm:true to proceed.`
        );
      }

      if (!config.allowSend) {
        throw new Error('Sending is disabled (MAILGOD_ALLOW_SEND=false); flow enrollment is blocked.');
      }

      if (hasIds) {
        const res = await api<{ enrolled: number; total: number }>('POST', `/api/flows/${flow_id}/enroll`, {
          body: { subscriber_ids },
        });
        return `🚀 Enrolled ${res.enrolled} of ${res.total} into "${flow.name}".`;
      }
      const res = await api<any>('POST', `/api/flows/${flow_id}/enroll-segment`, { body: { segment_id } });
      return (
        `🚀 Enrolled ${res.enrolled} (skipped ${res.skipped} already running) from segment "${res.segment_name}" ` +
        `into "${flow.name}".` + (res.eta_minutes ? ` Staggered over ~${res.eta_minutes} min.` : '')
      );
    },
  );
}
