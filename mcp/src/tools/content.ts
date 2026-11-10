/**
 * Content tools — templates and segments.
 *
 * Templates are reusable HTML emails with Handlebars variables ({{first_name}},
 * {{custom.channel_link}}, …). Segments are saved filters over subscribers that
 * campaigns and flow enrollment target.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../client.js';
import { tool, truncate } from '../lib.js';

const SEGMENT_OPERATORS = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'gt', 'gte', 'lt', 'lte', 'in', 'not_in',
  'exists', 'not_exists', 'before', 'after', 'between',
] as const;

const conditionSchema = z.object({
  field: z
    .string()
    .describe(
      'Subscriber field: email, name, country, language, plan_tier, paid, cancelled, status, ' +
        'signup_source, tags, usage_count, last_login, created_at, engagement_score, or ' +
        'custom_attributes.<key>.',
    ),
  operator: z.enum(SEGMENT_OPERATORS).describe('Comparison operator.'),
  value: z.any().describe('Value to compare against (string/number/array; for "between" use [a, b]).'),
});

export function registerContentTools(server: McpServer): void {
  // ---- Templates -----------------------------------------------------------
  tool(
    server,
    'list_templates',
    {
      title: 'List templates',
      description: 'List email templates (id, name, subject, category, variables). Use the id when sending.',
    },
    {},
    async () => {
      const templates = await api<any[]>('GET', '/api/templates');
      if (!templates.length) return 'No templates yet. Create one with create_template.';
      return templates
        .map(
          (t) =>
            `${t._id}  "${truncate(t.name, 40)}"  subj: "${truncate(t.subject, 50)}"  [${t.category}]` +
            (t.variables?.length ? `  vars: ${t.variables.join(', ')}` : ''),
        )
        .join('\n');
    },
  );

  tool(
    server,
    'create_template',
    {
      title: 'Create template',
      description:
        'Create a reusable HTML email template. Variables in {{double_braces}} are auto-detected. ' +
        'Available vars at send time include {{first_name}}, {{name}}, {{email}}, {{plan_tier}}, ' +
        '{{unsubscribe_url}}, plus any custom_attributes (also as {{custom.key}}).',
    },
    {
      name: z.string().min(1).describe('Internal template name.'),
      subject: z.string().min(1).describe('Email subject line (may contain variables).'),
      html_content: z.string().min(1).describe('HTML body (may contain Handlebars variables).'),
      preview_text: z.string().optional().describe('Inbox preview/preheader text.'),
      category: z.string().optional().describe('Category label, e.g. "onboarding". Defaults to "marketing".'),
    },
    async (args) => {
      const t = await api('POST', '/api/templates', { body: args });
      return `✅ Created template "${t.name}" (${t._id}).` +
        (t.variables?.length ? ` Detected variables: ${t.variables.join(', ')}.` : '');
    },
  );

  // ---- Segments ------------------------------------------------------------
  tool(
    server,
    'list_segments',
    {
      title: 'List segments',
      description: 'List saved segments (id, name, current size, rule summary). Use the id to target a campaign or flow.',
    },
    {},
    async () => {
      const segments = await api<any[]>('GET', '/api/segments');
      if (!segments.length) return 'No segments yet. Create one with create_segment.';
      return segments
        .map((s) => {
          const conds = (s.rules?.conditions || [])
            .map((c: any) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`)
            .join(` ${s.rules?.operator || 'AND'} `);
          return `${s._id}  "${truncate(s.name, 40)}"  ~${s.subscriber_count} subs  [${conds || 'all active'}]`;
        })
        .join('\n');
    },
  );

  tool(
    server,
    'preview_segment_count',
    {
      title: 'Preview segment size',
      description:
        'Count how many ACTIVE subscribers match a set of conditions, WITHOUT saving a segment. ' +
        'Use this to size an audience before creating a segment or campaign.',
    },
    {
      operator: z.enum(['AND', 'OR']).describe('How to combine conditions.'),
      conditions: z.array(conditionSchema).min(1).describe('Condition list.'),
    },
    async ({ operator, conditions }: any) => {
      const res = await api<{ count: number }>('POST', '/api/segments/preview-count', {
        body: { operator, conditions },
      });
      return `${res.count} active subscriber(s) match.`;
    },
  );

  tool(
    server,
    'create_segment',
    {
      title: 'Create segment',
      description:
        'Save a segment (named filter) over subscribers. Returns the id and current size. ' +
        'Segments always implicitly require status=active. Tip: preview_segment_count first.',
    },
    {
      name: z.string().min(1).describe('Segment name.'),
      description: z.string().optional().describe('Optional description.'),
      operator: z.enum(['AND', 'OR']).describe('How to combine conditions.'),
      conditions: z.array(conditionSchema).min(1).describe('Condition list.'),
    },
    async ({ name, description, operator, conditions }: any) => {
      const s = await api('POST', '/api/segments', {
        body: { name, description: description || '', rules: { operator, conditions } },
      });
      return `✅ Created segment "${s.name}" (${s._id}) — ${s.subscriber_count} matching subscriber(s).`;
    },
  );
}
