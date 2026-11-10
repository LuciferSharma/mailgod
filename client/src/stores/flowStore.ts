import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';

interface FlowStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node) => void;
  updateNode: (id: string, data: any) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    })),
  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),
  selectNode: (id) => set({ selectedNodeId: id }),
  onNodesChange: () => {},
  onEdgesChange: () => {},
}));
