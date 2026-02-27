// Flow store: manages React Flow nodes, edges, and execution state

import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from 'reactflow';
import type { AINodeData } from '@/lib/types';
import { DEFAULT_NODE_DATA } from '@/lib/types';
import { persistIndexedDB } from './persist-middleware';

interface FlowState {
  nodes: Node<AINodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  globalFacts: string;
  userInput: string;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<AINodeData>) => void;
  setSelectedNode: (id: string | null) => void;
  setIsExecuting: (v: boolean) => void;
  setGlobalFacts: (v: string) => void;
  setUserInput: (v: string) => void;
  resetAllNodeStatus: () => void;
}

let nodeCounter = Date.now(); // Use timestamp-based counter to avoid ID collisions with persisted nodes

export const useFlowStore = create<FlowState>()(
  persistIndexedDB(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isExecuting: false,
      globalFacts: '',
      userInput: '',

      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
      },

      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },

      onConnect: (connection) => {
        set({ edges: addEdge({ ...connection, animated: true }, get().edges) });
      },

      addNode: (position) => {
        nodeCounter++;
        const id = `node_${Date.now()}_${nodeCounter}`;
        const newNode: Node<AINodeData> = {
          id,
          type: 'aiNode',
          position,
          data: { ...DEFAULT_NODE_DATA, label: `节点 ${nodeCounter}` },
        };
        set({ nodes: [...get().nodes, newNode] });
      },

      removeNode: (id) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
        });
      },

      updateNodeData: (id, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
          ),
        });
      },

      setSelectedNode: (id) => set({ selectedNodeId: id }),
      setIsExecuting: (v) => set({ isExecuting: v }),
      setGlobalFacts: (v) => set({ globalFacts: v }),
      setUserInput: (v) => set({ userInput: v }),

      resetAllNodeStatus: () => {
        set({
          nodes: get().nodes.map((n) => ({
            ...n,
            data: { ...n.data, status: 'idle', output: '', error: '', tokenCount: 0, latencyMs: 0 },
          })),
        });
      },
    }),
    {
      name: 'flow-state',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        globalFacts: state.globalFacts,
      }),
    }
  )
);
