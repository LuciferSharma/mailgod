import { BookOpen, Users, Filter, FileText, GitBranch, Send, Clock, BarChart3, Activity, AlertTriangle, Upload } from 'lucide-react';

const sections = [
  {
    icon: Users,
    title: 'Subscribers',
    points: [
      'Subscribers are the people you send emails to. They are separate from your app users.',
      'Each subscriber has a status: active, unsubscribed, bounced, or complained. Only active subscribers receive emails.',
      'Add subscribers manually one at a time, or import many at once via CSV (see "Importing CSVs" section below).',
      'You can bulk-tag, bulk-delete, or export selected subscribers from the Subscribers list.',
      'Click any subscriber to see their full profile: send/open/click history, all custom fields, tags, and a Custom Fields card to add free-form data per person.',
    ],
  },
  {
    icon: Upload,
    title: 'Importing CSVs',
    points: [
      'Click "Import CSV" on the Subscribers page. The platform parses the file, shows a preview, then imports on confirmation.',
      'The first row is treated as headers. Header names are case-sensitive. Use lowercase, snake_case (e.g. channel_link, not "Channel Link").',
      'STANDARD COLUMNS (recognized automatically):',
      '   • email — REQUIRED. Must be a real email address. Rows with non-email values (names, notes, blanks) are skipped and reported on the import screen.',
      '   • name — full name (e.g. "Alice Cooper")',
      '   • country — ISO code or full name (e.g. "IN" or "India")',
      '   • plan_tier — your tier label (free, $9, $29, etc.)',
      '   • signup_source — where they came from (e.g. "podcast", "youtube", "referral")',
      '   • status — active / unsubscribed / bounced / complained (defaults to active if omitted)',
      '   • language — locale code (e.g. "en", "hi")',
      '   • tags — separated by either ; or , (e.g. "podcaster;creator;vip" OR "podcaster,creator,vip"). If using commas, the whole tags field must be wrapped in double quotes so the CSV parser treats it as one field, not three.',
      'CUSTOM FIELDS:',
      '   • Any column NOT in the standard set above is automatically stored as a custom field on each subscriber.',
      '   • Examples: channel_link, mrr, last_episode_date, instagram_handle, company_name, notes',
      '   • Type is auto-detected: URLs (https://...) render as clickable links; numbers enable greater/less-than segment rules; ISO dates (2026-05-03) enable before/after rules.',
      '   • Custom fields appear in the subscriber profile, can be added as table columns, used in segment rules, and inserted into emails as {{channel_link}}.',
      'RE-IMPORTS (same email exists already):',
      '   • Standard fields are NOT overwritten — original values stay.',
      '   • Tags are MERGED — new tags add, existing ones stay (no duplicates).',
      '   • Custom fields are MERGED per-key — only the keys present in the new CSV update; others remain untouched. Useful for refreshing one column without touching the rest.',
      'A small example CSV is shown in the next section.',
    ],
  },
  {
    icon: FileText,
    title: 'Example CSV',
    points: [
      'A minimal CSV with mixed standard and custom fields:',
      '   email,name,plan_tier,signup_source,tags,channel_link,mrr',
      '   alice@example.com,Alice Cooper,$29,podcast,podcaster;vip,https://youtube.com/@alice,290',
      '   bob@example.com,Bob Smith,free,referral,creator,https://instagram.com/bob,0',
      '   carol@example.com,Carol Jones,$49,youtube,podcaster;creator;vip,https://youtube.com/@carol,490',
      'After import, each subscriber will have:',
      '   • Standard fields: email, name, plan_tier, signup_source set',
      '   • Tags array (e.g. Alice has [podcaster, vip])',
      '   • Custom fields: channel_link (clickable URL), mrr (numeric, usable in segment rules like "mrr > 100")',
      'In an email composer or template you could write: "Hi {{first_name}}, your channel {{channel_link}} is doing well — you\'re at ${{mrr}} MRR."',
      'TIP: Save your CSV as UTF-8 to support international names and special characters. Excel\'s default save format may strip them.',
    ],
  },
  {
    icon: Filter,
    title: 'Segments',
    points: [
      'Segments are dynamic groups of subscribers based on rules (e.g. plan_tier = "$29", tags contains "podcaster").',
      'Segment counts refresh automatically. Use them to target campaigns and flows.',
      'A subscriber can belong to multiple segments. Changing a subscriber\'s data automatically updates which segments they match.',
    ],
  },
  {
    icon: FileText,
    title: 'Templates',
    points: [
      'Templates are the email content (HTML + subject line) used by flows and campaigns.',
      'Use {{name}}, {{first_name}}, {{email}}, {{plan_tier}}, {{unsubscribe_url}} for subscriber variables — these are auto-filled.',
      'Custom variables like {{company_name}} are global and set in Settings > Template Variables.',
      'The inline "Preview" button shows a live rendering. "Preview as Email" shows it in a Gmail-like frame.',
      'Always test with "Send Test" before using a template in a campaign.',
    ],
  },
  {
    icon: GitBranch,
    title: 'Flows',
    color: 'text-orange-500',
    points: [
      'A flow is an automation sequence: trigger > send email > wait > condition > send another email, etc.',
      'FLOWS vs CAMPAIGNS — common confusion:',
      '   • Campaign = one-time blast to a segment. Pick segment + template + subject, send once.',
      '   • Flow = multi-step sequence (with delays/conditions). Pick a segment, enroll, the flow walks each subscriber through every step over time.',
      '   • You do NOT send a flow through the Campaigns page. They are separate surfaces.',
      'Creating a flow does NOT send any emails. You must build the flow in the editor, then activate it.',
      'ENROLLING A SEGMENT INTO AN ACTIVE FLOW:',
      '   • Click the green "Enroll Segment" button in the FlowBuilder header (visible once the flow is active).',
      '   • Pick a segment in the modal that opens.',
      '   • Every active subscriber in that segment starts the flow. Subscribers already in the flow are auto-skipped (safe to re-enroll later).',
      'Flows have two trigger types:',
      '   \u2022 Manual — subscribers are enrolled only when you click "Enroll Segment" in the flow editor',
      '   \u2022 Scheduled — pick a segment and frequency (hourly/daily/weekly/monthly). When activated, the platform auto-creates a scheduled job that checks for new matching subscribers on your schedule.',
      'Once enrolled, a subscriber walks through the flow nodes in order. Delays are persisted to MongoDB (ScheduledFlowStep) and processed by a 1-minute cron — so deploys, restarts, or instance scale-down DO NOT lose in-flight delays. A subscriber waiting 3 days for the next email will still get it even if the server restarts 50 times in between.',
      'DELAY RESOLUTION: ~1 minute. A "5-second delay" will actually fire on the next cron tick (up to a minute later). For tight transactional sequences use Temporal; for marketing cadence (minutes/hours/days) Mongo scheduling is correct.',
      'ENROLLMENT SPREAD:',
      '   • The "Spread Xs" input in the FlowBuilder header controls how far apart bulk enrollments fire. Default 10s.',
      '   • Enrolling 100 subscribers with spread=10s means the first email fires now, the 100th fires ~16min later — protects sender reputation, avoids SendGrid burst limits, and gives you time to pause if something looks wrong.',
      '   • Set spread to 0 for instant enrollment (legacy behavior — only safe for tiny segments or testing).',
      'PAUSE / RESUME (use before deploys or when something looks wrong):',
      '   • On the Flows page, click "Pause" on any active flow. This marks the flow paused AND holds every pending scheduled step for it — no subscriber will get the next email until you resume.',
      '   • Click "Activate" to resume — held steps go back to pending and the cron picks them up within ~1 minute. No data lost.',
      '   • Use this around risky deploys: pause all active flows, deploy, verify, then resume. Subscribers waiting in delays just wait a bit longer.',
      'EXIT ON REPLY:',
      '   • By default every flow has "Exit on reply" enabled (toggle in the FlowBuilder header — green dot = on).',
      '   • If a subscriber replies to ANY email in this flow, they\'re automatically removed before the next step fires. Their execution status flips to "exited" with history entry "exit_on_reply".',
      '   • Auto-replies (vacation responders, OOO) do NOT trigger this. We detect those via headers + subject patterns and ignore them.',
      '   • Anyone who replies also gets a "responded" tag added to their subscriber record automatically. Filter Subscribers by that tag (or build segments on it) to find your warm pipeline.',
      '   • Disable per-flow via the FlowBuilder header toggle if you want a sequence to keep firing after a reply (rare; usually wrong).',
      'THREADING:',
      '   • Email 2, 3, etc. in a flow thread under email 1 in the recipient\'s mail client. They see a single ongoing conversation, not separate emails.',
      'You can view all executions (who entered, where they are, what happened) from the Flows page or the flow editor.',
      'Pausing a flow automatically pauses its scheduled job. Deleting a flow removes the job too.',
    ],
  },
  {
    icon: Send,
    title: 'Campaigns',
    points: [
      'A campaign is a one-time email blast to a segment.',
      'Create a campaign by picking a segment (who to send to) and a template (what to send).',
      'Campaigns start as "draft". Schedule them to set a send date, or send immediately.',
      'When sending, you can track real-time progress on the campaign detail page — it shows a progress bar and per-subscriber status.',
      'After sending, the campaign moves to "sent" and you can see delivery, open, and click stats.',
    ],
  },
  {
    icon: Clock,
    title: 'Scheduled Jobs',
    color: 'text-yellow-500',
    points: [
      'Scheduled jobs run tasks on a schedule. Most are auto-created by the platform — you rarely need to create them manually.',
      'Jobs marked "Auto" are managed by their parent flow. They sync automatically when you activate, pause, or delete the flow.',
      'If a scheduled job triggers a paused flow, it reports a warning — the job still runs, but the flow won\'t process.',
      'Types: "Segment Refresh" recalculates all segment counts. "Flow Trigger" enrolls matching subscribers into a flow. "Campaign Send" starts a scheduled campaign.',
      'Every run is logged — expand a job row to see run history with status, summary, and duration.',
      'You can click "Run" to execute a job immediately (outside its schedule) for testing.',
    ],
  },
  {
    icon: Activity,
    title: 'Activity Log',
    points: [
      'The Activity Log shows every email event: sent, delivered, opened, clicked, bounced, spam reports, unsubscribes.',
      '"Sent" events are recorded immediately when an email is handed to SendGrid.',
      '"Delivered", "Opened", and "Clicked" events come from SendGrid webhooks — there may be a delay of seconds to minutes.',
      'If an email fails (subscriber inactive, frequency cap, template missing), it appears as a "Bounce" with the reason in the details.',
      'Filter by event type or source (campaign vs. flow) to narrow down what you\'re looking for.',
    ],
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    points: [
      'Open rate and click rate are calculated from SendGrid webhook data. If these show 0%, check that the SendGrid Event Webhook is configured.',
      'The daily email activity chart shows sent/opened/clicked counts per day for the last 30 days.',
      'Trend arrows show week-over-week changes.',
    ],
  },
];

const commonMistakes = [
  { mistake: '"I activated the flow but no emails were sent"', fix: 'For Manual trigger flows, you must click "Enroll Segment" in the editor. For Scheduled trigger flows, subscribers are enrolled on the next scheduled run — check the Scheduled Jobs page to verify.' },
  { mistake: '"The scheduled job shows success but no one was enrolled"', fix: 'The job ran but found no new subscribers matching the segment. Check the segment rules, or check if all matching subscribers are already enrolled.' },
  { mistake: '"Open/click rates are 0% even though emails were sent"', fix: 'Open and click data comes from SendGrid webhooks. Make sure the Event Webhook is configured in SendGrid pointing to your server.' },
  { mistake: '"Emails are bouncing with \'Frequency cap reached\'"', fix: 'Each subscriber has a daily email limit (set in Settings). If they\'ve already received their max for the day, further emails are blocked.' },
  { mistake: '"I imported a CSV but tags didn\'t come through"', fix: 'Tags must be in a column named "tags". Separate with ; or , — both work. If you use commas, the tags field MUST be wrapped in double quotes (e.g. "podcaster,creator") or the CSV parser will split them into separate columns.' },
  { mistake: '"My CSV says \'X imported\' but I had more rows than that"', fix: 'Rows with invalid emails (text instead of an email address, blank, etc.) are skipped automatically. The import progress card has a "Show skipped invalid emails" expandable list with the actual values that were rejected so you can fix the source file.' },
  { mistake: '"My custom field {{channel_link}} doesn\'t show up in the email"', fix: 'Make sure the custom field column name matches what you\'re using in the template — they\'re case-insensitive but must spell match. Verify the value exists on the test subscriber by opening their profile.' },
];

export default function GuidePage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/15 rounded-lg">
            <BookOpen className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-heading">Platform Guide</h1>
        </div>
        <p className="text-subtle">How everything works together — read this before sending your first campaign.</p>
      </div>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-5 py-4 mb-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-heading mb-2">Common Mistakes</h3>
            <div className="space-y-3">
              {commonMistakes.map((item, i) => (
                <div key={i}>
                  <p className="text-xs text-body font-medium">{item.mistake}</p>
                  <p className="text-xs text-subtle mt-0.5">{item.fix}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="bg-card rounded-lg border border-line p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <Icon className={`w-5 h-5 ${(section as any).color || 'text-blue-500'}`} />
                <h2 className="text-lg font-semibold text-heading">{section.title}</h2>
              </div>
              <ul className="space-y-1.5">
                {section.points.map((point, i) => {
                  const indented = point.startsWith('   ');
                  const trimmed = indented ? point.trim() : point;
                  // ALL-CAPS line ending in ":" \u2192 render as a section subhead, not a bullet
                  const isSubhead = !indented && /^[A-Z][A-Z0-9 _\-()]+:?$/.test(point.split(':')[0]) && point.endsWith(':');
                  // Code-like lines (start with "   " AND contain commas or look like CSV/template) get monospace
                  const isCode = indented && (trimmed.includes(',') || trimmed.startsWith('email,'));

                  if (isSubhead) {
                    return (
                      <li key={i} className="text-xs font-semibold text-heading uppercase tracking-wider mt-3 mb-0.5 list-none">
                        {point.replace(/:$/, '')}
                      </li>
                    );
                  }
                  return (
                    <li key={i} className={`text-sm ${indented ? 'ml-4 text-body' : 'text-subtle'} ${isCode ? 'font-mono text-xs bg-elevated rounded px-2 py-1 inline-block' : ''}`}>
                      {indented ? trimmed : `\u2022 ${trimmed}`}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-lg border border-line p-5 mt-6">
        <h2 className="text-lg font-semibold text-heading mb-3">Typical Workflow</h2>
        <ol className="space-y-2">
          {[
            'Import subscribers (CSV with standard + custom columns, or add manually) — see "Importing CSVs" above for column reference',
            'Create segments to group your audience (e.g. "Podcasters", "Paid users")',
            'Build email templates with your content',
            'Option A: Create a campaign to send a one-time blast to a segment',
            'Option B: Build a flow for automated sequences — set trigger to "Scheduled" with a segment, activate, and it runs automatically',
            'Monitor sends in Activity Log, track performance in Analytics',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-subtle">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
