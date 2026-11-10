import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities/email';

const {
  sendFlowEmail,
  evaluateCondition,
  updateSubscriberProfile,
  addSubscriberTag,
  removeSubscriberTag,
  updateFlowExecution,
  sendWebhookRequest,
  subscriberRepliedToFlow,
  flowExitOnReplyEnabled,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: { maximumAttempts: 3 },
});

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface FlowExecutionInput {
  flowId: string;
  subscriberId: string;
  executionId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export async function executeFlow(input: FlowExecutionInput): Promise<void> {
  const { flowId, subscriberId, executionId, nodes, edges } = input;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const triggerNode = nodes.find(n => n.type === 'trigger');

  if (!triggerNode) return;

  await walkNode(triggerNode.id);

  async function walkNode(nodeId: string): Promise<void> {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    await updateFlowExecution({
      executionId,
      nodeId,
      action: `entering_${node.type}`,
    });

    switch (node.type) {
      case 'trigger':
        break;

      case 'sendEmail': {
        // Exit-on-reply gate: if user replied to any earlier flow email,
        // pull them out before sending the next scheduled message.
        const exitOnReply = await flowExitOnReplyEnabled(flowId);
        if (exitOnReply) {
          const replied = await subscriberRepliedToFlow({ subscriberId, flowId });
          if (replied) {
            await updateFlowExecution({
              executionId,
              nodeId,
              action: 'exit_on_reply',
              status: 'exited',
            });
            return;  // hard stop — don't follow edges
          }
        }
        await sendFlowEmail({
          subscriberId,
          templateId: node.data.templateId,
          flowId,
          flowNodeId: nodeId,
          flowExecutionId: executionId,
          variables: node.data.variables,
        });
        break;
      }

      case 'delay': {
        const delayMs = getDelayMs(node.data.delay);
        await sleep(delayMs);
        break;
      }

      case 'condition': {
        const result = await evaluateCondition({
          subscriberId,
          condition: node.data.condition,
        });

        const handle = result ? 'true' : 'false';
        const nextEdge = edges.find(e => e.source === nodeId && e.sourceHandle === handle);

        await updateFlowExecution({
          executionId,
          nodeId,
          action: 'condition_evaluated',
          result: { condition: node.data.condition, result },
        });

        if (nextEdge) {
          await walkNode(nextEdge.target);
        }
        return;
      }

      case 'abSplit': {
        const percentage = node.data.splitPercentage || 50;
        const random = Math.random() * 100;
        const handle = random < percentage ? 'a' : 'b';

        const nextEdge = edges.find(e => e.source === nodeId && e.sourceHandle === handle);

        await updateFlowExecution({
          executionId,
          nodeId,
          action: 'ab_split',
          result: { percentage, random, path: handle },
        });

        if (nextEdge) {
          await walkNode(nextEdge.target);
        }
        return;
      }

      case 'updateProfile':
        await updateSubscriberProfile({
          subscriberId,
          updates: node.data.attributes || {},
        });
        break;

      case 'addTag':
        if (node.data.tag) {
          await addSubscriberTag({ subscriberId, tag: node.data.tag });
        }
        break;

      case 'removeTag':
        if (node.data.tag) {
          await removeSubscriberTag({ subscriberId, tag: node.data.tag });
        }
        break;

      case 'webhook':
        if (node.data.webhookUrl) {
          await sendWebhookRequest({
            url: node.data.webhookUrl,
            payload: { subscriberId, flowId, nodeId, timestamp: new Date().toISOString() },
          });
        }
        break;

      case 'exit':
        await updateFlowExecution({
          executionId,
          nodeId,
          action: 'exit',
          status: 'completed',
        });
        return;
    }

    const nextEdges = edges.filter(e => e.source === nodeId && !e.sourceHandle);
    if (nextEdges.length > 0) {
      await walkNode(nextEdges[0].target);
    } else {
      await updateFlowExecution({
        executionId,
        nodeId,
        action: 'flow_end',
        status: 'completed',
      });
    }
  }
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
