import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainAgent, ChainDiscussion, ChainTurn } from '../lib/types';

const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

vi.mock('../lib/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

function makeAgent(): ChainAgent {
  return {
    id: 'agent-1',
    name: 'Reviewer',
    role: 'Review content',
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 256,
    color: '#000000',
    icon: 'R',
    tools: [],
  };
}

function makeTurn(overrides: Partial<ChainTurn> = {}): ChainTurn {
  return {
    id: 'turn-1',
    agentId: 'agent-1',
    agentName: 'Reviewer',
    model: 'gpt-4o-mini',
    content: 'hello',
    tokenCount: 10,
    latencyMs: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDiscussion(): ChainDiscussion {
  return {
    id: 'disc-1',
    title: 'Test',
    topic: 'Topic',
    agents: [makeAgent()],
    turns: [],
    rounds: 2,
    currentRound: 0,
    mode: 'sequential',
    status: 'idle',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('chain-store persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storageGetMock.mockResolvedValue(undefined);
    storageSetMock.mockResolvedValue(undefined);
  });

  it('persists after addTurn', async () => {
    const { useChainStore } = await import('../stores/chain-store');

    useChainStore.setState({
      discussions: [makeDiscussion()],
      activeDiscussionId: 'disc-1',
      loaded: true,
    });

    useChainStore.getState().addTurn('disc-1', makeTurn());
    await Promise.resolve();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chain-discussions',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'disc-1',
          turns: expect.arrayContaining([
            expect.objectContaining({ id: 'turn-1', content: 'hello' }),
          ]),
        }),
      ])
    );
  });

  it('persists after updateTurn', async () => {
    const { useChainStore } = await import('../stores/chain-store');

    useChainStore.setState({
      discussions: [
        {
          ...makeDiscussion(),
          turns: [makeTurn()],
        },
      ],
      activeDiscussionId: 'disc-1',
      loaded: true,
    });

    useChainStore.getState().updateTurn('disc-1', 'turn-1', { content: 'updated' });
    await Promise.resolve();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chain-discussions',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'disc-1',
          turns: expect.arrayContaining([
            expect.objectContaining({ id: 'turn-1', content: 'updated' }),
          ]),
        }),
      ])
    );
  });

  it('persists after setCurrentRound', async () => {
    const { useChainStore } = await import('../stores/chain-store');

    useChainStore.setState({
      discussions: [makeDiscussion()],
      activeDiscussionId: 'disc-1',
      loaded: true,
    });

    useChainStore.getState().setCurrentRound('disc-1', 2);
    await Promise.resolve();

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith(
      'chain-discussions',
      expect.arrayContaining([
        expect.objectContaining({ id: 'disc-1', currentRound: 2 }),
      ])
    );
  });
});
