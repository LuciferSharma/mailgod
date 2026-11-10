import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Subscriber } from '../src/models/subscriber';
import { EmailEvent } from '../src/models/emailEvent';
import { analyticsRoutes } from '../src/routes/analytics';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRoutes);
  return app;
}

describe('Engaged Prospects API (/api/analytics/engaged-prospects)', () => {
  it('aggregates open and click events and calculates intent tiers', async () => {
    const app = buildApp();
    const timestamp = Date.now();

    // Create 3 subscribers
    const sub1 = await Subscriber.create({
      email: `hot_${timestamp}@example.com`,
      name: 'Hot Lead',
      status: 'active',
      plan_tier: 'pro',
    });

    const sub2 = await Subscriber.create({
      email: `warm_${timestamp}@example.com`,
      name: 'Warm Lead',
      status: 'active',
      plan_tier: 'free',
    });

    const sub3 = await Subscriber.create({
      email: `clicker_${timestamp}@example.com`,
      name: 'Clicker Lead',
      status: 'active',
      plan_tier: 'free',
    });

    // Sub1: 4 opens (Hot)
    for (let i = 0; i < 4; i++) {
      await EmailEvent.create({
        subscriber_id: sub1._id,
        event: 'open',
        timestamp: new Date(Date.now() - (4 - i) * 3600 * 1000),
      });
    }

    // Sub2: 1 open (Warm)
    await EmailEvent.create({
      subscriber_id: sub2._id,
      event: 'open',
      timestamp: new Date(Date.now() - 2 * 3600 * 1000),
    });

    // Sub3: 1 open + 1 click on example.com/demo (Hot)
    await EmailEvent.create({
      subscriber_id: sub3._id,
      event: 'open',
      timestamp: new Date(Date.now() - 10000),
    });
    await EmailEvent.create({
      subscriber_id: sub3._id,
      event: 'click',
      metadata: { url: 'https://example.com/demo' },
      timestamp: new Date(),
    });

    // Test 1: Fetch all engaged prospects
    const res = await request(app).get('/api/analytics/engaged-prospects').query({ minOpens: 1, timeframe: 'all' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);

    const foundSub1 = res.body.data.find((p: any) => p.email === sub1.email);
    expect(foundSub1).toBeDefined();
    expect(foundSub1.total_opens).toBe(4);
    expect(foundSub1.intent_tier).toBe('hot');

    const foundSub3 = res.body.data.find((p: any) => p.email === sub3.email);
    expect(foundSub3).toBeDefined();
    expect(foundSub3.total_clicks).toBe(1);
    expect(foundSub3.clicked_urls).toContain('https://example.com/demo');
    expect(foundSub3.intent_tier).toBe('hot');

    // Test 2: Filter minOpens = 3 (should return sub1 but not sub2)
    const filteredRes = await request(app)
      .get('/api/analytics/engaged-prospects')
      .query({ minOpens: 3, timeframe: 'all' });
    expect(filteredRes.status).toBe(200);
    const hasSub1 = filteredRes.body.data.some((p: any) => p.email === sub1.email);
    const hasSub2 = filteredRes.body.data.some((p: any) => p.email === sub2.email);
    expect(hasSub1).toBe(true);
    expect(hasSub2).toBe(false);

    // Test 3: Filter hasClicked = 'yes'
    const clickRes = await request(app)
      .get('/api/analytics/engaged-prospects')
      .query({ hasClicked: 'yes', timeframe: 'all' });
    expect(clickRes.status).toBe(200);
    const hasClicker = clickRes.body.data.some((p: any) => p.email === sub3.email);
    const hasNonClicker = clickRes.body.data.some((p: any) => p.email === sub2.email);
    expect(hasClicker).toBe(true);
    expect(hasNonClicker).toBe(false);

    // Test 4: Search filter by email
    const searchRes = await request(app)
      .get('/api/analytics/engaged-prospects')
      .query({ search: `hot_${timestamp}`, timeframe: 'all' });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total).toBe(1);
    expect(searchRes.body.data[0].email).toBe(sub1.email);

    // Test 5: CSV Export
    const csvRes = await request(app)
      .get('/api/analytics/engaged-prospects')
      .query({ export: 'csv', search: `hot_${timestamp}`, timeframe: 'all' });
    expect(csvRes.status).toBe(200);
    expect(csvRes.header['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Email,Name,Total Opens,Total Clicks');
    expect(csvRes.text).toContain(sub1.email);
    expect(csvRes.text).toContain('4,0');
  });
});
