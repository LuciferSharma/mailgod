import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { pipelineRoutes } from '../src/routes/pipeline';
import { ConversationLabel } from '../src/models/conversationLabel';
import { Subscriber } from '../src/models/subscriber';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/pipeline', pipelineRoutes);
  return a;
}

describe('pipeline stage CRUD + board', () => {
  it('creates, rejects dup name (case-insensitive) + bad color, and renames', async () => {
    const a = app();
    await request(a).get('/api/pipeline/stages'); // seed defaults
    const created = await request(a).post('/api/pipeline/stages').send({ name: 'Negotiation', color: '#abcdef' });
    expect(created.status).toBe(201);
    expect(created.body.system).toBe(false);
    expect((await request(a).post('/api/pipeline/stages').send({ name: 'negotiation' })).status).toBe(409);
    expect((await request(a).post('/api/pipeline/stages').send({ name: 'Bad', color: 'red' })).status).toBe(400);
    const patched = await request(a).patch(`/api/pipeline/stages/${created.body._id}`).send({ name: 'Negotiating' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Negotiating');
  });

  it('reorder requires the full set and applies the new order', async () => {
    const a = app();
    const ids = (await request(a).get('/api/pipeline/stages')).body.map((s: any) => s._id);
    expect((await request(a).patch('/api/pipeline/stages/reorder').send({ order: ids.slice(0, 2) })).status).toBe(400);
    const reversed = [...ids].reverse();
    const res = await request(a).patch('/api/pipeline/stages/reorder').send({ order: reversed });
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s._id)).toEqual(reversed);
  });

  it('blocks deleting a system stage (403)', async () => {
    const a = app();
    const sys = (await request(a).get('/api/pipeline/stages')).body.find((s: any) => s.system);
    expect((await request(a).delete(`/api/pipeline/stages/${sys._id}`)).status).toBe(403);
  });

  it('deletes an unused custom stage directly; a used one returns 409 then reassigns', async () => {
    const a = app();
    await request(a).get('/api/pipeline/stages');
    const s1 = (await request(a).post('/api/pipeline/stages').send({ name: 'Temp1' })).body;
    expect((await request(a).delete(`/api/pipeline/stages/${s1._id}`)).status).toBe(200);

    const s2 = (await request(a).post('/api/pipeline/stages').send({ name: 'Temp2' })).body;
    const target = (await request(a).get('/api/pipeline/stages')).body.find((s: any) => s.name === 'New');
    await ConversationLabel.create({
      subscriber_id: new mongoose.Types.ObjectId(), source_type: 'campaign',
      source_id: new mongoose.Types.ObjectId(), flow_node_id: null, stage_id: s2._id, history: [],
    });
    expect((await request(a).delete(`/api/pipeline/stages/${s2._id}`)).status).toBe(409);
    const reassign = await request(a).delete(`/api/pipeline/stages/${s2._id}?reassignTo=${target._id}`);
    expect(reassign.status).toBe(200);
    expect(await ConversationLabel.countDocuments({ stage_id: s2._id })).toBe(0);
    expect(await ConversationLabel.countDocuments({ stage_id: target._id })).toBe(1);
  });

  it('board returns a column per stage with correctly-shaped cards', async () => {
    const a = app();
    const newStage = (await request(a).get('/api/pipeline/stages')).body.find((s: any) => s.name === 'New');
    const sub = await Subscriber.create({ email: 'board@x.com', name: 'Board User', status: 'active' });
    await ConversationLabel.create({
      subscriber_id: sub._id, source_type: 'campaign',
      source_id: new mongoose.Types.ObjectId(), flow_node_id: null, stage_id: newStage._id, history: [],
    });
    const board = await request(a).get('/api/pipeline/board');
    expect(board.status).toBe(200);
    const col = board.body.columns.find((c: any) => c.stage._id === newStage._id);
    expect(col.total).toBe(1);
    const card = col.cards[0];
    expect(card.stage_id).toBe(newStage._id);
    expect(card.subscriber_email).toBe('board@x.com');
    for (const f of ['label_id', 'subscriber_id', 'source_label', 'conversation_subject', 'last_activity_at']) {
      expect(card).toHaveProperty(f);
    }
  });

  it('board source filter + search narrow the results', async () => {
    const a = app();
    const newStage = (await request(a).get('/api/pipeline/stages')).body.find((s: any) => s.name === 'New');
    const sub = await Subscriber.create({ email: 'alice@x.com', name: 'Alice', status: 'active' });
    await ConversationLabel.create({
      subscriber_id: sub._id, source_type: 'one_off',
      source_id: new mongoose.Types.ObjectId(), flow_node_id: null, stage_id: newStage._id, history: [],
    });
    // source filter to campaign → no one_off cards
    const campOnly = await request(a).get('/api/pipeline/board?source=campaign');
    expect(campOnly.body.columns.find((c: any) => c.stage._id === newStage._id).total).toBe(0);
    // search matching the subscriber
    const hit = await request(a).get('/api/pipeline/board?search=alice');
    expect(hit.body.columns.find((c: any) => c.stage._id === newStage._id).total).toBe(1);
    const miss = await request(a).get('/api/pipeline/board?search=zzzznope');
    expect(miss.body.columns.find((c: any) => c.stage._id === newStage._id).total).toBe(0);
  });
});
