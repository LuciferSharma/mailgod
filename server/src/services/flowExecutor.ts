import { Flow, IFlow } from '../models/flow';
import { FlowExecution } from '../models/flowExecution';
import { Subscriber } from '../models/subscriber';
import { Message } from '../models/message';
import { ScheduledFlowStep } from '../models/scheduledFlowStep';
import { sendEmail } from './emailService';

/**
 * Durable in-process flow executor.
 *
 * Walks the flow graph iteratively. At a delay node, persists a
 * ScheduledFlowStep and returns — the step is later claimed by the
 * scheduledFlowStepProcessor cron job and execution resumes from where
 * it left off. Survives deploys/restarts.
 */

export async function executeFlowInProcess(flowId: string, subscriberId: string): Promise<void> {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('Flow not found');

  const subscriber = await Subscriber.findById(subscriberId);
  if (!subscriber || subscriber.status !== 'active') return;

  const execution = await FlowExecution.create({
    flow_id: flowId,
    subscriber_id: subscriberId,
    status: 'running',
    entered_at: new Date(),
  });

  const triggerNode = flow.nodes.find(n => n.type === 'trigger');
  if (!triggerNode) {
    await FlowExecution.findByIdAndUpdate(execution._id, { status: 'failed' });
    return;
  }

  await walkFromNode(flow, execution._id.toString(), subscriberId, triggerNode.id);
}

/**
 * Resume an execution from a previously-scheduled step. Called by the
 * scheduled step processor cron after a delay matures.
 */
export async function resumeFlowFromNode(
  flowId: string,
  executionId: string,
  subscriberId: string,
  nodeId: string
): Promise<void> {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('Flow not found');
  await walkFromNode(flow, executionId, subscriberId, nodeId);
}

async function walkFromNode(
  flow: IFlow,
  executionId: string,
  subscriberId: string,
  startNodeId: string
): Promise<void> {
  const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
  const edgeMap = new Map<string, typeof flow.edges>();
  for (const edge of flow.edges) {
    const existing = edgeMap.get(edge.source) || [];
    existing.push(edge);
    edgeMap.set(edge.source, existing);
  }

  let currentNodeId: string | null = startNodeId;

  try {
    while (currentNodeId) {
      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      // Subscriber still active?
      const currentSub = await Subscriber.findById(subscriberId).lean();
      if (!currentSub || currentSub.status !== 'active') {
        await FlowExecution.findByIdAndUpdate(executionId, {
          status: 'exited',
          completed_at: new Date(),
          $push: { history: { node_id: currentNodeId, action: 'exit_subscriber_inactive', timestamp: new Date() } },
        });
        return;
      }

      // Exit conditions
      if (flow.settings?.exit_conditions?.length) {
        let exited = false;
        for (const cond of flow.settings.exit_conditions) {
          if (evaluateCondition(currentSub, cond)) {
            await FlowExecution.findByIdAndUpdate(executionId, {
              status: 'exited',
              completed_at: new Date(),
              $push: { history: { node_id: currentNodeId, action: 'exit_condition_met', timestamp: new Date(), result: cond } },
            });
            exited = true;
            break;
          }
        }
        if (exited) return;
      }

      // Exit-on-reply
      if (flow.settings?.exit_on_reply !== false) {
        const replied = await Message.exists({
          source_type: 'flow_step',
          source_id: flow._id,
          subscriber_id: subscriberId,
          direction: 'inbound',
          is_auto_reply: { $ne: true },
        });
        if (replied) {
          await FlowExecution.findByIdAndUpdate(executionId, {
            status: 'exited',
            completed_at: new Date(),
            $push: { history: { node_id: currentNodeId, action: 'exit_on_reply', timestamp: new Date() } },
          });
          return;
        }
      }

      await FlowExecution.findByIdAndUpdate(executionId, {
        current_node_id: currentNodeId,
        $push: { history: { node_id: currentNodeId, action: `entering_${node.type}`, timestamp: new Date() } },
      });

      let nextNodeId: string | null = null;

      switch (node.type) {
        case 'trigger':
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;

        case 'sendEmail': {
          if (node.data.templateId) {
            const firstMessage = await Message.findOne({
              source_type: 'flow_step',
              source_id: flow._id,
              subscriber_id: subscriberId,
              direction: 'outbound',
            }).sort({ created_at: 1 }).select('rfc_message_id subject_override').lean();

            const parentRfcId = firstMessage?.rfc_message_id || null;
            let subjectOverride: string | undefined;
            if (firstMessage?.subject_override) {
              const base = firstMessage.subject_override;
              subjectOverride = base.toLowerCase().startsWith('re:') ? base : `Re: ${base}`;
            }

            const emailResult = await sendEmail({
              subscriberId,
              templateId: node.data.templateId,
              flowId: flow._id.toString(),
              flowNodeId: currentNodeId,
              flowExecutionId: executionId,
              variables: node.data.variables,
              inReplyToRfcId: parentRfcId,
              subjectOverride,
            });
            await FlowExecution.findByIdAndUpdate(executionId, {
              $push: { history: {
                node_id: currentNodeId,
                action: emailResult.success ? 'email_sent' : 'email_failed',
                timestamp: new Date(),
                result: emailResult.success ? { messageId: emailResult.messageId } : { error: emailResult.error },
              }},
            });
          }
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;
        }

        case 'delay': {
          const ms = getDelayMs(node.data.delay);
          const after = followDefaultEdge(edgeMap, currentNodeId);
          if (after && ms > 0) {
            const fireAt = new Date(Date.now() + ms);
            await ScheduledFlowStep.create({
              flow_execution_id: executionId,
              flow_id: flow._id,
              subscriber_id: subscriberId,
              next_node_id: after,
              fire_at: fireAt,
              status: 'pending',
            });
            await FlowExecution.findByIdAndUpdate(executionId, {
              $push: { history: {
                node_id: currentNodeId,
                action: 'delay_scheduled',
                timestamp: new Date(),
                result: { fire_at: fireAt, ms },
              }},
            });
            return; // STOP — scheduler will resume us at `after`
          }
          nextNodeId = after;
          break;
        }

        case 'condition': {
          const result = evaluateCondition(currentSub, node.data.condition);
          const handle = result ? 'true' : 'false';
          const edges: any[] = edgeMap.get(currentNodeId) || [];
          const nextEdge = edges.find((e: any) => e.sourceHandle === handle);
          nextNodeId = nextEdge?.target || null;
          break;
        }

        case 'abSplit': {
          const pct = node.data.splitPercentage || 50;
          const handle = Math.random() * 100 < pct ? 'a' : 'b';
          const edges: any[] = edgeMap.get(currentNodeId) || [];
          const nextEdge = edges.find((e: any) => e.sourceHandle === handle);
          nextNodeId = nextEdge?.target || null;
          break;
        }

        case 'updateProfile':
          if (node.data.attributes) {
            await Subscriber.findByIdAndUpdate(subscriberId, { $set: node.data.attributes });
          }
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;

        case 'addTag':
          if (node.data.tag) {
            await Subscriber.findByIdAndUpdate(subscriberId, { $addToSet: { tags: node.data.tag } });
          }
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;

        case 'removeTag':
          if (node.data.tag) {
            await Subscriber.findByIdAndUpdate(subscriberId, { $pull: { tags: node.data.tag } });
          }
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;

        case 'webhook':
          if (node.data.webhookUrl) {
            try {
              await fetch(node.data.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriberId, flowId: flow._id.toString(), nodeId: currentNodeId, timestamp: new Date().toISOString() }),
              });
            } catch (err) {
              console.warn('Webhook failed:', err);
            }
          }
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
          break;

        case 'exit':
          nextNodeId = null;
          break;

        default:
          nextNodeId = followDefaultEdge(edgeMap, currentNodeId);
      }

      currentNodeId = nextNodeId;
    }

    await FlowExecution.findByIdAndUpdate(executionId, {
      status: 'completed',
      completed_at: new Date(),
    });
  } catch (error) {
    console.error(`Flow execution error [${flow._id}/${subscriberId}]:`, error);
    await FlowExecution.findByIdAndUpdate(executionId, { status: 'failed' });
  }
}

function followDefaultEdge(edgeMap: Map<string, any[]>, nodeId: string): string | null {
  const edges = edgeMap.get(nodeId) || [];
  const next = edges.find((e: any) => !e.sourceHandle);
  return next?.target || null;
}

function getDelayMs(delay?: { value: number; unit: string }): number {
  if (!delay) return 0;
  switch (delay.unit) {
    case 'minutes': return delay.value * 60_000;
    case 'hours': return delay.value * 3600_000;
    case 'days': return delay.value * 86400_000;
    default: return delay.value * 1000;
  }
}

function evaluateCondition(subscriber: any, condition: any): boolean {
  if (!condition?.field) return false;
  const value = getNestedValue(subscriber, condition.field);
  switch (condition.operator) {
    case 'equals': return value == condition.value;
    case 'not_equals': return value != condition.value;
    case 'contains': return String(value || '').toLowerCase().includes(String(condition.value).toLowerCase());
    case 'gt': return Number(value) > Number(condition.value);
    case 'gte': return Number(value) >= Number(condition.value);
    case 'lt': return Number(value) < Number(condition.value);
    case 'lte': return Number(value) <= Number(condition.value);
    case 'in': return Array.isArray(condition.value) ? condition.value.includes(value) : false;
    case 'exists': return value !== null && value !== undefined;
    case 'not_exists': return value === null || value === undefined;
    default: return false;
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
