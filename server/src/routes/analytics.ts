import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Subscriber } from '../models/subscriber';
import { Campaign } from '../models/campaign';
import { Flow } from '../models/flow';
import { EmailEvent } from '../models/emailEvent';
import { FlowExecution } from '../models/flowExecution';
import { Message } from '../models/message';
import { OneOffSend } from '../models/oneOffSend';
import { ConversationLabel } from '../models/conversationLabel';
import { PipelineStage } from '../models/pipelineStage';
import { buildWeeklyReports, reportToMarkdown } from '../services/weeklyReport';

const router = Router();

router.get('/dashboard', async (_req: Request, res: Response, next: Function) => {
  try {
    const [
      totalSubscribers,
      activeSubscribers,
      subscribersByStatus,
      subscribersByPlan,
      totalCampaigns,
      activeFlows,
      recentCampaigns,
      recentFlows,
      todayEvents,
      weekEvents,
      growth,
      recentOpens,
      recentClicks,
      recentReplies,
      scheduledSendsInfo,
      recentOneOffs,
    ] = await Promise.all([
      Subscriber.countDocuments(),
      Subscriber.countDocuments({ status: 'active' }),
      Subscriber.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Subscriber.aggregate([{ $group: { _id: '$plan_tier', count: { $sum: 1 } } }]),
      Campaign.countDocuments(),
      Flow.countDocuments({ status: 'active' }),
      Campaign.find().sort({ created_at: -1 }).limit(5)
        .populate('segment_id', 'name'),
      Flow.find().sort({ updated_at: -1 }).limit(5)
        .select('name status stats updated_at'),
      EmailEvent.countDocuments({
        event: 'sent',
        timestamp: { $gte: startOfDay() },
      }),
      EmailEvent.countDocuments({
        event: 'sent',
        timestamp: { $gte: startOfWeek() },
      }),
      Subscriber.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      fetchRecentEngagement('open', 10),
      fetchRecentEngagement('click', 10),
      fetchRecentReplies(10),
      fetchScheduledSendsInfo(10),
      fetchRecentOneOffs(5),
    ]);

    const totalSent = await EmailEvent.countDocuments({ event: 'sent' });
    const totalOpened = await EmailEvent.countDocuments({ event: 'open' });
    const totalClicked = await EmailEvent.countDocuments({ event: 'click' });

    const statusMap: Record<string, number> = {};
    subscribersByStatus.forEach((s: any) => { statusMap[s._id] = s.count; });

    const planMap: Record<string, number> = {};
    subscribersByPlan.forEach((p: any) => { planMap[p._id || 'unknown'] = p.count; });

    res.json({
      total_subscribers: totalSubscribers,
      active_subscribers: activeSubscribers,
      total_campaigns: totalCampaigns,
      active_flows: activeFlows,
      emails_sent_today: todayEvents,
      emails_sent_week: weekEvents,
      open_rate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
      click_rate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
      subscribers_by_status: statusMap,
      subscribers_by_plan: planMap,
      recent_campaigns: recentCampaigns,
      recent_flows: recentFlows,
      growth: growth.map((g: any) => ({ date: g._id, count: g.count })),
      recent_opens: recentOpens,
      recent_clicks: recentClicks,
      recent_replies: recentReplies,
      scheduled_sends: scheduledSendsInfo,
      recent_one_offs: recentOneOffs,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/trends', async (_req: Request, res: Response, next: Function) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

    const [curSubs, prevSubs, curSent, prevSent, curOpened, prevOpened, curClicked, prevClicked, engagement] = await Promise.all([
      Subscriber.countDocuments({ created_at: { $gte: sevenDaysAgo } }),
      Subscriber.countDocuments({ created_at: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'sent', timestamp: { $gte: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'sent', timestamp: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'open', timestamp: { $gte: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'open', timestamp: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'click', timestamp: { $gte: sevenDaysAgo } }),
      EmailEvent.countDocuments({ event: 'click', timestamp: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      EmailEvent.aggregate([
        { $match: { timestamp: { $gte: new Date(now.getTime() - 30 * 86400000) } } },
        { $group: { _id: { event: '$event', day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } }, count: { $sum: 1 } } },
        { $sort: { '_id.day': 1 } },
      ]),
    ]);

    const engagementByDay: Record<string, { sent: number; opened: number; clicked: number }> = {};
    engagement.forEach((e: any) => {
      if (!engagementByDay[e._id.day]) engagementByDay[e._id.day] = { sent: 0, opened: 0, clicked: 0 };
      if (e._id.event === 'sent') engagementByDay[e._id.day].sent = e.count;
      if (e._id.event === 'open') engagementByDay[e._id.day].opened = e.count;
      if (e._id.event === 'click') engagementByDay[e._id.day].clicked = e.count;
    });

    const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    res.json({
      subscribers: { current: curSubs, previous: prevSubs, change: pctChange(curSubs, prevSubs) },
      sent: { current: curSent, previous: prevSent, change: pctChange(curSent, prevSent) },
      opened: { current: curOpened, previous: prevOpened, change: pctChange(curOpened, prevOpened) },
      clicked: { current: curClicked, previous: prevClicked, change: pctChange(curClicked, prevClicked) },
      engagement: Object.entries(engagementByDay).map(([day, v]) => ({ date: day, ...v, open_rate: v.sent > 0 ? Math.round((v.opened / v.sent) * 100) : 0 })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/weekly-reports', async (req: Request, res: Response, next: Function) => {
  try {
    const weeks = Math.min(Math.max(parseInt(String(req.query.weeks || '26'), 10) || 26, 1), 104);
    const report = await buildWeeklyReports(weeks);
    if (req.query.format === 'md') {
      res.type('text/markdown').send(reportToMarkdown(report));
      return;
    }
    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const eventCounts = await EmailEvent.aggregate([
      { $match: { campaign_id: campaign._id } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
    ]);

    const events: Record<string, number> = {};
    eventCounts.forEach((e: any) => { events[e._id] = e.count; });

    const timeline = await EmailEvent.aggregate([
      { $match: { campaign_id: campaign._id } },
      {
        $group: {
          _id: {
            event: '$event',
            hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.hour': 1 } },
    ]);

    res.json({ campaign, event_counts: events, timeline });
  } catch (error) {
    next(error);
  }
});

router.get('/flows/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Not found' });

    const [executions, statusCounts] = await Promise.all([
      FlowExecution.countDocuments({ flow_id: flow._id }),
      FlowExecution.aggregate([
        { $match: { flow_id: flow._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statuses: Record<string, number> = {};
    statusCounts.forEach((s: any) => { statuses[s._id] = s.count; });

    res.json({ flow, total_executions: executions, by_status: statuses });
  } catch (error) {
    next(error);
  }
});

router.get('/activity', async (req: Request, res: Response, next: Function) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const eventFilter = req.query.event as string;
    const source = req.query.source as string;

    const filter: any = {};
    if (eventFilter) filter.event = eventFilter;
    if (source === 'campaign') filter.campaign_id = { $ne: null };
    if (source === 'flow') filter.flow_id = { $ne: null };

    const [events, total] = await Promise.all([
      EmailEvent.find(filter)
        .populate('subscriber_id', 'email name')
        .populate('campaign_id', 'name')
        .populate('flow_id', 'name')
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailEvent.countDocuments(filter),
    ]);

    res.json({ data: events, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/recipients', async (req: Request, res: Response, next: Function) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const pipeline: any[] = [
      { $match: { campaign_id: campaign._id } },
      { $sort: { timestamp: -1 as const } },
      {
        $group: {
          _id: '$subscriber_id',
          latest_event: { $first: '$event' },
          timestamp: { $first: '$timestamp' },
        },
      },
      { $sort: { timestamp: -1 as const } },
    ];

    const countResult = await EmailEvent.aggregate([
      ...pipeline,
      { $count: 'total' },
    ]);
    const total = countResult[0]?.total || 0;

    const results = await EmailEvent.aggregate([
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'subscribers',
          localField: '_id',
          foreignField: '_id',
          as: 'subscriber',
          pipeline: [{ $project: { email: 1, name: 1 } }],
        },
      },
      { $unwind: '$subscriber' },
    ]);

    res.json({
      data: results.map((r: any) => ({
        subscriber: r.subscriber,
        latest_event: r.latest_event,
        timestamp: r.timestamp,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/engaged-prospects
 * Aggregates all subscribers who have opened and/or clicked emails.
 * Supports filtering by minimum opens/clicks, recency timeframe, link clicks, search, and CSV export.
 */
router.get('/engaged-prospects', async (req: Request, res: Response, next: Function) => {
  try {
    const minOpens = parseInt(req.query.minOpens as string, 10) || 1;
    const minClicks = parseInt(req.query.minClicks as string, 10) || 0;
    const hasClicked = (req.query.hasClicked as string) || 'all'; // 'all' | 'yes' | 'no'
    const timeframe = (req.query.timeframe as string) || 'all'; // '24h' | '7d' | '30d' | 'all'
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const excludeReplied = req.query.excludeReplied === 'true';
    const search = ((req.query.search as string) || '').trim();
    const sortBy = (req.query.sortBy as string) || 'last_active'; // 'opens' | 'clicks' | 'last_active' | 'first_opened' | 'score'
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const isCsvExport = req.query.export === 'csv';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = isCsvExport ? 50000 : Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 50));

    // 1. Base Event Match
    const now = new Date();
    const eventMatch: any = {
      event: { $in: ['open', 'click'] },
      subscriber_id: { $ne: null },
    };

    if (timeframe === '24h') {
      eventMatch.timestamp = { $gte: new Date(now.getTime() - 24 * 3600 * 1000) };
    } else if (timeframe === '7d') {
      eventMatch.timestamp = { $gte: new Date(now.getTime() - 7 * 86400 * 1000) };
    } else if (timeframe === '30d') {
      eventMatch.timestamp = { $gte: new Date(now.getTime() - 30 * 86400 * 1000) };
    } else if (startDate || endDate) {
      eventMatch.timestamp = {};
      if (startDate) eventMatch.timestamp.$gte = new Date(startDate);
      if (endDate) eventMatch.timestamp.$lte = new Date(endDate);
    }

    // 2. Aggregation Pipeline
    const pipeline: any[] = [
      { $match: eventMatch },
      {
        $group: {
          _id: '$subscriber_id',
          total_opens: { $sum: { $cond: [{ $eq: ['$event', 'open'] }, 1, 0] } },
          total_clicks: { $sum: { $cond: [{ $eq: ['$event', 'click'] }, 1, 0] } },
          first_opened_at: { $min: { $cond: [{ $eq: ['$event', 'open'] }, '$timestamp', null] } },
          last_opened_at: { $max: { $cond: [{ $eq: ['$event', 'open'] }, '$timestamp', null] } },
          last_clicked_at: { $max: { $cond: [{ $eq: ['$event', 'click'] }, '$timestamp', null] } },
          last_active_at: { $max: '$timestamp' },
          clicked_urls: {
            $addToSet: {
              $cond: [
                { $and: [{ $eq: ['$event', 'click'] }, { $ne: ['$metadata.url', null] }] },
                '$metadata.url',
                '$$REMOVE',
              ],
            },
          },
        },
      },
    ];

    // Filter by open & click thresholds
    const havingMatch: any = {};
    if (minOpens > 0) {
      havingMatch.total_opens = { $gte: minOpens };
    }
    if (minClicks > 0) {
      havingMatch.total_clicks = { $gte: minClicks };
    }
    if (hasClicked === 'yes') {
      havingMatch.total_clicks = { ...(havingMatch.total_clicks || {}), $gte: 1 };
    } else if (hasClicked === 'no') {
      havingMatch.total_clicks = 0;
    }

    if (Object.keys(havingMatch).length > 0) {
      pipeline.push({ $match: havingMatch });
    }

    // Lookup subscriber info
    pipeline.push(
      {
        $lookup: {
          from: 'subscribers',
          localField: '_id',
          foreignField: '_id',
          as: 'subscriber',
        },
      },
      { $unwind: '$subscriber' },
    );

    // Filter by subscriber search if provided
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'subscriber.email': { $regex: search, $options: 'i' } },
            { 'subscriber.name': { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    // Optional exclude replied / demo booked
    if (excludeReplied) {
      // Lookup conversation labels
      pipeline.push(
        {
          $lookup: {
            from: 'conversationlabels',
            localField: '_id',
            foreignField: 'subscriber_id',
            as: 'labels',
          },
        },
        {
          $lookup: {
            from: 'pipelinestages',
            localField: 'labels.stage_id',
            foreignField: '_id',
            as: 'stages',
          },
        },
        {
          $match: {
            'stages.name': { $nin: ['Replied', 'Interested', 'Demo Booked', 'Won'] },
            'subscriber.status': { $ne: 'unsubscribed' },
          },
        },
      );
    } else {
      pipeline.push(
        {
          $lookup: {
            from: 'conversationlabels',
            localField: '_id',
            foreignField: 'subscriber_id',
            as: 'labels',
          },
        },
        {
          $lookup: {
            from: 'pipelinestages',
            localField: 'labels.stage_id',
            foreignField: '_id',
            as: 'stages',
          },
        },
      );
    }

    // Sorting stage
    let sortField = 'last_active_at';
    if (sortBy === 'opens') sortField = 'total_opens';
    else if (sortBy === 'clicks') sortField = 'total_clicks';
    else if (sortBy === 'first_opened') sortField = 'first_opened_at';
    else if (sortBy === 'last_active') sortField = 'last_active_at';

    // Count summary
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await EmailEvent.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Quick KPIs across all matching results (before pagination)
    let kpis = { total_viewers: total, hot_count: 0, clickers_count: 0, multi_open_count: 0 };
    if (!isCsvExport) {
      const kpiPipeline = [
        ...pipeline,
        {
          $group: {
            _id: null,
            hot_count: {
              $sum: {
                $cond: [
                  { $or: [{ $gte: ['$total_opens', 3] }, { $gte: ['$total_clicks', 1] }] },
                  1,
                  0,
                ],
              },
            },
            clickers_count: {
              $sum: {
                $cond: [{ $gte: ['$total_clicks', 1] }, 1, 0],
              },
            },
            multi_open_count: {
              $sum: {
                $cond: [{ $gte: ['$total_opens', 2] }, 1, 0],
              },
            },
          },
        },
      ];
      const kpiRes = await EmailEvent.aggregate(kpiPipeline);
      if (kpiRes[0]) {
        kpis = {
          total_viewers: total,
          hot_count: kpiRes[0].hot_count || 0,
          clickers_count: kpiRes[0].clickers_count || 0,
          multi_open_count: kpiRes[0].multi_open_count || 0,
        };
      }
    }

    // Paginate and fetch
    const dataPipeline = [
      ...pipeline,
      { $sort: { [sortField]: sortOrder, _id: -1 } },
      ...(isCsvExport ? [] : [{ $skip: (page - 1) * limit }, { $limit: limit }]),
    ];

    const rawResults = await EmailEvent.aggregate(dataPipeline);

    // Format response items
    const formatted = rawResults.map((r: any) => {
      const sub = r.subscriber;
      const opens = r.total_opens || 0;
      const clicks = r.total_clicks || 0;
      const lastActive = r.last_active_at ? new Date(r.last_active_at) : null;
      const firstOpened = r.first_opened_at ? new Date(r.first_opened_at) : null;
      const lastOpened = r.last_opened_at ? new Date(r.last_opened_at) : null;
      const lastClicked = r.last_clicked_at ? new Date(r.last_clicked_at) : null;

      // Intent Score calculation (0 - 100+)
      const recencyDays = lastActive ? (now.getTime() - lastActive.getTime()) / (86400 * 1000) : 999;
      const recencyBonus = recencyDays <= 2 ? 30 : recencyDays <= 7 ? 15 : 0;
      const intentScore = opens * 10 + clicks * 25 + recencyBonus;

      let intentTier: 'hot' | 'warm' | 'cold' = 'cold';
      if (opens >= 3 || clicks >= 1 || intentScore >= 50) {
        intentTier = 'hot';
      } else if (opens >= 1 && recencyDays <= 7) {
        intentTier = 'warm';
      }

      // Latest pipeline stage
      const stageName = r.stages && r.stages.length > 0 ? r.stages[r.stages.length - 1].name : 'New';
      const stageColor = r.stages && r.stages.length > 0 ? r.stages[r.stages.length - 1].color : '#64748b';

      return {
        subscriber_id: sub._id.toString(),
        email: sub.email,
        name: sub.name || '',
        status: sub.status || 'active',
        plan_tier: sub.plan_tier || 'free',
        country: sub.country || '',
        tags: sub.tags || [],
        custom_attributes: sub.custom_attributes || {},
        total_opens: opens,
        total_clicks: clicks,
        intent_tier: intentTier,
        intent_score: intentScore,
        first_opened_at: firstOpened ? firstOpened.toISOString() : null,
        last_opened_at: lastOpened ? lastOpened.toISOString() : null,
        last_clicked_at: lastClicked ? lastClicked.toISOString() : null,
        last_active_at: lastActive ? lastActive.toISOString() : null,
        clicked_urls: (r.clicked_urls || []).filter(Boolean),
        pipeline_stage: stageName,
        pipeline_stage_color: stageColor,
      };
    });

    // CSV Export Flow
    if (isCsvExport) {
      function escapeCsv(val: any): string {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }

      const headers = [
        'Email',
        'Name',
        'Total Opens',
        'Total Clicks',
        'Intent Tier',
        'Intent Score',
        'Pipeline Stage',
        'Plan Tier',
        'Country',
        'First Opened At',
        'Last Opened At',
        'Last Clicked At',
        'Last Active At',
        'Clicked URLs',
        'Tags',
      ];

      const csvRows = [headers.join(',')];
      for (const row of formatted) {
        csvRows.push(
          [
            escapeCsv(row.email),
            escapeCsv(row.name),
            row.total_opens,
            row.total_clicks,
            escapeCsv(row.intent_tier),
            row.intent_score,
            escapeCsv(row.pipeline_stage),
            escapeCsv(row.plan_tier),
            escapeCsv(row.country),
            escapeCsv(row.first_opened_at),
            escapeCsv(row.last_opened_at),
            escapeCsv(row.last_clicked_at),
            escapeCsv(row.last_active_at),
            escapeCsv(row.clicked_urls.join('; ')),
            escapeCsv(row.tags.join('; ')),
          ].join(','),
        );
      }

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="engaged_prospects_${dateStr}.csv"`);
      return res.status(200).send(csvRows.join('\r\n'));
    }

    // JSON response
    res.json({
      data: formatted,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      kpis,
    });
  } catch (error) {
    next(error);
  }
});

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchRecentEngagement(event: 'open' | 'click', limit: number) {
  const events = await EmailEvent.find({ event })
    .populate('subscriber_id', 'email name')
    .populate('campaign_id', 'name')
    .populate('flow_id', 'name')
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  return events.map((evt: any) => {
    const sub = evt.subscriber_id;
    const campaign = evt.campaign_id;
    const flow = evt.flow_id;
    let source_type: 'campaign' | 'flow' | null = null;
    let source_id: string | null = null;
    let source_label = '—';
    if (campaign) {
      source_type = 'campaign';
      source_id = campaign._id?.toString() || null;
      source_label = campaign.name || 'Campaign';
    } else if (flow) {
      source_type = 'flow';
      source_id = flow._id?.toString() || null;
      source_label = flow.name || 'Flow';
    }
    return {
      _id: evt._id.toString(),
      timestamp: evt.timestamp,
      subscriber_id: sub?._id?.toString() || '',
      subscriber_email: sub?.email || '',
      subscriber_name: sub?.name || '',
      source_type,
      source_id,
      source_label,
      url: evt.metadata?.url || null,
    };
  });
}

async function fetchRecentReplies(limit: number) {
  const replies = await Message.find({ direction: 'inbound', is_auto_reply: { $ne: true } })
    .populate('subscriber_id', 'email name')
    .sort({ received_at: -1, created_at: -1 })
    .limit(limit)
    .lean();

  return replies.map((msg: any) => {
    const sub = msg.subscriber_id;
    return {
      _id: msg._id.toString(),
      timestamp: msg.received_at || msg.created_at,
      subscriber_id: sub?._id?.toString() || msg.subscriber_id?.toString() || '',
      subscriber_email: sub?.email || msg.from_address || '',
      subscriber_name: sub?.name || '',
      source_type: msg.source_type,
      source_id: msg.source_id?.toString() || '',
      flow_node_id: msg.flow_node_id || null,
      subject: msg.subject || 'Re: Email',
      text_snippet: (msg.text_body || msg.html_body || '').replace(/<[^>]*>/g, '').slice(0, 120),
    };
  });
}

async function fetchRecentOneOffs(limit: number) {
  return OneOffSend.find({ status: { $in: ['sent', 'sending', 'failed'] } })
    .sort({ created_at: -1 })
    .limit(limit)
    .select('subject recipient_count status send_summary sent_at created_at')
    .lean();
}

async function fetchScheduledSendsInfo(limit: number) {
  const now = new Date();
  const scheduledSends = await OneOffSend.find({
    status: 'scheduled',
    scheduled_at: { $gte: now },
  })
    .sort({ scheduled_at: 1 })
    .limit(limit)
    .lean();

  const allScheduled = await OneOffSend.find({
    status: 'scheduled',
    scheduled_at: { $gte: now },
  })
    .select('scheduled_at recipient_count')
    .lean();

  const totalRecipients = allScheduled.reduce((sum, s) => sum + (s.recipient_count || 0), 0);

  const daysSet = new Set<string>();
  let latestScheduledAt: Date | null = null;

  for (const s of allScheduled) {
    if (s.scheduled_at) {
      const d = new Date(s.scheduled_at);
      const dayKey = d.toISOString().split('T')[0];
      daysSet.add(dayKey);
      if (!latestScheduledAt || d > latestScheduledAt) {
        latestScheduledAt = d;
      }
    }
  }

  // Sender-pool queue: pool-mode one-offs are status 'sending' with queued
  // SendQueueItems, paced by each sender's daily allowance rather than a date.
  const { SendQueueItem } = await import('../models/sendQueueItem');
  const { Mailbox } = await import('../models/mailbox');
  const { allowanceToday } = await import('../services/mailboxService');
  const poolRows = await SendQueueItem.aggregate([
    { $match: { status: { $in: ['queued', 'sending'] } } },
    { $group: { _id: '$one_off_send_id', queued: { $sum: 1 }, senders: { $addToSet: '$allowed_mailbox_ids' } } },
  ]);
  const poolIds = poolRows.map(r => r._id);
  const poolOneOffs = poolIds.length ? await OneOffSend.find({ _id: { $in: poolIds } }).select('subject recipient_count thread_followup created_at').lean() : [];
  const poolSentRows = poolIds.length ? await SendQueueItem.aggregate([
    { $match: { one_off_send_id: { $in: poolIds }, status: 'sent' } },
    { $group: { _id: '$one_off_send_id', sent: { $sum: 1 } } },
  ]) : [];
  const sentMap = new Map(poolSentRows.map((r: any) => [r._id.toString(), r.sent]));
  const mailboxes = await Mailbox.find({ status: 'active' }).lean();
  const mbById = new Map(mailboxes.map((m: any) => [m._id.toString(), m]));
  const poolDailyCapacity = mailboxes.reduce((s: number, m: any) => s + allowanceToday(m as any), 0);
  const poolQueued = poolRows.reduce((s, r) => s + r.queued, 0);
  const poolDays = poolDailyCapacity > 0 ? Math.ceil(poolQueued / poolDailyCapacity) : 0;
  const poolSends = poolRows.map(r => {
    const o: any = poolOneOffs.find((x: any) => x._id.toString() === r._id.toString()) || {};
    const senderIds = new Set<string>();
    (r.senders || []).forEach((arr: any[]) => (arr || []).forEach((id: any) => senderIds.add(id.toString())));
    const senders = senderIds.size ? Array.from(senderIds).map(id => mbById.get(id)?.email || 'sender').filter(Boolean) : ['whole pool'];
    return {
      _id: r._id.toString(),
      subject: o.subject || '',
      recipient_count: o.recipient_count || 0,
      queued: r.queued,
      sent: sentMap.get(r._id.toString()) || 0,
      senders,
      thread_followup: !!o.thread_followup,
      created_at: o.created_at,
    };
  }).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  const daysCovered = Math.max(daysSet.size, poolDays);
  let indicator: 'healthy' | 'low' | 'empty' = 'empty';
  if (daysCovered >= 7) {
    indicator = 'healthy';
  } else if (daysCovered > 0) {
    indicator = 'low';
  }

  return {
    total_count: allScheduled.length + poolSends.length,
    total_recipients: totalRecipients + poolQueued,
    days_covered: daysCovered,
    latest_scheduled_at: latestScheduledAt ? latestScheduledAt.toISOString() : null,
    indicator,
    pool: { queued: poolQueued, daily_capacity: poolDailyCapacity, days: poolDays, sends: poolSends },
    sends: scheduledSends.map((s: any) => ({
      _id: s._id.toString(),
      subject: s.subject,
      recipient_count: s.recipient_count,
      scheduled_at: s.scheduled_at ? new Date(s.scheduled_at).toISOString() : null,
      created_at: s.created_at,
    })),
  };
}

export { router as analyticsRoutes };
