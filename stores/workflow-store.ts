// Workflow store — save/load/rename/delete multiple workflows with IndexedDB

import { create } from 'zustand';
import { storageGet, storageSet } from '@/lib/storage';
import { useFlowStore } from './flow-store';
import type { Node, Edge } from 'reactflow';
import type { AINodeData } from '@/lib/types';

export interface Workflow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: Node<AINodeData>[];
  edges: Edge[];
  globalFacts: string;
}

interface WorkflowState {
  workflows: Workflow[];
  activeId: string | null;
  loaded: boolean;

  loadWorkflows: () => Promise<void>;
  createWorkflow: (name?: string) => Promise<string>;
  saveCurrentWorkflow: () => Promise<void>;
  loadWorkflow: (id: string) => void;
  renameWorkflow: (id: string, name: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  duplicateWorkflow: (id: string) => Promise<string>;
}

const STORAGE_KEY = 'workflows';

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  workflows: [],
  activeId: null,
  loaded: false,

  loadWorkflows: async () => {
    const stored = await storageGet<Workflow[]>(STORAGE_KEY);
    if (stored && stored.length > 0) {
      set({ workflows: stored, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  createWorkflow: async (name?: string) => {
    const id = generateId();
    const wf: Workflow = {
      id,
      name: name || `工作流 ${get().workflows.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      globalFacts: '',
    };
    const workflows = [...get().workflows, wf];
    set({ workflows, activeId: id });
    await storageSet(STORAGE_KEY, workflows);

    // Reset flow store
    const flow = useFlowStore.getState();
    flow.resetAllNodeStatus();
    useFlowStore.setState({ nodes: [], edges: [], globalFacts: '', selectedNodeId: null, userInput: '' });

    return id;
  },

  saveCurrentWorkflow: async () => {
    const { activeId, workflows } = get();
    if (!activeId) return;

    const flow = useFlowStore.getState();
    const updated = workflows.map((wf) =>
      wf.id === activeId
        ? { ...wf, nodes: flow.nodes, edges: flow.edges, globalFacts: flow.globalFacts, updatedAt: Date.now() }
        : wf
    );
    set({ workflows: updated });
    await storageSet(STORAGE_KEY, updated);
  },

  loadWorkflow: (id: string) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return;

    set({ activeId: id });
    useFlowStore.setState({
      nodes: wf.nodes,
      edges: wf.edges,
      globalFacts: wf.globalFacts,
      selectedNodeId: null,
      userInput: '',
      isExecuting: false,
    });
  },

  renameWorkflow: async (id: string, name: string) => {
    const updated = get().workflows.map((wf) =>
      wf.id === id ? { ...wf, name, updatedAt: Date.now() } : wf
    );
    set({ workflows: updated });
    await storageSet(STORAGE_KEY, updated);
  },

  deleteWorkflow: async (id: string) => {
    const updated = get().workflows.filter((wf) => wf.id !== id);
    const newActive = get().activeId === id ? (updated[0]?.id || null) : get().activeId;
    set({ workflows: updated, activeId: newActive });
    await storageSet(STORAGE_KEY, updated);

    if (newActive) {
      get().loadWorkflow(newActive);
    } else {
      useFlowStore.setState({ nodes: [], edges: [], globalFacts: '', selectedNodeId: null });
    }
  },

  duplicateWorkflow: async (id: string) => {
    const source = get().workflows.find((wf) => wf.id === id);
    if (!source) return '';

    const newId = generateId();
    const dup: Workflow = {
      ...source,
      id: newId,
      name: `${source.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const workflows = [...get().workflows, dup];
    set({ workflows });
    await storageSet(STORAGE_KEY, workflows);
    return newId;
  },
}));
