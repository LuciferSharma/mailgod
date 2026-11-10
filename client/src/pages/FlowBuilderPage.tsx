import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flowApi } from '../api';
import FlowCanvas from '../components/flows/FlowCanvas';
import NodePalette from '../components/flows/NodePalette';
import NodeConfigPanel from '../components/flows/NodeConfigPanel';
import FlowExecutionsPanel from '../components/flows/FlowExecutionsPanel';
import EnrollSegmentModal from '../components/flows/EnrollSegmentModal';
import { ArrowLeft, Save, Play, Pause, Loader2, Workflow, Users, Undo2, Redo2, Copy, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Node, Edge } from '@xyflow/react';

type HistoryEntry = { nodes: Node[]; edges: Edge[] };
const MAX_HISTORY = 30;

export default function FlowBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState('');
  const [exitOnReply, setExitOnReply] = useState(true);
  const [enrollmentSpread, setEnrollmentSpread] = useState(10);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [flowStatus, setFlowStatus] = useState<string>('draft');
  const [showExecutions, setShowExecutions] = useState(false);

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((n: Node[], e: Edge[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const idx = historyIndexRef.current;
    const stack = historyRef.current.slice(0, idx + 1);
    stack.push({ nodes: JSON.parse(JSON.stringify(n)), edges: JSON.parse(JSON.stringify(e)) });
    if (stack.length > MAX_HISTORY) stack.shift();
    historyRef.current = stack;
    historyIndexRef.current = stack.length - 1;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    skipHistoryRef.current = true;
    setNodes(JSON.parse(JSON.stringify(entry.nodes)));
    setEdges(JSON.parse(JSON.stringify(entry.edges)));
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    skipHistoryRef.current = true;
    setNodes(JSON.parse(JSON.stringify(entry.nodes)));
    setEdges(JSON.parse(JSON.stringify(entry.edges)));
  }, []);

  const duplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    const newId = `${node.type}-${Date.now()}`;
    const newNode: Node = {
      ...JSON.parse(JSON.stringify(node)),
      id: newId,
      position: { x: node.position.x + 50, y: node.position.y + 80 },
      selected: false,
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newId);
    toast.success('Node duplicated');
  }, [selectedNodeId, nodes]);

  useEffect(() => {
    pushHistory(nodes, edges);
  }, [nodes, edges, pushHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateNode(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, duplicateNode]);

  const { data: flow, isLoading } = useQuery({
    queryKey: ['flow', id],
    queryFn: () => flowApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (flow) {
      setFlowName(flow.name);
      setExitOnReply(flow.settings?.exit_on_reply !== false);
      setEnrollmentSpread(flow.settings?.enrollment_spread_seconds ?? 10);
      setFlowStatus(flow.status);
      if (flow.nodes.length > 0) {
        setNodes(flow.nodes as any as Node[]);
        setEdges(flow.edges.map((e: any) => ({
          ...e,
          type: 'deletable',
          animated: true,
          style: { stroke: '#52525b', strokeWidth: 1.5 },
        })) as Edge[]);
      } else {
        setNodes([{
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 300, y: 50 },
          data: { label: 'Trigger', triggerType: 'manual' },
        } as Node]);
      }
    }
  }, [flow]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const triggerNode = nodes.find(n => n.type === 'trigger');
      const triggerData = triggerNode?.data || {};
      return flowApi.update(id!, {
        name: flowName,
        trigger: {
          type: (triggerData.triggerType || 'manual') as any,
          config: buildTriggerConfig(triggerData),
        },
        nodes: nodes.map(n => ({ id: n.id, type: n.type!, position: n.position, data: n.data })) as any,
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined, targetHandle: e.targetHandle || undefined })) as any,
        settings: { exit_on_reply: exitOnReply, enrollment_spread_seconds: enrollmentSpread } as any,
      });
    },
    onSuccess: () => {
      toast.success('Flow saved');
      queryClient.invalidateQueries({ queryKey: ['flow', id] });
    },
    onError: () => toast.error('Save failed'),
  });

  const activateMutation = useMutation({
    mutationFn: (reenroll?: boolean) => flowApi.activate(id!, reenroll),
    onSuccess: () => {
      setFlowStatus('active');
      toast.success('Flow activated');
      queryClient.invalidateQueries({ queryKey: ['flow', id] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => flowApi.pause(id!),
    onSuccess: () => {
      setFlowStatus('paused');
      toast.success('Flow paused');
      queryClient.invalidateQueries({ queryKey: ['flow', id] });
    },
  });

  const handleAddNode = useCallback((type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 300, y: (nodes.length + 1) * 120 },
      data: getDefaultData(type),
    };
    setNodes((prev) => [...prev, newNode]);
  }, [nodes]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleUpdateNode = useCallback((data: any) => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, ...data } } : n));
  }, [selectedNodeId]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-zinc-500 font-medium">Loading flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/flows')} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/15 rounded-lg">
              <Workflow className="w-4 h-4 text-blue-400" />
            </div>
            <input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="text-base font-bold text-zinc-100 border-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded px-2 py-1 bg-transparent hover:bg-zinc-800 transition-colors"
              placeholder="Untitled Flow"
            />
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
            flowStatus === 'active' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' :
            flowStatus === 'paused' ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' :
            'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700'
          }`}>{flowStatus}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 mr-1">
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Redo2 className="w-4 h-4" />
            </button>
            <button onClick={duplicateNode} disabled={!selectedNodeId} title="Duplicate (Ctrl+D)" className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          <div className="text-xs text-zinc-600 mr-2 tabular-nums">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} &middot; {edges.length} edge{edges.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={() => setExitOnReply(v => !v)}
            title={exitOnReply
              ? 'Subscribers exit this flow when they reply to any email (recommended). Click to disable.'
              : 'Subscribers will continue getting all flow emails even after replying. Click to enable exit-on-reply.'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              exitOnReply
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${exitOnReply ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            Exit on reply
          </button>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-zinc-400 border border-zinc-700 bg-zinc-800/50" title="Seconds between subscribers when bulk-enrolling a segment. Avoids burst-sending hundreds of emails in one second. 0 = instant (no spread).">
            <span className="text-zinc-500">Spread</span>
            <input
              type="number"
              min={0}
              max={3600}
              value={enrollmentSpread}
              onChange={e => setEnrollmentSpread(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 bg-transparent text-zinc-200 text-xs tabular-nums outline-none border-b border-transparent focus:border-emerald-500/50"
            />
            <span className="text-zinc-500">s</span>
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          {flowStatus === 'active' && (
              <button
                onClick={() => setShowEnrollModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border bg-zinc-800 text-emerald-400 border-zinc-700 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                title="Pick a segment to enroll into this flow"
              >
                <UserPlus className="w-4 h-4" /> Enroll Segment
              </button>
          )}
          <button
            onClick={() => setShowExecutions(!showExecutions)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              showExecutions
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            <Users className="w-4 h-4" /> Executions
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-all"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          {flowStatus !== 'active' ? (
            <button
              onClick={() => { saveMutation.mutate(); setTimeout(() => activateMutation.mutate(false), 500); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-500 transition-all shadow-sm shadow-emerald-900/30"
            >
              <Play className="w-4 h-4" /> Activate
            </button>
          ) : (
            <button
              onClick={() => pauseMutation.mutate()}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-500 transition-all shadow-sm shadow-amber-900/30"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <NodePalette onAddNode={handleAddNode} />

          <div className="flex-1">
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={setNodes}
              onEdgesChange={setEdges}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
            />
          </div>

          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={handleUpdateNode}
              onClose={() => setSelectedNodeId(null)}
              onDelete={handleDeleteNode}
            />
          )}
        </div>

        {showExecutions && id && (
          <FlowExecutionsPanel flowId={id} onClose={() => setShowExecutions(false)} />
        )}
      </div>

      {showEnrollModal && id && (
        <EnrollSegmentModal
          flowId={id}
          flowName={flowName || 'this flow'}
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={() => queryClient.invalidateQueries({ queryKey: ['flow', id] })}
        />
      )}
    </div>
  );
}

function buildTriggerConfig(data: Record<string, any>): Record<string, any> {
  switch (data.triggerType) {
    case 'scheduled':
      return {
        segmentId: data.segmentId || '',
        frequency: data.frequency || 'daily',
        time: data.scheduleTime || '09:00',
        dayOfWeek: data.scheduleDow || '1',
        dayOfMonth: data.scheduleDom || '1',
      };
    default:
      return {};
  }
}

function getDefaultData(type: string): Record<string, any> {
  switch (type) {
    case 'trigger': return { label: 'Trigger', triggerType: 'manual' };
    case 'sendEmail': return { label: 'Send Email', templateId: '', templateName: '', subject: '' };
    case 'delay': return { label: 'Delay', delay: { value: 1, unit: 'days' } };
    case 'condition': return { label: 'Condition', condition: { field: '', operator: 'equals', value: '' } };
    case 'abSplit': return { label: 'A/B Split', splitPercentage: 50 };
    case 'addTag': return { label: 'Add Tag', tag: '', action: 'add' };
    case 'removeTag': return { label: 'Remove Tag', tag: '', action: 'remove' };
    case 'webhook': return { label: 'Webhook', webhookUrl: '' };
    case 'exit': return { label: 'Exit' };
    default: return { label: type };
  }
}
