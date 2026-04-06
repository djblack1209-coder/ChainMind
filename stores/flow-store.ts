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
import { DEFAULT_CONDITION_DATA, type ConditionNodeData } from '@/components/flow/ConditionNode';
import { DEFAULT_HUMAN_REVIEW_DATA, type HumanReviewNodeData } from '@/components/flow/HumanReviewNode';
import { DEFAULT_CODE_DATA, type CodeNodeData } from '@/components/flow/CodeNode';
import { DEFAULT_HTTP_REQUEST_DATA, type HttpRequestNodeData } from '@/components/flow/HttpRequestNode';
import { DEFAULT_LOOP_DATA, type LoopNodeData } from '@/components/flow/LoopNode';
import type { NodeType } from '@/lib/flow-nodes';
import { persistIndexedDB } from './persist-middleware';

type AnyNodeData = AINodeData | ConditionNodeData | HumanReviewNodeData | CodeNodeData | HttpRequestNodeData | LoopNodeData;

interface FlowState {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  globalFacts: string;
  userInput: string;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (position: { x: number; y: number }, nodeType?: NodeType) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<AnyNodeData>) => void;
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

      addNode: (position, nodeType = 'ai') => {
        nodeCounter++;
        const id = `node_${Date.now()}_${nodeCounter}`;

        const typeMap: Record<NodeType, { rfType: string; data: AnyNodeData }> = {
          ai: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `AI 节点 ${nodeCounter}` } },
          condition: { rfType: 'conditionNode', data: { ...DEFAULT_CONDITION_DATA, label: `条件 ${nodeCounter}` } },
          human_review: { rfType: 'humanReviewNode', data: { ...DEFAULT_HUMAN_REVIEW_DATA, label: `审核 ${nodeCounter}` } },
          input: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `输入 ${nodeCounter}` } },
          output: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `输出 ${nodeCounter}` } },
          transform: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `转换 ${nodeCounter}` } },
          merge: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `合并 ${nodeCounter}` } },
          code: { rfType: 'codeNode', data: { ...DEFAULT_CODE_DATA, label: `代码 ${nodeCounter}` } },
          template: { rfType: 'aiNode', data: { ...DEFAULT_NODE_DATA, label: `模板 ${nodeCounter}` } },
          http_request: { rfType: 'httpRequestNode', data: { ...DEFAULT_HTTP_REQUEST_DATA, label: `HTTP ${nodeCounter}` } },
          loop: { rfType: 'loopNode', data: { ...DEFAULT_LOOP_DATA, label: `循环 ${nodeCounter}` } },
        };

        const entry = typeMap[nodeType] || typeMap.ai;
        const newNode: Node<AnyNodeData> = {
          id,
          type: entry.rfType,
          position,
          data: entry.data,
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
            n.id === id ? ({ ...n, data: { ...n.data, ...data } } as Node<AnyNodeData>) : n
          ),
        });
      },

      setSelectedNode: (id) => set({ selectedNodeId: id }),
      setIsExecuting: (v) => set({ isExecuting: v }),
      setGlobalFacts: (v) => set({ globalFacts: v }),
      setUserInput: (v) => set({ userInput: v }),

      resetAllNodeStatus: () => {
        set({
          nodes: get().nodes.map((n) => {
            const base = { status: 'idle' as const, error: '' };
            if (n.type === 'conditionNode') {
              return { ...n, data: { ...n.data, ...base, result: undefined, reason: undefined } };
            }
            if (n.type === 'humanReviewNode') {
              return { ...n, data: { ...n.data, ...base, draft: undefined, editedContent: undefined, reviewerNote: undefined } };
            }
            return { ...n, data: { ...n.data, ...base, output: '', tokenCount: 0, latencyMs: 0 } };
          }) as Node<AnyNodeData>[],
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
