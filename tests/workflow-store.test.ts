import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

const resetAllNodeStatusMock = vi.fn();
const flowState = {
  resetAllNodeStatus: resetAllNodeStatusMock,
  nodes: [] as any[],
  edges: [] as any[],
  globalFacts: '',
};
const flowSetStateMock = vi.fn();
const flowGetStateMock = vi.fn(() => flowState);

vi.mock('../lib/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

vi.mock('../stores/flow-store', () => ({
  useFlowStore: {
    getState: flowGetStateMock,
    setState: flowSetStateMock,
  },
}));

function makeWorkflow(id: string, name = 'Workflow'): any {
  return {
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
    nodes: [],
    edges: [],
    globalFacts: '',
  };
}

describe('workflow-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    storageGetMock.mockResolvedValue(undefined);
    storageSetMock.mockResolvedValue(undefined);
    flowState.nodes = [];
    flowState.edges = [];
    flowState.globalFacts = '';
  });

  it('loads persisted workflows, sets activeId, and marks loaded', async () => {
    const persisted = [makeWorkflow('wf-1', 'Workflow 1')];
    storageGetMock.mockResolvedValue(persisted);

    const { useWorkflowStore } = await import('../stores/workflow-store');
    await useWorkflowStore.getState().loadWorkflows();

    expect(useWorkflowStore.getState().loaded).toBe(true);
    expect(useWorkflowStore.getState().activeId).toBe('wf-1');
    expect(useWorkflowStore.getState().workflows).toEqual(persisted);
  });

  it('marks loaded when workflow storage read fails', async () => {
    storageGetMock.mockRejectedValue(new Error('storage error'));

    const { useWorkflowStore } = await import('../stores/workflow-store');

    await expect(useWorkflowStore.getState().loadWorkflows()).resolves.toBeUndefined();
    expect(useWorkflowStore.getState().loaded).toBe(true);
    expect(useWorkflowStore.getState().workflows).toEqual([]);
  });

  it('creates a workflow, persists it, and resets flow state', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    const createdId = await useWorkflowStore.getState().createWorkflow('Alpha');

    expect(useWorkflowStore.getState().activeId).toBe(createdId);
    expect(useWorkflowStore.getState().workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdId,
          name: 'Alpha',
          nodes: [],
          edges: [],
          globalFacts: '',
        }),
      ])
    );
    expect(storageSetMock).toHaveBeenCalledWith(
      'workflows',
      expect.arrayContaining([
        expect.objectContaining({ id: createdId, name: 'Alpha' }),
      ])
    );
    expect(resetAllNodeStatusMock).toHaveBeenCalledTimes(1);
    expect(flowSetStateMock).toHaveBeenCalledWith({
      nodes: [],
      edges: [],
      globalFacts: '',
      selectedNodeId: null,
      userInput: '',
      isExecuting: false,
    });
  });

  it('saves active workflow with latest flow snapshot', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    useWorkflowStore.setState({
      workflows: [makeWorkflow('wf-1', 'Alpha')],
      activeId: 'wf-1',
      loaded: true,
    });
    flowState.nodes = [{ id: 'node-1' }];
    flowState.edges = [{ id: 'edge-1' }];
    flowState.globalFacts = 'latest facts';

    await useWorkflowStore.getState().saveCurrentWorkflow();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'workflows',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'wf-1',
          nodes: [{ id: 'node-1' }],
          edges: [{ id: 'edge-1' }],
          globalFacts: 'latest facts',
        }),
      ])
    );
  });

  it('loads selected workflow into flow store', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    useWorkflowStore.setState({
      workflows: [
        {
          ...makeWorkflow('wf-1', 'Alpha'),
          nodes: [{ id: 'node-1' }],
          edges: [{ id: 'edge-1' }],
          globalFacts: 'from workflow',
        },
      ],
      activeId: null,
      loaded: true,
    });

    useWorkflowStore.getState().loadWorkflow('wf-1');

    expect(useWorkflowStore.getState().activeId).toBe('wf-1');
    expect(flowSetStateMock).toHaveBeenCalledWith({
      nodes: [{ id: 'node-1' }],
      edges: [{ id: 'edge-1' }],
      globalFacts: 'from workflow',
      selectedNodeId: null,
      userInput: '',
      isExecuting: false,
    });
  });

  it('deletes active workflow and falls back to first remaining workflow', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    useWorkflowStore.setState({
      workflows: [
        {
          ...makeWorkflow('wf-1', 'Alpha'),
          nodes: [{ id: 'alpha-node' }],
          globalFacts: 'alpha',
        },
        {
          ...makeWorkflow('wf-2', 'Beta'),
          nodes: [{ id: 'beta-node' }],
          globalFacts: 'beta',
        },
      ],
      activeId: 'wf-1',
      loaded: true,
    });

    await useWorkflowStore.getState().deleteWorkflow('wf-1');

    expect(useWorkflowStore.getState().activeId).toBe('wf-2');
    expect(storageSetMock).toHaveBeenCalledWith(
      'workflows',
      expect.arrayContaining([expect.objectContaining({ id: 'wf-2' })])
    );
    expect(flowSetStateMock).toHaveBeenCalledWith({
      nodes: [{ id: 'beta-node' }],
      edges: [],
      globalFacts: 'beta',
      selectedNodeId: null,
      userInput: '',
      isExecuting: false,
    });
  });

  it('deletes last workflow and clears flow state', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    useWorkflowStore.setState({
      workflows: [makeWorkflow('wf-1', 'Alpha')],
      activeId: 'wf-1',
      loaded: true,
    });

    await useWorkflowStore.getState().deleteWorkflow('wf-1');

    expect(useWorkflowStore.getState().activeId).toBeNull();
    expect(useWorkflowStore.getState().workflows).toEqual([]);
    expect(flowSetStateMock).toHaveBeenCalledWith({
      nodes: [],
      edges: [],
      globalFacts: '',
      selectedNodeId: null,
      userInput: '',
      isExecuting: false,
    });
  });

  it('duplicates workflow and persists copy', async () => {
    const { useWorkflowStore } = await import('../stores/workflow-store');

    useWorkflowStore.setState({
      workflows: [makeWorkflow('wf-1', 'Alpha')],
      activeId: 'wf-1',
      loaded: true,
    });

    const duplicatedId = await useWorkflowStore.getState().duplicateWorkflow('wf-1');

    expect(duplicatedId).toBeTruthy();
    expect(duplicatedId).not.toBe('wf-1');
    expect(useWorkflowStore.getState().workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'wf-1', name: 'Alpha' }),
        expect.objectContaining({ id: duplicatedId, name: 'Alpha (副本)' }),
      ])
    );
    expect(storageSetMock).toHaveBeenCalledWith(
      'workflows',
      expect.arrayContaining([
        expect.objectContaining({ id: duplicatedId, name: 'Alpha (副本)' }),
      ])
    );
  });
});
