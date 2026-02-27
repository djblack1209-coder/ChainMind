import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

const flowSetStateMock = vi.fn();
const flowGetStateMock = vi.fn(() => ({
  resetAllNodeStatus: vi.fn(),
  nodes: [],
  edges: [],
  globalFacts: '',
}));

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

describe('workflow-store loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    storageSetMock.mockResolvedValue(undefined);
  });

  it('loads persisted workflows and marks loaded', async () => {
    const persisted = [{
      id: 'wf-1',
      name: 'Workflow 1',
      createdAt: 1,
      updatedAt: 1,
      nodes: [],
      edges: [],
      globalFacts: '',
    }];
    storageGetMock.mockResolvedValue(persisted);

    const { useWorkflowStore } = await import('../stores/workflow-store');
    await useWorkflowStore.getState().loadWorkflows();

    expect(useWorkflowStore.getState().loaded).toBe(true);
    expect(useWorkflowStore.getState().workflows).toEqual(persisted);
  });

  it('marks loaded when workflow storage read fails', async () => {
    storageGetMock.mockRejectedValue(new Error('storage error'));

    const { useWorkflowStore } = await import('../stores/workflow-store');

    await expect(useWorkflowStore.getState().loadWorkflows()).resolves.toBeUndefined();
    expect(useWorkflowStore.getState().loaded).toBe(true);
    expect(useWorkflowStore.getState().workflows).toEqual([]);
  });
});
