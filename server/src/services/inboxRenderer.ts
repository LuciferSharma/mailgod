import Handlebars from 'handlebars';
import mongoose from 'mongoose';
import { Message, IMessage, MessageSourceType } from '../models/message';
import { Campaign } from '../models/campaign';
import { OneOffSend } from '../models/oneOffSend';
import { Flow } from '../models/flow';
import { Template } from '../models/template';
import { getSetting } from '../models/settings';
import { Subscriber } from '../models/subscriber';
import { getUnsubscribeUrl } from '../utils/unsubscribe';

export interface RenderedMessage {
  _id: string;
  direction: 'outbound' | 'inbound';
  subject: string;
  html_body: string;
  text_body: string;
  to_address: string;
  cc_addresses: string[];
  bcc_addresses: string[];
  from_address: string;
  sent_at: Date | null;
  received_at: Date | null;
  in_reply_to_message_id: string | null;
  is_auto_reply: boolean;
  status_summary: string;
  source_unavailable: boolean;
}

/**
 * Cache of {source_type, source_id} -> { html_template, subject_template, missing }
 * Reset per request (not module-level) — caller may pass the cache through.
 */
type SourceCache = Map<string, { html: string; subject: string; missing: boolean }>;

export async function renderMessages(
  messages: IMessage[],
  cache: SourceCache = new Map()
): Promise<RenderedMessage[]> {
  if (messages.length === 0) return [];

  const subscriberIds = Array.from(new Set(messages.map(m => m.subscriber_id.toString())));
  const subscribers = await Subscriber.find({ _id: { $in: subscriberIds } }).lean();
  const subscriberMap = new Map(subscribers.map(s => [s._id.toString(), s]));

  const globalVars = (await getSetting('template_variables', {})) as Record<string, string>;

  const out: RenderedMessage[] = [];
  for (const m of messages) {
    const inReplyToId = m.in_reply_to_message_id?.toString() || null;
    if (m.direction === 'inbound') {
      out.push({
        _id: (m._id as mongoose.Types.ObjectId).toString(),
        direction: 'inbound',
        subject: m.subject_override || '',
        html_body: m.html_body || m.text_body || '',
        text_body: m.text_body || '',
        to_address: m.to_address,
        cc_addresses: m.cc_addresses || [],
        bcc_addresses: m.bcc_addresses || [],
        from_address: m.from_address,
        sent_at: null,
        received_at: m.received_at,
        in_reply_to_message_id: inReplyToId,
        is_auto_reply: m.is_auto_reply,
        status_summary: m.status_summary,
        source_unavailable: false,
      });
      continue;
    }

    // outbound — inline/reply bodies are stored on the Message row; only
    // template-based sends (campaign, flow step) re-render from source.
    if (m.html_body || m.text_body) {
      out.push({
        _id: (m._id as mongoose.Types.ObjectId).toString(),
        direction: 'outbound',
        subject: m.subject_override || '',
        html_body: m.html_body || m.text_body || '',
        text_body: m.text_body || '',
        to_address: m.to_address,
        cc_addresses: m.cc_addresses || [],
        bcc_addresses: m.bcc_addresses || [],
        from_address: m.from_address,
        sent_at: m.sent_at,
        received_at: null,
        in_reply_to_message_id: inReplyToId,
        is_auto_reply: false,
        status_summary: m.status_summary,
        source_unavailable: false,
      });
      continue;
    }

    // Replies recorded before we persisted html_body — don't fall back to the
    // original campaign template (that made every reply look like email #1).
    if (inReplyToId) {
      out.push({
        _id: (m._id as mongoose.Types.ObjectId).toString(),
        direction: 'outbound',
        subject: m.subject_override || '',
        html_body: '<p style="color:#888"><em>[reply body unavailable]</em></p>',
        text_body: '',
        to_address: m.to_address,
        cc_addresses: m.cc_addresses || [],
        bcc_addresses: m.bcc_addresses || [],
        from_address: m.from_address,
        sent_at: m.sent_at,
        received_at: null,
        in_reply_to_message_id: inReplyToId,
        is_auto_reply: false,
        status_summary: m.status_summary,
        source_unavailable: true,
      });
      continue;
    }

    // outbound — render from source + variables
    const cacheKey = `${m.source_type}:${m.source_id}:${m.flow_node_id || ''}`;
    let cached = cache.get(cacheKey);
    if (!cached) {
      cached = await loadSourceTemplate(m.source_type, m.source_id.toString(), m.flow_node_id);
      cache.set(cacheKey, cached);
    }

    if (cached.missing) {
      out.push({
        _id: (m._id as mongoose.Types.ObjectId).toString(),
        direction: 'outbound',
        subject: m.subject_override || '',
        html_body: '<p style="color:#888"><em>[source deleted — body unavailable]</em></p>',
        text_body: '',
        to_address: m.to_address,
        cc_addresses: m.cc_addresses || [],
        bcc_addresses: m.bcc_addresses || [],
        from_address: m.from_address,
        sent_at: m.sent_at,
        received_at: null,
        in_reply_to_message_id: inReplyToId,
        is_auto_reply: false,
        status_summary: m.status_summary,
        source_unavailable: true,
      });
      continue;
    }

    const subscriber = subscriberMap.get(m.subscriber_id.toString());
    const unsubscribeUrl = getUnsubscribeUrl(m.subscriber_id.toString());
    const customAttrs = (subscriber?.custom_attributes || {}) as Record<string, any>;
    const baseVars: Record<string, any> = {
      ...globalVars,
      ...customAttrs,
      custom: customAttrs,
      ...(m.variables || {}),
      name: subscriber?.name || 'there',
      first_name: ((subscriber?.name || 'there') as string).split(' ')[0],
      email: subscriber?.email || m.to_address,
      plan_tier: subscriber?.plan_tier || '',
      unsubscribe_url: unsubscribeUrl,
    };
    const vars: Record<string, any> = { ...baseVars };
    for (const [k, v] of Object.entries(baseVars)) {
      const upper = k.toUpperCase();
      const title = k.replace(/(^|_)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
      if (!(upper in vars)) vars[upper] = v;
      if (!(title in vars)) vars[title] = v;
    }

    let html = '';
    let subject = '';
    try {
      html = Handlebars.compile(cached.html)(vars);
      subject = Handlebars.compile(m.subject_override || cached.subject)(vars);
    } catch (e) {
      html = cached.html;
      subject = m.subject_override || cached.subject;
    }

    out.push({
      _id: (m._id as mongoose.Types.ObjectId).toString(),
      direction: 'outbound',
      subject,
      html_body: html,
      text_body: '',
      to_address: m.to_address,
      cc_addresses: m.cc_addresses || [],
      bcc_addresses: m.bcc_addresses || [],
      from_address: m.from_address,
      sent_at: m.sent_at,
      received_at: null,
      in_reply_to_message_id: inReplyToId,
      is_auto_reply: false,
      status_summary: m.status_summary,
      source_unavailable: false,
    });
  }
  return out;
}

async function loadSourceTemplate(
  source_type: MessageSourceType,
  source_id: string,
  flow_node_id: string | null
): Promise<{ html: string; subject: string; missing: boolean }> {
  if (source_type === 'campaign') {
    const c = await Campaign.findById(source_id).select('rendered_html subject template_id').lean();
    if (!c) return { html: '', subject: '', missing: true };
    if (c.rendered_html) return { html: c.rendered_html, subject: c.subject || '', missing: false };
    if (c.template_id) {
      const t = await Template.findById(c.template_id).select('html_content subject').lean();
      if (t) return { html: t.html_content, subject: t.subject, missing: false };
    }
    return { html: '', subject: c.subject || '', missing: true };
  }

  if (source_type === 'one_off') {
    const o = await OneOffSend.findById(source_id).select('html_body subject').lean();
    if (!o) return { html: '', subject: '', missing: true };
    return { html: o.html_body, subject: o.subject, missing: false };
  }

  if (source_type === 'flow_step') {
    if (!flow_node_id) return { html: '', subject: '', missing: true };
    const f = await Flow.findById(source_id).select('nodes').lean();
    if (!f || !Array.isArray((f as any).nodes)) return { html: '', subject: '', missing: true };
    const node = (f as any).nodes.find((n: any) => n.id === flow_node_id);
    const tmplId = node?.data?.templateId;
    if (!tmplId) return { html: '', subject: '', missing: true };
    const t = await Template.findById(tmplId).select('html_content subject').lean();
    if (!t) return { html: '', subject: '', missing: true };
    return { html: t.html_content, subject: t.subject, missing: false };
  }

  return { html: '', subject: '', missing: true };
}

export function makeSourceCache(): SourceCache {
  return new Map();
}
