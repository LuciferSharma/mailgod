import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { pipelineRoutes } from '../src/routes/pipeline';
import { ConversationLabel } from '../src/models/conversationLabel';
import { PipelineStage } from '../src/models/pipelineStage';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/pipeline', pipelineRoutes);
  return a;
}
const oid = () => new mongoose.Types.ObjectId().toString();

describe('pipeline routes', () => {
  it('GET /stages seeds 7 defaults and is idempotent', async () => {
    const a = app();
    const r1 = await request(a).get('/api/pipeline/stages');
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveLength(7);
    const names = r1.body.map((s: any) => s.name);
    expect(names).toContain('New');
    expect(names).toContain('Won');

    await request(a).get('/api/pipeline/stages'); // second call shouldn't duplicate
    expect(await PipelineStage.countDocuments()).toBe(7);
  });

  it('POST /stage upserts then updates the same (subscriber × source) label', async () => {
    const a = app();
    const stages = (await request(a).get('/api/pipeline/stages')).body;
    const subscriber_id = oid();
    const source_id = oid();

    const set1 = await request(a).post('/api/pipeline/stage')
      .send({ subscriber_id, source_type: 'campaign', source_id, stage_id: stages[0]._id });
    expect(set1.status).toBe(200);
    expect(await ConversationLabel.countDocuments()).toBe(1);

    const set2 = await request(a).post('/api/pipeline/stage')
      .send({ subscriber_id, source_type: 'campaign', source_id, stage_id: stages[1]._id });
    expect(set2.status).toBe(200);

    const docs = await ConversationLabel.find().lean();
    expect(docs).toHaveLength(1); // updated, not duplicated
    expect(String(docs[0].stage_id)).toBe(String(stages[1]._id));
    expect(docs[0].history).toHaveLength(2); // both transitions recorded
  });

  it('POST /stage with stage_id null clears the label', async () => {
    const a = app();
    const stages = (await request(a).get('/api/pipeline/stages')).body;
    const subscriber_id = oid();
    const source_id = oid();
    await request(a).post('/api/pipeline/stage')
      .send({ subscriber_id, source_type: 'campaign', source_id, stage_id: stages[0]._id });
    const clear = await request(a).post('/api/pipeline/stage')
      .send({ subscriber_id, source_type: 'campaign', source_id, stage_id: null });
    expect(clear.status).toBe(200);
    expect(await ConversationLabel.countDocuments()).toBe(0);
  });

  it('rejects an invalid stage_id and a non-existent stage', async () => {
    const a = app();
    const base = { subscriber_id: oid(), source_type: 'campaign', source_id: oid() };
    const bad = await request(a).post('/api/pipeline/stage').send({ ...base, stage_id: 'not-an-id' });
    expect(bad.status).toBe(400);
    const missing = await request(a).post('/api/pipeline/stage').send({ ...base, stage_id: oid() });
    expect(missing.status).toBe(400);
  });

  it('coerces a malicious flow_node_id object to null (no NoSQL operator injection)', async () => {
    const a = app();
    const stages = (await request(a).get('/api/pipeline/stages')).body;
    const res = await request(a).post('/api/pipeline/stage').send({
      subscriber_id: oid(),
      source_type: 'flow_step',
      source_id: oid(),
      flow_node_id: { $ne: null }, // attacker-supplied operator object
      stage_id: stages[0]._id,
    });
    expect(res.status).toBe(200);
    const doc = await ConversationLabel.findOne().lean();
    expect(doc!.flow_node_id).toBeNull(); // coerced, not stored as an operator
  });
});
