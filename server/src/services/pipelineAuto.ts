import { PipelineStage, ensureStagesSeeded } from '../models/pipelineStage';
import { ConversationLabel } from '../models/conversationLabel';

/**
 * Automatic pipeline-stage transitions driven by email activity:
 *   - send       → New        (seedStageOnSend; only if the conversation has no stage yet)
 *   - open/click → Contacted  (advanceStage; only moves FORWARD)
 *   - reply      → Replied    (advanceStage; only moves FORWARD)
 *
 * "Forward only" = a transition never downgrades or overwrites a more advanced
 * stage a human set (e.g. Interested/Demo/Won/Lost), and never resets to an
 * earlier stage. All calls are best-effort: a failure never breaks the send or
 * the webhook.
 */

interface StageInfo { id: string; order: number }
interface StageCache { at: number; byName: Map<string, StageInfo>; orderById: Map<string, number> }

const TTL_MS = 60_000;
let cache: StageCache | null = null;
let loading: Promise<StageCache> | null = null;

async function loadStages(): Promise<StageCache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  // De-dup concurrent cold-cache loads (e.g. a webhook burst right after a stage
  // CRUD invalidation) so we don't fire N identical seed+find queries.
  if (!loading) {
    loading = (async () => {
      await ensureStagesSeeded();
      const all = await PipelineStage.find().select('name order').lean();
      const byName = new Map<string, StageInfo>();
      const orderById = new Map<string, number>();
      for (const s of all as any[]) {
        byName.set(String(s.name).toLowerCase(), { id: String(s._id), order: s.order });
        orderById.set(String(s._id), s.order);
      }
      cache = { at: Date.now(), byName, orderById };
      return cache;
    })().finally(() => { loading = null; });
  }
  return loading;
}

/** Clear the stage cache (call after stage CRUD so transitions see fresh data). */
export function invalidateStageCache(): void {
  cache = null;
}

export interface ConversationKey {
  subscriber_id: string;
  source_type: 'campaign' | 'flow_step' | 'one_off';
  source_id: string;
  flow_node_id?: string | null;
}

function filterFor(key: ConversationKey) {
  return {
    subscriber_id: key.subscriber_id,
    source_type: key.source_type,
    source_id: key.source_id,
    flow_node_id: key.source_type === 'flow_step' ? (key.flow_node_id ?? null) : null,
  };
}

/**
 * On first send, place the conversation at "New" — but ONLY if it has no stage
 * yet (a later send must not reset an advanced deal back to New). No-op if a
 * label already exists.
 */
export async function seedStageOnSend(key: ConversationKey): Promise<void> {
  try {
    const { byName } = await loadStages();
    const target = byName.get('new');
    if (!target) return;
    await ConversationLabel.updateOne(
      filterFor(key),
      { $setOnInsert: { stage_id: target.id, history: [{ stage_id: target.id, at: new Date() }] } },
      { upsert: true },
    );
  } catch {
    /* best-effort: never break the send path */
  }
}

/**
 * Advance a conversation FORWARD to `targetStageName` (by stage order). Creates
 * the label at the target if none exists; otherwise only updates when the
 * current stage is earlier than the target (never downgrades/overwrites).
 */
export async function advanceStage(key: ConversationKey, targetStageName: string): Promise<void> {
  try {
    const { byName, orderById } = await loadStages();
    const target = byName.get(targetStageName.toLowerCase());
    if (!target) return;
    const filter = filterFor(key);
    const now = new Date();

    // Ids of every stage strictly EARLIER than the target — the only stages we
    // may move forward FROM. Encoding this in the update filter makes the move
    // ATOMIC: no read-then-write window, and concurrent events (e.g. a click→
    // Contacted racing an inbound reply→Replied) converge to the furthest stage
    // instead of clobbering each other.
    const earlierIds: string[] = [];
    for (const [id, order] of orderById) if (order < target.order) earlierIds.push(id);

    // 1) Create the label at the target if the conversation has none yet
    //    (no-op if one already exists, at any stage).
    await ConversationLabel.updateOne(
      filter,
      { $setOnInsert: { stage_id: target.id, history: [{ stage_id: target.id, at: now }] } },
      { upsert: true },
    );

    // 2) Move forward only when the current stage is an earlier one.
    if (earlierIds.length > 0) {
      await ConversationLabel.updateOne(
        { ...filter, stage_id: { $in: earlierIds } },
        {
          $set: { stage_id: target.id },
          $push: { history: { $each: [{ stage_id: target.id, at: now }], $slice: -50 } },
        },
      );
    }
  } catch {
    /* best-effort */
  }
}
