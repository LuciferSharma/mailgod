import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { PipelineStage, ensureStagesSeeded } from '../src/models/pipelineStage';
import { ConversationLabel } from '../src/models/conversationLabel';
import { seedStageOnSend, advanceStage, invalidateStageCache } from '../src/services/pipelineAuto';

const oid = () => new mongoose.Types.ObjectId().toString();
async function stageId(name: string) {
  const s = await PipelineStage.findOne({ name }).lean();
  return String((s as any)._id);
}
const campaignKey = () => ({ subscriber_id: oid(), source_type: 'campaign' as const, source_id: oid(), flow_node_id: null });
const labelFor = (sub: string) => ConversationLabel.findOne({ subscriber_id: sub }).lean();

// The stage cache holds stage ids; collections are wiped between tests, so clear it.
beforeEach(() => invalidateStageCache());

describe('pipelineAuto — automatic stage transitions', () => {
  it('seedStageOnSend places a new conversation at "New" and is a no-op if a stage already exists', async () => {
    await ensureStagesSeeded();
    const key = campaignKey();
    await seedStageOnSend(key);
    const label = await labelFor(key.subscriber_id);
    expect(String(label!.stage_id)).toBe(await stageId('New'));
    expect(label!.history).toHaveLength(1);

    await seedStageOnSend(key); // a later send must NOT reset or duplicate
    const labels = await ConversationLabel.find({ subscriber_id: key.subscriber_id }).lean();
    expect(labels).toHaveLength(1);
    expect(labels[0].history).toHaveLength(1);
  });

  it('advanceStage moves forward New → Contacted → Replied', async () => {
    await ensureStagesSeeded();
    const key = campaignKey();
    await seedStageOnSend(key);
    await advanceStage(key, 'Contacted');
    expect(String((await labelFor(key.subscriber_id))!.stage_id)).toBe(await stageId('Contacted'));
    await advanceStage(key, 'Replied');
    expect(String((await labelFor(key.subscriber_id))!.stage_id)).toBe(await stageId('Replied'));
  });

  it('advanceStage never moves backward or overwrites a later stage', async () => {
    await ensureStagesSeeded();
    const key = campaignKey();
    await seedStageOnSend(key);
    await advanceStage(key, 'Replied');
    await advanceStage(key, 'Contacted'); // earlier → must be a no-op
    expect(String((await labelFor(key.subscriber_id))!.stage_id)).toBe(await stageId('Replied'));
  });

  it('advanceStage creates a label at the target if none exists yet', async () => {
    await ensureStagesSeeded();
    const key = { subscriber_id: oid(), source_type: 'one_off' as const, source_id: oid(), flow_node_id: null };
    await advanceStage(key, 'Contacted');
    expect(String((await labelFor(key.subscriber_id))!.stage_id)).toBe(await stageId('Contacted'));
  });

  it('concurrent forward advances converge to the furthest stage (no clobber)', async () => {
    await ensureStagesSeeded();
    const key = campaignKey();
    await seedStageOnSend(key);
    // A click→Contacted and an inbound reply→Replied arriving at once must NOT
    // let the lower stage clobber the higher one — the atomic filter guarantees
    // convergence to Replied regardless of which write lands last.
    await Promise.all([advanceStage(key, 'Contacted'), advanceStage(key, 'Replied')]);
    expect(String((await labelFor(key.subscriber_id))!.stage_id)).toBe(await stageId('Replied'));
    const labels = await ConversationLabel.find({ subscriber_id: key.subscriber_id }).lean();
    expect(labels).toHaveLength(1); // upsert race never creates a duplicate
  });
});
