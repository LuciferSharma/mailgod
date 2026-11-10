import api from './client';
import type { Mailbox, MailboxPoolSummary, MailboxMessage, WeeklyReportData } from '../types';
import type {
  Subscriber, Segment, Template, Flow, Campaign,
  CronJob, DashboardStats, PaginatedResponse, Setting, EmailEvent,
  InboxConversation, InboxRecipientRow, InboxRenderedMessage,
  InboxNote, InboxReminder, ReminderWithTarget, OneOffSend, PipelineStage, PipelineBoard, CalBooking,
  EngagedProspect, EngagedProspectsResponse, EngagedProspectsQuery,
} from '../types';

export const subscriberApi = {
  list: (params?: Record<string, any>) =>
    api.get<PaginatedResponse<Subscriber>>('/subscribers', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ subscriber: Subscriber; events: EmailEvent[] }>(`/subscribers/${id}`).then(r => r.data),
  create: (data: Partial<Subscriber>) =>
    api.post<Subscriber>('/subscribers', data).then(r => r.data),
  update: (id: string, data: Partial<Subscriber>) =>
    api.put<Subscriber>(`/subscribers/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/subscribers/${id}`).then(r => r.data),
  import: (formData: FormData) =>
    api.post('/subscribers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
  importPreview: (formData: FormData) =>
    api.post('/subscribers/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
  addTags: (id: string, tags: string[]) =>
    api.post(`/subscribers/${id}/tags`, { tags }).then(r => r.data),
  removeTag: (id: string, tag: string) =>
    api.delete(`/subscribers/${id}/tags/${encodeURIComponent(tag)}`).then(r => r.data),
  stats: () =>
    api.get('/subscribers/stats').then(r => r.data),
  getImportStatus: (jobId: string) =>
    api.get(`/subscribers/import/status/${jobId}`).then(r => r.data),
  bulkAction: (action: string, subscriberIds: string[], tag?: string) =>
    api.post('/subscribers/bulk-action', { action, subscriberIds, tag }, {
      ...(action === 'export' ? { responseType: 'blob' } : {}),
    }).then(r => r.data),
  discoverTags: () =>
    api.get<{ tag: string; count: number }[]>('/subscribers/tags/discover').then(r => r.data),
  discoverCustomFields: () =>
    api.get<{ key: string; count: number; type: 'text' | 'url' | 'number' | 'date'; sample: string }[]>(
      '/subscribers/custom-fields/discover'
    ).then(r => r.data),
  setEngagementManual: (id: string, value: number, reason?: string) =>
    api.put<Subscriber>(`/subscribers/${id}/engagement/manual`, { value, reason }).then(r => r.data),
  backfillEngagement: () =>
    api.post<{ status: string; total: number }>('/admin/backfill-engagement-scores').then(r => r.data),
  setCustomField: (id: string, key: string, value: any) =>
    api.put<Subscriber>(`/subscribers/${id}/custom-fields/${encodeURIComponent(key)}`, { value }).then(r => r.data),
  deleteCustomField: (id: string, key: string) =>
    api.delete<Subscriber>(`/subscribers/${id}/custom-fields/${encodeURIComponent(key)}`).then(r => r.data),
};

export const segmentApi = {
  list: () =>
    api.get<Segment[]>('/segments').then(r => r.data),
  get: (id: string) =>
    api.get<Segment>(`/segments/${id}`).then(r => r.data),
  create: (data: Partial<Segment>) =>
    api.post<Segment>('/segments', data).then(r => r.data),
  update: (id: string, data: Partial<Segment>) =>
    api.put<Segment>(`/segments/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/segments/${id}`).then(r => r.data),
  getSubscribers: (id: string, params?: Record<string, any>) =>
    api.get<PaginatedResponse<Subscriber>>(`/segments/${id}/subscribers`, { params }).then(r => r.data),
  refresh: (id: string) =>
    api.post(`/segments/${id}/refresh`).then(r => r.data),
  previewCount: (operator: string, conditions: any[]) =>
    api.post('/segments/preview-count', { operator, conditions }).then(r => r.data),
};

export const templateApi = {
  list: () =>
    api.get<Template[]>('/templates').then(r => r.data),
  get: (id: string) =>
    api.get<Template>(`/templates/${id}`).then(r => r.data),
  create: (data: Partial<Template>) =>
    api.post<Template>('/templates', data).then(r => r.data),
  update: (id: string, data: Partial<Template>) =>
    api.put<Template>(`/templates/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/templates/${id}`).then(r => r.data),
  duplicate: (id: string, name?: string) =>
    api.post<Template>(`/templates/${id}/duplicate`, { name }).then(r => r.data),
  preview: (id: string, variables?: Record<string, any>) =>
    api.post<{ html: string }>(`/templates/${id}/preview`, { variables }).then(r => r.data),
  testSend: (id: string, email: string, variables?: Record<string, any>) =>
    api.post(`/templates/${id}/test-send`, { email, variables }).then(r => r.data),
};

export const flowApi = {
  list: () =>
    api.get<Flow[]>('/flows').then(r => r.data),
  get: (id: string) =>
    api.get<Flow>(`/flows/${id}`).then(r => r.data),
  create: (data: Partial<Flow>) =>
    api.post<Flow>('/flows', data).then(r => r.data),
  update: (id: string, data: Partial<Flow>) =>
    api.put<Flow>(`/flows/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/flows/${id}`).then(r => r.data),
  activate: (id: string, reenroll?: boolean) =>
    api.post(`/flows/${id}/activate${reenroll ? '?reenroll=true' : ''}`).then(r => r.data),
  pause: (id: string) =>
    api.post(`/flows/${id}/pause`).then(r => r.data),
  duplicate: (id: string, name?: string) =>
    api.post<Flow>(`/flows/${id}/duplicate`, { name }).then(r => r.data),
  enroll: (id: string, subscriberIds: string[]) =>
    api.post(`/flows/${id}/enroll`, { subscriber_ids: subscriberIds }).then(r => r.data),
  enrollSegment: (id: string, segment_id: string) =>
    api.post<{ enrolled: number; skipped: number; segment_name: string; segment_size: number; spread_seconds: number; eta_minutes: number }>(
      `/flows/${id}/enroll-segment`, { segment_id }
    ).then(r => r.data),
  getExecutions: (id: string) =>
    api.get(`/flows/${id}/executions`).then(r => r.data),
};

export const campaignApi = {
  list: () =>
    api.get<Campaign[]>('/campaigns').then(r => r.data),
  get: (id: string) =>
    api.get<Campaign>(`/campaigns/${id}`).then(r => r.data),
  create: (data: Partial<Campaign>) =>
    api.post<Campaign>('/campaigns', data).then(r => r.data),
  update: (id: string, data: Partial<Campaign>) =>
    api.put<Campaign>(`/campaigns/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/campaigns/${id}`).then(r => r.data),
  send: (id: string) =>
    api.post(`/campaigns/${id}/send`).then(r => r.data),
  schedule: (id: string, scheduledAt: string) =>
    api.post(`/campaigns/${id}/schedule`, { scheduled_at: scheduledAt }).then(r => r.data),
  pause: (id: string) =>
    api.post(`/campaigns/${id}/pause`).then(r => r.data),
  resume: (id: string) =>
    api.post(`/campaigns/${id}/resume`).then(r => r.data),
  cancel: (id: string) =>
    api.post(`/campaigns/${id}/cancel`).then(r => r.data),
  nextBatch: (id: string) =>
    api.get<{
      recipients: { _id: string; email: string; name: string; plan_tier: string }[];
      remaining: number;
      batch_size: number;
      next_batch_at: string | null;
      last_batch_completed_at: string | null;
      last_batch_size: number;
    }>(`/campaigns/${id}/next-batch`).then(r => r.data),
};

export const analyticsApi = {
  dashboard: () =>
    api.get<DashboardStats>('/analytics/dashboard').then(r => r.data),
  trends: () =>
    api.get('/analytics/trends').then(r => r.data),
  weeklyReports: (weeks = 26) =>
    api.get<WeeklyReportData>('/analytics/weekly-reports', { params: { weeks } }).then(r => r.data),
  weeklyReportMarkdown: (weeks = 26) =>
    api.get<string>('/analytics/weekly-reports', { params: { weeks, format: 'md' }, responseType: 'text' }).then(r => r.data),
  calBookings: (limit = 10) =>
    api.get<CalBooking[]>(`/webhooks/cal/bookings?limit=${limit}`).then(r => r.data),
  campaign: (id: string) =>
    api.get(`/analytics/campaigns/${id}`).then(r => r.data),
  flow: (id: string) =>
    api.get(`/analytics/flows/${id}`).then(r => r.data),
  activity: (params?: Record<string, any>) =>
    api.get('/analytics/activity', { params }).then(r => r.data),
  campaignRecipients: (id: string, params?: Record<string, any>) =>
    api.get(`/analytics/campaigns/${id}/recipients`, { params }).then(r => r.data),
  engagedProspects: (params?: EngagedProspectsQuery) =>
    api.get<EngagedProspectsResponse>('/analytics/engaged-prospects', { params }).then(r => r.data),
  exportEngagedProspectsCsv: (params?: EngagedProspectsQuery) => {
    const searchParams = new URLSearchParams();
    searchParams.set('export', 'csv');
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.set(k, String(v));
        }
      });
    }
    return api.get(`/analytics/engaged-prospects?${searchParams.toString()}`, {
      responseType: 'blob',
    }).then(r => r.data);
  },
};

export const cronJobApi = {
  list: () =>
    api.get<CronJob[]>('/cron-jobs').then(r => r.data),
  create: (data: Partial<CronJob>) =>
    api.post<CronJob>('/cron-jobs', data).then(r => r.data),
  update: (id: string, data: Partial<CronJob>) =>
    api.put<CronJob>(`/cron-jobs/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/cron-jobs/${id}`).then(r => r.data),
  toggle: (id: string) =>
    api.post(`/cron-jobs/${id}/toggle`).then(r => r.data),
  run: (id: string) =>
    api.post(`/cron-jobs/${id}/run`).then(r => r.data),
  getRuns: (id: string, limit?: number) =>
    api.get(`/cron-jobs/${id}/runs`, { params: { limit: limit || 20 } }).then(r => r.data),
};

export const reminderApi = {
  list: (params?: { includeDismissed?: boolean; kind?: 'conversation' | 'subscriber' }) =>
    api.get<ReminderWithTarget[]>('/reminders', {
      params: {
        includeDismissed: params?.includeDismissed ? 'true' : undefined,
        kind: params?.kind,
      },
    }).then(r => r.data),
  create: (data: {
    target_kind: 'conversation' | 'subscriber';
    conversation_type?: string;
    conversation_id?: string;
    flow_node_id?: string | null;
    subscriber_id?: string;
    remind_at: string;
    note?: string | null;
  }) => api.post<InboxReminder>('/reminders', data).then(r => r.data),
  dismiss: (id: string) => api.post(`/reminders/${id}/dismiss`).then(r => r.data),
};

export const settingsApi = {
  get: () =>
    api.get<Setting[]>('/settings').then(r => r.data),
  update: (settings: Record<string, any>) =>
    api.put('/settings', settings).then(r => r.data),
};

export const inboxApi = {
  conversations: (params?: Record<string, any>) =>
    api.get<{ data: InboxConversation[]; total: number; page: number; limit: number }>(
      '/inbox/conversations', { params }
    ).then(r => r.data),
  conversationDetail: (type: string, id: string, flow_node_id?: string | null) =>
    api.get(`/inbox/conversations/${type}/${id}`, {
      params: flow_node_id ? { flow_node_id } : {},
    }).then(r => r.data),
  recipients: (type: string, id: string, params?: Record<string, any>) =>
    api.get<{
      data: InboxRecipientRow[];
      total: number;
      page: number;
      limit: number;
      total_replied?: number;
      total_needs_reply?: number;
    }>(
      `/inbox/conversations/${type}/${id}/recipients`, { params }
    ).then(r => r.data),
  thread: (type: string, id: string, subscriber_id: string, params?: Record<string, any>) =>
    api.get<{
      subscriber: any;
      messages: InboxRenderedMessage[];
      total: number;
      page: number;
      limit: number;
    }>(`/inbox/threads/${type}/${id}/${subscriber_id}`, { params }).then(r => r.data),
  recentMessages: (subscriber_id: string, limit = 10) =>
    api.get<{
      total: number;
      outbound: number;
      inbound: number;
      items: {
        _id: string;
        direction: 'outbound' | 'inbound';
        source_type: string;
        source_id: string;
        flow_node_id: string | null;
        subject: string | null;
        preview: string;
        at: string | null;
        status: string;
      }[];
    }>(`/inbox/subscriber/${subscriber_id}/recent-messages`, { params: { limit } }).then(r => r.data),
  reply: (type: string, id: string, subscriber_id: string, body: any, params?: Record<string, any>) =>
    api.post(`/inbox/threads/${type}/${id}/${subscriber_id}/reply`, body, { params }).then(r => r.data),
  previewRender: (html_body: string, body_format: 'plain' | 'html' | 'auto' = 'auto') =>
    api.post<{ rendered_html: string }>('/inbox/preview-render', { html_body, body_format }).then(r => r.data),
  archive: (type: string, id: string, archived: boolean, flow_node_id?: string | null) =>
    api.post(`/inbox/conversations/${type}/${id}/archive`, { archived }, {
      params: flow_node_id ? { flow_node_id } : {},
    }).then(r => r.data),
  forward: (data: { source_message_id: string; to: string[]; subject?: string; prefix_body?: string; cc?: string[]; bcc?: string[] }) =>
    api.post('/inbox/forward', data).then(r => r.data),
  toggleStar: (type: string, id: string, flow_node_id?: string | null) =>
    api.post(`/inbox/conversations/${type}/${id}/star`, {}, {
      params: flow_node_id ? { flow_node_id } : {},
    }).then(r => r.data),
  updateTags: (type: string, id: string, body: { add?: string[]; remove?: string[] }, flow_node_id?: string | null) =>
    api.post(`/inbox/conversations/${type}/${id}/tags`, body, {
      params: flow_node_id ? { flow_node_id } : {},
    }).then(r => r.data),
  markRead: (type: string, id: string, flow_node_id?: string | null) =>
    api.post(`/inbox/conversations/${type}/${id}/read`, {}, {
      params: flow_node_id ? { flow_node_id } : {},
    }).then(r => r.data),
  notes: (params: Record<string, any>) =>
    api.get<InboxNote[]>('/inbox/notes', { params }).then(r => r.data),
  createNote: (data: any) => api.post<InboxNote>('/inbox/notes', data).then(r => r.data),
  updateNote: (id: string, body: string) =>
    api.put<InboxNote>(`/inbox/notes/${id}`, { body }).then(r => r.data),
  deleteNote: (id: string) => api.delete(`/inbox/notes/${id}`).then(r => r.data),
  reminders: (includeDismissed?: boolean) =>
    api.get<InboxReminder[]>('/inbox/reminders', {
      params: includeDismissed ? { includeDismissed: 'true' } : {},
    }).then(r => r.data),
  createReminder: (data: any) => api.post<InboxReminder>('/inbox/reminders', data).then(r => r.data),
  dismissReminder: (id: string) =>
    api.post(`/inbox/reminders/${id}/dismiss`).then(r => r.data),
  tags: () => api.get<string[]>('/inbox/tags').then(r => r.data),
  unreadCount: () =>
    api.get<{ unread: number; due_reminders: number }>('/inbox/unread-count').then(r => r.data),
};

export const pipelineApi = {
  stages: () => api.get<PipelineStage[]>('/pipeline/stages').then(r => r.data),
  setStage: (body: {
    subscriber_id: string;
    source_type: string;
    source_id: string;
    flow_node_id?: string | null;
    stage_id: string | null;
  }) => api.post<{ ok: boolean; stage_id: string | null }>('/pipeline/stage', body).then(r => r.data),
  createStage: (body: { name: string; color?: string; terminal?: boolean }) =>
    api.post<PipelineStage>('/pipeline/stages', body).then(r => r.data),
  updateStage: (id: string, body: { name?: string; color?: string; terminal?: boolean }) =>
    api.patch<PipelineStage>(`/pipeline/stages/${id}`, body).then(r => r.data),
  reorderStages: (ids: string[]) =>
    api.patch<PipelineStage[]>('/pipeline/stages/reorder', { order: ids }).then(r => r.data),
  deleteStage: (id: string, reassignTo?: string) =>
    api.delete(`/pipeline/stages/${id}`, { params: reassignTo ? { reassignTo } : {} }).then(r => r.data),
  board: (params?: { source?: string; search?: string; limit?: number }) =>
    api.get<PipelineBoard>('/pipeline/board', { params }).then(r => r.data),
};

export const oneOffSendApi = {
  list: (params?: Record<string, any>) =>
    api.get<OneOffSend[]>('/one-off-sends', { params }).then(r => r.data),
  get: (id: string) => api.get<OneOffSend>(`/one-off-sends/${id}`).then(r => r.data),
  create: (data: any) => api.post<OneOffSend>('/one-off-sends', data).then(r => r.data),
  update: (id: string, data: any) => api.put<OneOffSend>(`/one-off-sends/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/one-off-sends/${id}`).then(r => r.data),
  send: (id: string) => api.post(`/one-off-sends/${id}/send`).then(r => r.data),
};

export const mailboxApi = {
  list: () => api.get<Mailbox[]>('/mailboxes').then(r => r.data),
  create: (data: any) => api.post<Mailbox & { test?: any }>('/mailboxes', data).then(r => r.data),
  update: (id: string, data: any) => api.put<Mailbox>(`/mailboxes/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/mailboxes/${id}`).then(r => r.data),
  test: (id: string) => api.post<{ smtp: string; imap: string; ok: boolean }>(`/mailboxes/${id}/test`).then(r => r.data),
  pause: (id: string) => api.post<Mailbox>(`/mailboxes/${id}/pause`).then(r => r.data),
  resume: (id: string) => api.post<Mailbox>(`/mailboxes/${id}/resume`).then(r => r.data),
  poll: (id: string) => api.post(`/mailboxes/${id}/poll`).then(r => r.data),
  messages: (id: string) => api.get<MailboxMessage[]>(`/mailboxes/${id}/messages`).then(r => r.data),
  poolSummary: () => api.get<MailboxPoolSummary>('/mailboxes/pool/summary').then(r => r.data),
  poolTick: (data?: { ignore_window?: boolean }) => api.post('/mailboxes/pool/tick', data || {}).then(r => r.data),
};
