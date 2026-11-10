import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Node,
  type Edge,
  BackgroundVariant,
  ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow-dark.css';

import TriggerNode from './nodes/TriggerNode';
import EmailNode from './nodes/EmailNode';
import DelayNode from './nodes/DelayNode';
import ConditionNode from './nodes/ConditionNode';
import ABSplitNode from './nodes/ABSplitNode';
import TagNode from './nodes/TagNode';
import WebhookNode from './nodes/WebhookNode';
import ExitNode from './nodes/ExitNode';
import DeletableEdge from './DeletableEdge';

const nodeTypes = {
  trigger: TriggerNode,
  sendEmail: EmailNode,
  delay: DelayNode,
  condition: ConditionNode,
  abSplit: ABSplitNode,
  addTag: TagNode,
  removeTag: TagNode,
  webhook: WebhookNode,
  exit: ExitNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultEdgeOptions = {
  type: 'deletable',
  animated: true,
  style: { stroke: '#52525b', strokeWidth: 1.5 },
};

const miniMapNodeColor = (node: Node) => {
  const colors: Record<string, string> = {
    trigger: '#10b981',
    sendEmail: '#3b82f6',
    delay: '#64748b',
    condition: '#f59e0b',
    abSplit: '#8b5cf6',
    addTag: '#f97316',
    removeTag: '#f43f5e',
    webhook: '#14b8a6',
    exit: '#ef4444',
  };
  return colors[node.type || ''] || '#52525b';
};

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onNodeClick: (nodeId: string) => void;
  onPaneClick?: () => void;
}

export default function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick, onPaneClick }: FlowCanvasProps) {
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const newNodes = applyNodeChanges(changes, nodes);
      onNodesChange(newNodes as Node[]);
    },
    [nodes, onNodesChange]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const newEdges = applyEdgeChanges(changes, edges);
      onEdgesChange(newEdges as Edge[]);
    },
    [edges, onEdgesChange]
  );

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      const newEdges = addEdge(
        {
          ...connection,
          id: `e-${Date.now()}`,
          type: 'deletable',
          animated: true,
          style: { stroke: '#52525b', strokeWidth: 1.5 },
        },
        edges
      );
      onEdgesChange(newEdges as Edge[]);
    },
    [edges, onEdgesChange]
  );

  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handlePaneClick = useCallback(() => {
    onPaneClick?.();
  }, [onPaneClick]);

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  return (
    <div
      className="w-full h-full"
      style={{
        background: `
          radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.04) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(139, 92, 246, 0.04) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 80%, rgba(16, 185, 129, 0.03) 0%, transparent 50%),
          #0a0a0b
        `,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={memoizedNodeTypes}
        edgeTypes={memoizedEdgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode="Delete"
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: '#60a5fa', strokeWidth: 2 }}
        className="flow-dark"
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[16, 16]}
        edgesFocusable
        elementsSelectable
      >
        <Controls showInteractive={false} />
        <Background
          variant={BackgroundVariant.Lines}
          gap={12}
          size={0.4}
          color="#1e1e22"
        />
        <Background
          id="bg-2"
          variant={BackgroundVariant.Lines}
          gap={96}
          size={0.6}
          color="#252529"
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(9, 9, 11, 0.8)"
          style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
