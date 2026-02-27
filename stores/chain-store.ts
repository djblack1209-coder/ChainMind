// Chain Discussion store: manages multi-agent chain discussions

import { create } from 'zustand';
import type { ChainAgent, ChainTurn, ChainDiscussion, ChainExecutionMode } from '@/lib/types';
import { storageGet, storageSet } from '@/lib/storage';

const STORAGE_KEY = 'chain-discussions';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ChainState {
  discussions: ChainDiscussion[];
  activeDiscussionId: string | null;
  loaded: boolean;

  loadDiscussions: () => Promise<void>;
  createDiscussion: (title: string, topic: string, agents: ChainAgent[], rounds: number, mode: ChainExecutionMode) => string;
  deleteDiscussion: (id: string) => Promise<void>;
  setActiveDiscussion: (id: string) => void;
  addTurn: (discId: string, turn: ChainTurn) => void;
  updateTurn: (discId: string, turnId: string, partial: Partial<ChainTurn>) => void;
  setDiscussionStatus: (discId: string, status: ChainDiscussion['status']) => void;
  setCurrentRound: (discId: string, round: number) => void;
  updateAgents: (discId: string, agents: ChainAgent[]) => void;
  saveDiscussions: () => Promise<void>;
}

export const useChainStore = create<ChainState>()((set, get) => ({
  discussions: [],
  activeDiscussionId: null,
  loaded: false,

  loadDiscussions: async () => {
    try {
      const stored = await storageGet<ChainDiscussion[]>(STORAGE_KEY);
      if (stored && stored.length > 0) {
        set({ discussions: stored, activeDiscussionId: stored[0].id, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  createDiscussion: (title, topic, agents, rounds, mode) => {
    const id = genId('chain');
    const disc: ChainDiscussion = {
      id,
      title,
      topic,
      agents,
      turns: [],
      rounds,
      currentRound: 0,
      mode,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      discussions: [disc, ...s.discussions],
      activeDiscussionId: id,
    }));
    get().saveDiscussions();
    return id;
  },

  deleteDiscussion: async (id) => {
    const discs = get().discussions.filter((d) => d.id !== id);
    const activeId = get().activeDiscussionId === id
      ? (discs[0]?.id || null)
      : get().activeDiscussionId;
    set({ discussions: discs, activeDiscussionId: activeId });
    await storageSet(STORAGE_KEY, discs);
  },

  setActiveDiscussion: (id) => set({ activeDiscussionId: id }),

  addTurn: (discId, turn) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId
          ? { ...d, turns: [...d.turns, turn], updatedAt: Date.now() }
          : d
      ),
    }));
  },

  updateTurn: (discId, turnId, partial) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId
          ? {
              ...d,
              turns: d.turns.map((t) => t.id === turnId ? { ...t, ...partial } : t),
              updatedAt: Date.now(),
            }
          : d
      ),
    }));
  },

  setDiscussionStatus: (discId, status) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, status, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  setCurrentRound: (discId, round) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, currentRound: round, updatedAt: Date.now() } : d
      ),
    }));
  },

  updateAgents: (discId, agents) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === discId ? { ...d, agents, updatedAt: Date.now() } : d
      ),
    }));
    get().saveDiscussions();
  },

  saveDiscussions: async () => {
    await storageSet(STORAGE_KEY, get().discussions);
  },
}));
