export interface Subscriber {
  _id: string;
  email: string;
  name: string;
  country: string;
  language: string;
  plan_tier: string;
  last_login: string | null;
  usage_count: number;
  paid: boolean;
  cancelled: boolean;
  signup_source: string;
  tags: string[];
  custom_attributes: Record<string, any>;
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained';
  engagement: {
    emails_sent: number;
    emails_opened: number;
    emails_clicked: number;
    last_email_at: string | null;
  };
  frequency: {
    emails_sent_today: number;
    last_email_date: string | null;
  };
  engagement_score?: number;
  engagement_silence_penalty?: number;
  engagement_score_manual?: number;
  engagement_last_event_at?: string | null;
  engagement_manual_log?: { value: number; reason: string; by: string; at: string }[];
  created_at: string;
  updated_at: string;
}

export interface SegmentCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'before' | 'after' | 'between';
  value: any;
}

export interface SegmentRules {
  operator: 'AND' | 'OR';
  conditions: SegmentCondition[];
}

export interface Segment {
  _id: string;
  name: string;
  description: string;
  rules: SegmentRules;
  subscriber_count: number;
  is_dynamic: boolean;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  _id: string;
  name: string;
  subject: string;
  html_content: string;
  preview_text: string;
  category: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface FlowNodeData {
  label: string;
  templateId?: string;
  templateName?: string;
  subject?: string;
  delay?: { value: number; unit: 'minutes' | 'hours' | 'days' };
  condition?: SegmentCondition;
  splitPercentage?: number;
  tag?: string;
  action?: 'add' | 'remove';
  attributes?: Record<string, any>;
  webhookUrl?: string;
  triggerType?: 'manual' | 'scheduled';
  triggerConfig?: Record<string, any>;
  [key: string]: any;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface Flow {
  _id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  trigger: {
    type: 'manual' | 'scheduled';
    config: Record<string, any>;
  };
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: {
    frequency_cap: number;
    exit_conditions: any[];
    exit_on_reply?: boolean;
    enrollment_spread_seconds?: number;
  };
  stats: {
    enrolled: number;
    completed: number;
    active: number;
    exited?: number;
    failed?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  _id: string;
  name: string;
  subject: string;
  template_id: string;
  segment_id: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'cancelled';
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  send_config: {
    batch_size: number;
    emails_per_hour: number;
  };
  stats: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  temporal_workflow_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailEvent {
  _id: string;
  subscriber_id: string;
  campaign_id: string | null;
  flow_id: string | null;
  flow_execution_id: string | null;
  sendgrid_message_id: string;
  event: 'sent' | 'delivered' | 'open' | 'click' | 'bounce' | 'spamreport' | 'unsubscribe';
  metadata: {
    url?: string;
    user_agent?: string;
    ip?: string;
    reason?: string;
  };
  timestamp: string;
}

export interface FlowExecution {
  _id: string;
  flow_id: string;
  subscriber_id: { _id: string; email: string; name: string };
  status: 'running' | 'completed' | 'failed' | 'exited';
  current_node_id: string;
  entered_at: string;
  completed_at: string | null;
  history: { node_id: string; action: string; timestamp: string }[];
}

export interface CronJob {
  _id: string;
  name: string;
  description: string;
  type: 'segment_refresh' | 'flow_trigger' | 'campaign_send' | 'engagement_penalty' | 'flow_step_processor' | 'one_off_processor' | 'mailbox_pool_processor' | 'imap_poller';
  schedule: string;
  config: Record<string, any>;
  status: 'active' | 'paused';
  auto_managed: boolean;
  source_type: 'flow' | 'campaign' | 'manual' | 'system';
  source_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface CronJobRun {
  _id: string;
  cron_job_id: string;
  type: 'segment_refresh' | 'flow_trigger' | 'campaign_send' | 'engagement_penalty' | 'flow_step_processor' | 'one_off_processor' | 'mailbox_pool_processor' | 'imap_poller';
  status: 'success' | 'warning' | 'error';
  summary: string;
  details: Record<string, any>;
  ran_at: string;
  duration_ms: number;
}

export interface DashboardRecentEngagement {
  _id: string;
  timestamp: string;
  subscriber_id: string;
  subscriber_email: string;
  subscriber_name: string;
  source_type: 'campaign' | 'flow' | null;
  source_id: string | null;
  source_label: string;
  url?: string | null;
}

export interface DashboardRecentReply {
  _id: string;
  timestamp: string;
  subscriber_id: string;
  subscriber_email: string;
  subscriber_name: string;
  source_type: 'campaign' | 'flow_step' | 'one_off';
  source_id: string;
  flow_node_id?: string | null;
  subject: string;
  text_snippet: string;
}

export interface ScheduledSendSummary {
  _id: string;
  subject: string;
  recipient_count: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface PoolQueueSend {
  _id: string;
  subject: string;
  recipient_count: number;
  queued: number;
  sent: number;
  senders: string[];
  thread_followup: boolean;
  created_at: string;
}

export interface ScheduledSendsInfo {
  total_count: number;
  total_recipients: number;
  days_covered: number;
  latest_scheduled_at: string | null;
  indicator: 'healthy' | 'low' | 'empty';
  sends: ScheduledSendSummary[];
  pool?: { queued: number; daily_capacity: number; days: number; sends: PoolQueueSend[] };
}

export interface WeekRow {
  week_start: string;
  week_end: string;
  is_current: boolean;
  sent: number;
  new_contacts: number;
  followups: number;
  late_followups: number;
  bounced: number;
  bounce_rate: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  complaints: number;
  human_replies: number;
  unique_repliers: number;
  auto_replies: number;
  replies_per_100_sends: number;
  cohort_replied: number;
  cohort_reply_rate: number;
  by_sender: Record<string, { sent: number; bounced: number }>;
  bounce_reasons: Record<string, number>;
  findings: string[];
}

export interface WeeklyDiagnosis {
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
}

export interface WeeklyReportData {
  generated_at: string;
  weeks: WeekRow[];
  summary: {
    contacted: number;
    human_repliers: number;
    overall_reply_rate: number;
    sends_by_step: Record<string, number>;
    replies_by_step: Record<string, number>;
    reply_rate_by_step: Record<string, number>;
    first_email_reply_rate: number;
    followup_reply_rate: number;
    recent4_cohort_reply_rate: number;
    earlier_cohort_reply_rate: number;
  };
  diagnosis: WeeklyDiagnosis[];
  mailboxes: { email: string; kind: string; status: string; paused_reason: string | null; sent_total: number; bounced_total: number; replied_total: number; queued: number }[];
}

export interface DashboardStats {
  total_subscribers: number;
  active_subscribers: number;
  total_campaigns: number;
  active_flows: number;
  emails_sent_today: number;
  emails_sent_week: number;
  open_rate: number;
  click_rate: number;
  subscribers_by_status: Record<string, number>;
  subscribers_by_plan: Record<string, number>;
  recent_campaigns: Campaign[];
  recent_flows: Flow[];
  growth: { date: string; count: number }[];
  recent_opens: DashboardRecentEngagement[];
  recent_clicks: DashboardRecentEngagement[];
  recent_replies?: DashboardRecentReply[];
  scheduled_sends?: ScheduledSendsInfo;
  recent_one_offs?: OneOffSend[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Setting {
  _id: string;
  key: string;
  value: any;
}

// ============================================================================
// Inbox types
// ============================================================================
export type InboxSourceType = 'campaign' | 'flow_step' | 'one_off';

export interface InboxConversation {
  type: InboxSourceType;
  id: string;
  flow_node_id?: string | null;
  subject: string;
  preview: string;
  recipient_count: number;
  reply_count: number;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_last_message_at: string | null;
  unread: boolean;
  source_label: string;
  is_draft?: boolean;
}

export interface InboxRecipientRow {
  subscriber_id: string;
  email: string;
  name: string;
  subscriber_tags: string[];
  subscriber_status: string;
  latest_outbound_at: string;
  latest_status: string;
  reply_count: number;
  last_reply_at: string | null;
  user_reply_count: number;
  last_user_reply_at: string | null;
  needs_reply: boolean;
  engagement_score?: number;
  stage_id?: string | null;
}

export interface PipelineStage {
  _id: string;
  name: string;
  color: string;
  order: number;
  terminal: boolean;
  system: boolean;
}

export interface PipelineCard {
  label_id: string;
  subscriber_id: string;
  subscriber_name: string;
  subscriber_email: string;
  source_type: 'campaign' | 'flow_step' | 'one_off';
  source_id: string;
  flow_node_id: string | null;
  source_label: string;
  conversation_subject: string;
  stage_id: string;
  last_activity_at: string | null;
  reply_count: number;
}

export interface PipelineBoardColumn {
  stage: PipelineStage;
  total: number;
  cards: PipelineCard[];
}

export interface PipelineBoard {
  columns: PipelineBoardColumn[];
  unstaged_count: number;
  scan_capped?: boolean;
}

export interface InboxRenderedMessage {
  _id: string;
  direction: 'outbound' | 'inbound';
  subject: string;
  html_body: string;
  text_body: string;
  to_address: string;
  cc_addresses?: string[];
  bcc_addresses?: string[];
  from_address: string;
  sent_at: string | null;
  received_at: string | null;
  in_reply_to_message_id: string | null;
  is_auto_reply: boolean;
  status_summary: string;
  source_unavailable: boolean;
}

export interface InboxNote {
  _id: string;
  conversation_type: InboxSourceType;
  conversation_id: string;
  flow_node_id: string | null;
  body: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface InboxReminder {
  _id: string;
  user_id: string;
  target_kind?: 'conversation' | 'subscriber';
  conversation_type?: InboxSourceType | null;
  conversation_id?: string | null;
  flow_node_id: string | null;
  subscriber_id?: string | null;
  remind_at: string;
  note: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
  surfaced: boolean;
  created_at: string;
}

export interface ReminderWithTarget extends InboxReminder {
  target_kind: 'conversation' | 'subscriber';
  target_label: string;
  target_link: string | null;
}

export interface OneOffSend {
  _id: string;
  subject: string;
  html_body: string;
  template_id: string | null;
  from_address: string;
  cc_addresses?: string[];
  bcc_addresses?: string[];
  recipient_ids: string[];
  recipients?: Subscriber[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_at?: string | null;
  recipient_count: number;
  reply_count: number;
  inbox_tags: string[];
  inbox_starred: boolean;
  inbox_last_message_at: string;
  send_summary: { sent: number; skipped_frequency_cap: number; failed: number };
  sender_mode?: 'default' | 'pool' | 'mailbox';
  mailbox_ids?: string[];
  queue?: { queued: number; sending: number; sent: number; skipped: number; failed: number } | null;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
}

export interface Mailbox {
  _id: string;
  kind: 'sendgrid' | 'smtp';
  email: string;
  display_name: string;
  domain: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  has_password: boolean;
  status: 'active' | 'paused';
  paused_reason: string | null;
  include_in_pool: boolean;
  drop_footer: boolean;
  daily_cap: number;
  ramp: number[];
  warmup_started_at: string | null;
  send_window: { tz: string; start_hour: number; end_hour: number; days: number[] };
  gap_min_sec: number;
  gap_max_sec: number;
  auto_pause: { bounces_per_day: number; complaints_per_day: number };
  imap_last_polled_at: string | null;
  last_sent_at: string | null;
  last_error: string | null;
  stats: { sent_total: number; bounced_total: number; replied_total: number; opted_out_total: number };
  warmup_day: number;
  allowance_today: number;
  sent_today: number;
  queued: number;
  bounces_today: number;
  complaints_today: number;
  in_window: boolean;
}

export interface MailboxPoolSummary {
  status: { queued: number; sending: number; sent: number; skipped: number; failed: number };
  sends: Array<{ _id: string; subject: string; status: string; created_at: string; sent_at: string | null; recipient_count: number; sender_mode: string; queue: Record<string, number> }>;
}

export interface MailboxMessage {
  _id: string;
  direction: 'outbound' | 'inbound';
  to_address: string;
  from_address: string;
  subject_override: string | null;
  sent_at: string | null;
  received_at: string | null;
  status_summary: string;
  is_auto_reply: boolean;
  subscriber: { _id: string; email: string; name: string } | null;
}

export interface CalBooking {
  _id: string;
  cal_booking_id: string;
  event_title: string;
  trigger_event: string;
  subscriber_id?: { _id: string; email: string; name?: string; status?: string } | string | null;
  attendee_email: string;
  attendee_name: string;
  start_time: string;
  end_time: string;
  status: 'ACCEPTED' | 'CANCELLED' | 'RESCHEDULED' | 'PENDING';
  meeting_url?: string | null;
  created_at: string;
}

export interface EngagedProspect {
  subscriber_id: string;
  email: string;
  name: string;
  status: string;
  plan_tier: string;
  country: string;
  tags: string[];
  custom_attributes: Record<string, any>;
  total_opens: number;
  total_clicks: number;
  intent_tier: 'hot' | 'warm' | 'cold';
  intent_score: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  last_active_at: string | null;
  clicked_urls: string[];
  pipeline_stage: string;
  pipeline_stage_color: string;
}

export interface EngagedProspectsResponse {
  data: EngagedProspect[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  kpis: {
    total_viewers: number;
    hot_count: number;
    clickers_count: number;
    multi_open_count: number;
  };
}

export interface EngagedProspectsQuery {
  page?: number;
  limit?: number;
  minOpens?: number;
  minClicks?: number;
  hasClicked?: 'all' | 'yes' | 'no';
  timeframe?: '24h' | '7d' | '30d' | 'all';
  startDate?: string;
  endDate?: string;
  excludeReplied?: boolean;
  search?: string;
  sortBy?: 'opens' | 'clicks' | 'last_active' | 'first_opened' | 'score';
  sortOrder?: 'asc' | 'desc';
}
